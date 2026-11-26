import { decide, type LocalSyncState, type RemoteRecord } from './syncDecision.ts';
import type { SyncDoc, SyncDocName } from './syncDocs.ts';
import { SyncError, loginMessage, userMessage } from './syncErrors.ts';
import { loadMeta, saveMeta } from './syncMeta.ts';
import type { SyncApi } from './pbApi.ts';

export type SyncStatus = 'signed-out' | 'syncing' | 'synced' | 'pending' | 'offline' | 'error';
export type DocState = { status: SyncStatus; message: string };
// `status` et `message` résument tous les documents ; `docs` donne le détail par document.
export type SyncState = { status: SyncStatus; message: string; email: string; docs: Partial<Record<SyncDocName, DocState>> };

export type SyncDeps = {
  api: SyncApi;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  docs: SyncDoc[];
  now?: () => number;
  debounceMs?: number;
};

const BACKUP_KEEP_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 300_000];
// Du plus prioritaire au moins prioritaire, pour résumer l'état de plusieurs documents.
const STATUS_RANK: SyncStatus[] = ['signed-out', 'error', 'offline', 'syncing', 'pending', 'synced'];

// État propre à un document : métadonnées locales, affichage, minuteur de debounce.
type Channel = { doc: SyncDoc; meta: LocalSyncState; status: SyncStatus; message: string; timer?: ReturnType<typeof setTimeout> };

export function createSyncEngine(deps: SyncDeps) {
  const { api, storage } = deps;
  const now = deps.now ?? Date.now;
  const debounceMs = deps.debounceMs ?? 1500;
  const channels: Channel[] = deps.docs.map(doc => {
    const meta = loadMeta(storage, doc.metaKey);
    return { doc, meta, status: !api.isLoggedIn() ? 'signed-out' : meta.pending ? 'pending' : 'synced', message: '' };
  });
  let running = false;
  let again = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryStep = 0;
  const listeners = new Set<() => void>();

  function setDoc(c: Channel, status: SyncStatus, message = '') { c.status = status; c.message = message; }
  function setAll(status: SyncStatus, message = '') { channels.forEach(c => setDoc(c, status, message)); emit(); }
  function emit() { listeners.forEach(l => l()); }
  function persistMeta(c: Channel, next: LocalSyncState) { c.meta = next; saveMeta(storage, next, c.doc.metaKey); }

  // Un message identique pour tous les documents est donné tel quel ; sinon chaque message est préfixé du document concerné.
  function summaryMessage(): string {
    const groups = new Map<string, Channel[]>();
    for (const c of channels) if (c.message) groups.set(c.message, [...(groups.get(c.message) ?? []), c]);
    return [...groups].map(([message, cs]) => cs.length === channels.length ? message : `${cs.map(c => c.doc.label).join(', ')} : ${message}`).join(' ');
  }
  function getState(): SyncState {
    const loggedIn = api.isLoggedIn();
    const status = !loggedIn ? 'signed-out' : STATUS_RANK.find(s => channels.some(c => c.status === s)) ?? 'synced';
    const docs: SyncState['docs'] = {};
    for (const c of channels) docs[c.doc.name] = { status: c.status, message: c.message };
    return { status, message: summaryMessage(), email: loggedIn ? api.email() : '', docs };
  }

  // Copie de secours du local avant qu'un pull l'écrase : seulement s'il a des modifications propres
  // (en attente, ou données d'avant la synchro, jamais synchronisées) et s'il diffère réellement du distant.
  // Une sauvegarde de moins de 24 h est conservée.
  function backupLocalIfNeeded(c: Channel, remote: unknown) {
    const { doc } = c;
    try {
      if (!c.meta.pending && c.meta.clientUpdatedAt > 0) return;
      const raw = storage.getItem(doc.storageKey);
      if (!raw) return;
      const local: unknown = JSON.parse(raw);
      const decoded = doc.decode(local);
      if (decoded && JSON.stringify(decoded) === JSON.stringify(remote)) return;
      const previous = JSON.parse(storage.getItem(doc.backupKey) || 'null');
      if (previous && typeof previous.savedAt === 'number' && now() - previous.savedAt < BACKUP_KEEP_MS) return;
      storage.setItem(doc.backupKey, JSON.stringify({ savedAt: now(), [doc.backupField]: local }));
    } catch { /* sauvegarde impossible : on continue, la synchro reste prioritaire */ }
  }

  // Enregistre l'état « envoyé » seulement si aucune modification locale n'est survenue pendant la requête.
  function markPushed(c: Channel, sentAt: number) {
    if (c.meta.clientUpdatedAt === sentAt) persistMeta(c, { clientUpdatedAt: sentAt, pending: false });
    else again = true;
  }

  async function applyDecision(c: Channel, remote: RemoteRecord, allowConflictRetry: boolean): Promise<void> {
    const { doc } = c;
    const d = decide(c.meta, remote, doc.decode);
    if (d.action === 'noop') { persistMeta(c, { ...c.meta, pending: false }); return; }
    if (d.action === 'invalid-remote') throw new SyncError('server', 'Les données distantes sont invalides ; elles n’ont pas été appliquées.');
    if (d.action === 'pull') {
      backupLocalIfNeeded(c, d.value);
      persistMeta(c, { clientUpdatedAt: remote!.clientUpdatedAt, pending: false });
      doc.apply(d.value);
      return;
    }
    const sentAt = c.meta.clientUpdatedAt || now();
    if (sentAt !== c.meta.clientUpdatedAt) persistMeta(c, { ...c.meta, clientUpdatedAt: sentAt });
    const snapshot = doc.get();
    try {
      if (d.action === 'push') await api.update(doc.collection, remote!.id, snapshot, sentAt);
      else await api.create(doc.collection, snapshot, sentAt);
      markPushed(c, sentAt);
    } catch (e) {
      // Création concurrente (autre appareil) ou enregistrement supprimé (404 à l'update) : relire puis réappliquer la règle.
      if (!(e instanceof SyncError) || e.kind !== 'conflict' || !allowConflictRetry) throw e;
      const existing = await api.fetchRemote(doc.collection);
      if (!existing && d.action === 'create') throw new SyncError('server', 'Données refusées par le serveur (format ou taille).');
      await applyDecision(c, existing, false);
    }
  }

  // Synchronise les documents ciblés l'un après l'autre : l'échec de l'un (ex. collection absente) ne bloque pas les autres.
  async function cycle(targets: Channel[]) {
    targets.forEach(c => setDoc(c, 'syncing'));
    emit();
    let retriable = false;
    for (const [i, c] of targets.entries()) {
      try {
        await applyDecision(c, await api.fetchRemote(c.doc.collection), true);
        setDoc(c, c.meta.pending ? 'pending' : 'synced');
        emit();
      } catch (e) {
        const err = e instanceof SyncError ? e : null;
        if (err?.kind === 'auth') { api.logout(); setAll('signed-out', userMessage(e)); return; }
        if (err?.kind === 'network' || err?.kind === 'server') retriable = true;
        if (err?.kind === 'network') {
          // Hors ligne : inutile d'essayer les documents suivants.
          for (const rest of targets.slice(i)) setDoc(rest, 'offline', userMessage(e));
          emit();
          break;
        }
        setDoc(c, 'error', userMessage(e));
        emit();
      }
    }
    if (retriable) scheduleRetry();
    else if (targets.length === channels.length) retryStep = 0;
  }

  // Reprise automatique après un échec réseau ou serveur, avec délai croissant.
  function scheduleRetry() {
    clearTimeout(retryTimer);
    const delay = RETRY_DELAYS_MS[Math.min(retryStep, RETRY_DELAYS_MS.length - 1)];
    retryStep++;
    retryTimer = setTimeout(() => { void run(); }, delay);
  }

  function clearTimers() { clearTimeout(retryTimer); channels.forEach(c => clearTimeout(c.timer)); }

  // Session absente ou expirée alors que l'état ne le dit pas : on le signale (les modifications restent en attente).
  function checkSession(): boolean {
    if (api.isLoggedIn()) return true;
    clearTimers();
    if (channels.some(c => c.status !== 'signed-out')) setAll('signed-out', userMessage(new SyncError('auth', '')));
    return false;
  }

  async function refresh() {
    try { await api.refreshSession(); } catch { /* échec réseau toléré ; une session refusée est détectée par checkSession */ }
  }

  // `only` : documents à synchroniser (par défaut tous). Un envoi différé d'un seul document ne touche pas la reprise programmée des autres.
  async function run(only?: Channel[]): Promise<void> {
    if (!checkSession()) return;
    if (!only) clearTimeout(retryTimer);
    if (running) { again = true; return; }
    running = true;
    let targets = only ?? channels;
    try {
      do { again = false; await cycle(targets); targets = channels; } while (again && api.isLoggedIn());
    } finally { running = false; }
  }

  return {
    getState,
    isBusy: () => running,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    // Au démarrage : rafraîchit la session (échec réseau toléré) puis synchronise.
    async start() {
      if (!api.isLoggedIn()) return;
      await refresh();
      await run();
    },
    async login(email: string, password: string) {
      try { await api.login(email, password); } catch (e) { setAll('signed-out', loginMessage(e)); return; }
      await run();
    },
    logout() { clearTimers(); retryStep = 0; api.logout(); setAll('signed-out'); },
    // À appeler après chaque modification faite par l'utilisateur (pas après un remplacement par le distant).
    localChanged(name: SyncDocName) {
      const c = channels.find(ch => ch.doc.name === name);
      if (!c) return;
      persistMeta(c, { clientUpdatedAt: Math.max(now(), c.meta.clientUpdatedAt + 1), pending: true });
      if (!checkSession()) return;
      setDoc(c, 'pending');
      emit();
      clearTimeout(c.timer);
      c.timer = setTimeout(() => { void run([c]); }, debounceMs);
    },
    // Retour de focus ou de connexion : rafraîchit la session, reprend les envois en attente et récupère le distant.
    async resume() {
      channels.forEach(c => clearTimeout(c.timer));
      if (api.isLoggedIn()) await refresh();
      await run();
    },
    markOffline() { if (api.isLoggedIn()) setAll('offline', userMessage(new SyncError('network', ''))); },
    // Démontage : annule les reprises programmées.
    dispose() { clearTimers(); listeners.clear(); },
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
