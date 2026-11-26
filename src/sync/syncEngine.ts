import type { Protocol } from '../planner.ts';
import { decodeProtocol } from '../protocol.ts';
import { decide, type RemoteRecord } from './syncDecision.ts';
import { SyncError, loginMessage, userMessage } from './syncErrors.ts';
import { BACKUP_KEY, PROTOCOL_KEY, loadMeta, saveMeta } from './syncMeta.ts';
import type { SyncApi } from './pbApi.ts';

export type SyncStatus = 'signed-out' | 'syncing' | 'synced' | 'pending' | 'offline' | 'error';
export type SyncState = { status: SyncStatus; message: string; email: string };

export type SyncDeps = {
  api: SyncApi;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  getProtocol: () => Protocol;
  // Appelé quand le distant remplace le local : l'UI met à jour son état (et donc le localStorage).
  applyRemote: (protocol: Protocol) => void;
  now?: () => number;
  debounceMs?: number;
};

const BACKUP_KEEP_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 300_000];

export function createSyncEngine(deps: SyncDeps) {
  const { api, storage, getProtocol, applyRemote } = deps;
  const now = deps.now ?? Date.now;
  const debounceMs = deps.debounceMs ?? 1500;
  let meta = loadMeta(storage);
  let state: SyncState = idleState();
  let running = false;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryStep = 0;
  const listeners = new Set<() => void>();

  function idleState(): SyncState {
    if (!api.isLoggedIn()) return { status: 'signed-out', message: '', email: '' };
    return { status: meta.pending ? 'pending' : 'synced', message: '', email: api.email() };
  }
  function setState(status: SyncStatus, message = '') {
    state = { status, message, email: api.isLoggedIn() ? api.email() : '' };
    listeners.forEach(l => l());
  }
  function persistMeta(next: typeof meta) { meta = next; saveMeta(storage, meta); }

  // Copie de secours du local avant qu'un pull l'écrase : seulement s'il a des modifications propres
  // (en attente, ou données d'avant la synchro, jamais synchronisées) et s'il diffère réellement du distant.
  // Une sauvegarde de moins de 24 h est conservée.
  function backupLocalIfNeeded(remote: Protocol) {
    try {
      if (!meta.pending && meta.clientUpdatedAt > 0) return;
      const raw = storage.getItem(PROTOCOL_KEY);
      if (!raw) return;
      const local: unknown = JSON.parse(raw);
      const decoded = decodeProtocol(local);
      if (decoded && JSON.stringify(decoded.protocol) === JSON.stringify(remote)) return;
      const previous = JSON.parse(storage.getItem(BACKUP_KEY) || 'null');
      if (previous && typeof previous.savedAt === 'number' && now() - previous.savedAt < BACKUP_KEEP_MS) return;
      storage.setItem(BACKUP_KEY, JSON.stringify({ savedAt: now(), protocol: local }));
    } catch { /* sauvegarde impossible : on continue, la synchro reste prioritaire */ }
  }

  // Enregistre l'état « envoyé » seulement si aucune modification locale n'est survenue pendant la requête.
  function markPushed(sentAt: number) {
    if (meta.clientUpdatedAt === sentAt) persistMeta({ clientUpdatedAt: sentAt, pending: false });
    else again = true;
  }

  async function applyDecision(remote: RemoteRecord, allowConflictRetry: boolean): Promise<void> {
    const d = decide(meta, remote);
    if (d.action === 'noop') { persistMeta({ ...meta, pending: false }); return; }
    if (d.action === 'invalid-remote') throw new SyncError('server', 'Les données distantes sont invalides ; elles n’ont pas été appliquées.');
    if (d.action === 'pull') {
      backupLocalIfNeeded(d.protocol);
      persistMeta({ clientUpdatedAt: remote!.clientUpdatedAt, pending: false });
      applyRemote(d.protocol);
      return;
    }
    const sentAt = meta.clientUpdatedAt || now();
    if (sentAt !== meta.clientUpdatedAt) persistMeta({ ...meta, clientUpdatedAt: sentAt });
    const snapshot = getProtocol();
    try {
      if (d.action === 'push') await api.update(remote!.id, snapshot, sentAt);
      else await api.create(snapshot, sentAt);
      markPushed(sentAt);
    } catch (e) {
      // Création concurrente (autre appareil) ou enregistrement supprimé (404 à l'update) : relire puis réappliquer la règle.
      if (!(e instanceof SyncError) || e.kind !== 'conflict' || !allowConflictRetry) throw e;
      const existing = await api.fetchRemote();
      if (!existing && d.action === 'create') throw new SyncError('server', 'Données refusées par le serveur (format ou taille).');
      await applyDecision(existing, false);
    }
  }

  async function cycle() {
    setState('syncing');
    try {
      await applyDecision(await api.fetchRemote(), true);
      retryStep = 0;
      setState(meta.pending ? 'pending' : 'synced');
    } catch (e) {
      const err = e instanceof SyncError ? e : null;
      if (err?.kind === 'auth') api.logout();
      else if (err?.kind === 'network' || err?.kind === 'server') scheduleRetry();
      setState(err?.kind === 'network' ? 'offline' : err?.kind === 'auth' ? 'signed-out' : 'error', userMessage(e));
    }
  }

  // Reprise automatique après un échec réseau ou serveur, avec délai croissant.
  function scheduleRetry() {
    clearTimeout(retryTimer);
    const delay = RETRY_DELAYS_MS[Math.min(retryStep, RETRY_DELAYS_MS.length - 1)];
    retryStep++;
    retryTimer = setTimeout(() => { void run(); }, delay);
  }

  // Session absente ou expirée alors que l'état ne le dit pas : on le signale (les modifications restent en attente).
  function checkSession(): boolean {
    if (api.isLoggedIn()) return true;
    clearTimeout(timer);
    clearTimeout(retryTimer);
    if (state.status !== 'signed-out') setState('signed-out', userMessage(new SyncError('auth', '')));
    return false;
  }

  async function refresh() {
    try { await api.refreshSession(); } catch { /* échec réseau toléré ; une session refusée est détectée par checkSession */ }
  }

  async function run(): Promise<void> {
    if (!checkSession()) return;
    clearTimeout(retryTimer);
    if (running) { again = true; return; }
    running = true;
    try {
      do { again = false; await cycle(); } while (again && api.isLoggedIn());
    } finally { running = false; }
  }

  return {
    getState: () => state,
    isBusy: () => running,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    // Au démarrage : rafraîchit la session (échec réseau toléré) puis synchronise.
    async start() {
      if (!api.isLoggedIn()) return;
      await refresh();
      await run();
    },
    async login(email: string, password: string) {
      try { await api.login(email, password); } catch (e) { setState('signed-out', loginMessage(e)); return; }
      await run();
    },
    logout() { clearTimeout(timer); clearTimeout(retryTimer); retryStep = 0; api.logout(); setState('signed-out'); },
    // À appeler après chaque modification faite par l'utilisateur (pas après un remplacement par le distant).
    localChanged() {
      persistMeta({ clientUpdatedAt: Math.max(now(), meta.clientUpdatedAt + 1), pending: true });
      if (!checkSession()) return;
      setState('pending');
      clearTimeout(timer);
      timer = setTimeout(() => { void run(); }, debounceMs);
    },
    // Retour de focus ou de connexion : rafraîchit la session, reprend les envois en attente et récupère le distant.
    async resume() {
      clearTimeout(timer);
      if (api.isLoggedIn()) await refresh();
      await run();
    },
    markOffline() { if (api.isLoggedIn()) setState('offline', userMessage(new SyncError('network', ''))); },
    // Démontage : annule les reprises programmées.
    dispose() { clearTimeout(timer); clearTimeout(retryTimer); listeners.clear(); },
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
