import PocketBase, { ClientResponseError } from 'pocketbase';
import type { RemoteRecord } from './syncDecision.ts';
import { SyncError } from './syncErrors.ts';

export type Remote = NonNullable<RemoteRecord>;

// Contrat utilisé par le moteur : permet de le tester avec un faux serveur.
// Une seule connexion ; chaque document vit dans sa collection (un enregistrement par utilisateur).
export interface SyncApi {
  isLoggedIn(): boolean;
  email(): string;
  login(email: string, password: string): Promise<void>;
  logout(): void;
  refreshSession(): Promise<void>;
  fetchRemote(collection: string): Promise<Remote | null>;
  create(collection: string, data: unknown, clientUpdatedAt: number): Promise<Remote>;
  update(collection: string, id: string, data: unknown, clientUpdatedAt: number): Promise<Remote>;
}

type Op = 'list' | 'create' | 'update' | 'other';

export function toSyncError(e: unknown, op: Op = 'other'): SyncError {
  if (e instanceof SyncError) return e;
  if (e instanceof ClientResponseError) {
    if (e.status === 0) return new SyncError('network', 'Réseau indisponible');
    // Seule une 401 signifie « session invalide ». Une 403 vient d'une règle de collection ou d'une collection absente
    // (PocketBase répond 403 « Only superusers can perform this action » pour une collection inexistante) : pas la session.
    if (e.status === 401) return new SyncError('auth', 'Non autorisé');
    if (e.status === 403) return op === 'list' ? new SyncError('unavailable', 'Collection inaccessible') : new SyncError('server', 'Accès refusé par le serveur (403)');
    // 404 à la lecture ou à la création : la collection n'existe pas (« Missing collection context »), pas de nouvel essai utile.
    if ((op === 'list' || op === 'create') && e.status === 404) return new SyncError('unavailable', 'Collection introuvable');
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
    async fetchRemote(collection) {
      const list = await call(() => pb.collection(collection).getList(1, 1), 'list');
      return list.items[0] ? toRemote(list.items[0]) : null;
    },
    async create(collection, data, clientUpdatedAt) {
      return toRemote(await call(() => pb.collection(collection).create({ owner: pb.authStore.record?.id, data, clientUpdatedAt }), 'create'));
    },
    async update(collection, id, data, clientUpdatedAt) {
      return toRemote(await call(() => pb.collection(collection).update(id, { data, clientUpdatedAt }), 'update'));
    },
  };
}
