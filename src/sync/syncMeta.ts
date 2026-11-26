import type { LocalSyncState } from './syncDecision.ts';

export const META_KEY = 'strapp-sync-meta';
export const BACKUP_KEY = 'strapp-protocol-before-sync';
export const PROTOCOL_KEY = 'strapp-protocol';

// Horodatage de la dernière modification locale et indicateur « non envoyé », stockés localement.
export function loadMeta(storage: Pick<Storage, 'getItem'>): LocalSyncState {
  try {
    const m = JSON.parse(storage.getItem(META_KEY) || 'null');
    if (m && typeof m.clientUpdatedAt === 'number' && Number.isFinite(m.clientUpdatedAt)) return { clientUpdatedAt: m.clientUpdatedAt, pending: m.pending === true };
  } catch { /* données illisibles : repartir de zéro */ }
  return { clientUpdatedAt: 0, pending: false };
}

export function saveMeta(storage: Pick<Storage, 'setItem'>, meta: LocalSyncState): void {
  try { storage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* stockage indisponible : l'état reste en mémoire */ }
}
