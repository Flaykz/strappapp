import PocketBase, { ClientResponseError } from 'pocketbase';
import type { RemoteRecord } from './syncDecision.ts';
import { SyncError } from './syncErrors.ts';

export type Remote = NonNullable<RemoteRecord>;

// Contrat utilisé par le moteur : permet de le tester avec un faux serveur.
export interface SyncApi {
  isLoggedIn(): boolean;
  email(): string;
  login(email: string, password: string): Promise<void>;
  logout(): void;
  refreshSession(): Promise<void>;
  fetchRemote(): Promise<Remote | null>;
  create(data: unknown, clientUpdatedAt: number): Promise<Remote>;
  update(id: string, data: unknown, clientUpdatedAt: number): Promise<Remote>;
}

const COLLECTION = 'protocols';

type Op = 'create' | 'update' | 'other';

function toSyncError(e: unknown, op: Op = 'other'): SyncError {
  if (e instanceof SyncError) return e;
  if (e instanceof ClientResponseError) {
    if (e.status === 0) return new SyncError('network', 'Réseau indisponible');
    if (e.status === 401 || e.status === 403) return new SyncError('auth', 'Non autorisé');
    // 400 à la création : en pratique la violation de l'index unique sur `owner`.
    if (op === 'create' && e.status === 400) return new SyncError('conflict', 'Enregistrement déjà existant');
    // 404 à l'update : l'enregistrement a été supprimé, le moteur retombe sur une création.
    if (op === 'update' && e.status === 404) return new SyncError('conflict', 'Enregistrement introuvable');
    return new SyncError('server', `Erreur serveur (${e.status})`);
  }
  return new SyncError('network', 'Réseau indisponible');
}

function toRemote(r: Record<string, unknown>): Remote {
  return { id: String(r.id), data: r.data, clientUpdatedAt: typeof r.clientUpdatedAt === 'number' ? r.clientUpdatedAt : 0 };
}

export function createPocketBaseApi(url: string): SyncApi {
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  const col = () => pb.collection(COLLECTION);
  async function call<T>(fn: () => Promise<T>, op: Op = 'other'): Promise<T> {
    try { return await fn(); } catch (e) { throw toSyncError(e, op); }
  }
  return {
    isLoggedIn: () => pb.authStore.isValid,
    email: () => String(pb.authStore.record?.email ?? ''),
    async login(email, password) {
      try { await pb.collection('users').authWithPassword(email, password); }
      catch (e) {
        if (e instanceof ClientResponseError && e.status === 400) throw new SyncError('auth', 'Email ou mot de passe incorrect.');
        throw toSyncError(e);
      }
    },
    logout: () => pb.authStore.clear(),
    async refreshSession() {
      if (!pb.authStore.isValid) return;
      try { await pb.collection('users').authRefresh(); }
      catch (e) {
        const err = toSyncError(e);
        if (err.kind === 'auth') pb.authStore.clear();
        throw err;
      }
    },
    async fetchRemote() {
      const list = await call(() => col().getList(1, 1));
      return list.items[0] ? toRemote(list.items[0]) : null;
    },
    async create(data, clientUpdatedAt) {
      return toRemote(await call(() => col().create({ owner: pb.authStore.record?.id, data, clientUpdatedAt }), 'create'));
    },
    async update(id, data, clientUpdatedAt) {
      return toRemote(await call(() => col().update(id, { data, clientUpdatedAt }), 'update'));
    },
  };
}
