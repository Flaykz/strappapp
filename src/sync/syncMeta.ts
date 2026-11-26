import type { LocalSyncState } from './syncDecision.ts';

// Protocole : clés historiques, conservées pour ne pas perdre l'état de synchro des appareils existants.
export const META_KEY = 'strapp-sync-meta';
export const BACKUP_KEY = 'strapp-protocol-before-sync';
export const PROTOCOL_KEY = 'strapp-protocol';
// Stock : métadonnées et copie de secours propres.
export const STOCK_META_KEY = 'strapp-sync-meta-stock';
export const STOCK_BACKUP_KEY = 'strapp-stock-before-sync';
export const STOCK_KEY = 'strapp-stock';

// Horodatage de la dernière modification locale et indicateur « non envoyé », stockés localement (par document).
export function loadMeta(storage: Pick<Storage, 'getItem'>, key: string = META_KEY): LocalSyncState {
  try {
    const m = JSON.parse(storage.getItem(key) || 'null');
    if (m && typeof m.clientUpdatedAt === 'number' && Number.isFinite(m.clientUpdatedAt)) return { clientUpdatedAt: m.clientUpdatedAt, pending: m.pending === true };
  } catch { /* données illisibles : repartir de zéro */ }
  return { clientUpdatedAt: 0, pending: false };
}

export function saveMeta(storage: Pick<Storage, 'setItem'>, meta: LocalSyncState, key: string = META_KEY): void {
  try { storage.setItem(key, JSON.stringify(meta)); } catch { /* stockage indisponible : l'état reste en mémoire */ }
}
