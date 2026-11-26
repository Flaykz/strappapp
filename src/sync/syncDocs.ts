import type { Protocol } from '../planner.ts';
import { decodeProtocol } from '../protocol.ts';
import type { Stock } from '../stock.ts';
import { decodeStock } from '../stockCodec.ts';
import { BACKUP_KEY, META_KEY, PROTOCOL_KEY, STOCK_BACKUP_KEY, STOCK_KEY, STOCK_META_KEY } from './syncMeta.ts';

export type SyncDocName = 'protocol' | 'stock';

// Un document synchronisé : même mécanique pour tous (plus récent gagne, debounce, retry, copie de secours),
// seuls la collection, les clés locales et le décodeur changent.
export type SyncDoc = {
  name: SyncDocName;
  label: string;
  collection: string;
  storageKey: string;
  metaKey: string;
  backupKey: string;
  // Champ de la copie de secours : { savedAt, [backupField]: données locales }.
  backupField: string;
  // Valide des données (distantes ou locales) ; null si invalides.
  decode: (raw: unknown) => unknown;
  get: () => unknown;
  // Appelé quand le distant remplace le local : l'UI met à jour son état (et donc le localStorage).
  apply: (value: unknown) => void;
};

export type AppDocs = {
  getProtocol: () => Protocol;
  applyProtocol: (p: Protocol) => void;
  getStock: () => Stock;
  applyStock: (s: Stock) => void;
};

export function appSyncDocs(a: AppDocs): SyncDoc[] {
  return [
    { name: 'protocol', label: 'Protocole', collection: 'protocols', storageKey: PROTOCOL_KEY, metaKey: META_KEY, backupKey: BACKUP_KEY, backupField: 'protocol',
      decode: raw => decodeProtocol(raw)?.protocol ?? null, get: a.getProtocol, apply: v => a.applyProtocol(v as Protocol) },
    { name: 'stock', label: 'Stock', collection: 'stocks', storageKey: STOCK_KEY, metaKey: STOCK_META_KEY, backupKey: STOCK_BACKUP_KEY, backupField: 'stock',
      decode: decodeStock, get: a.getStock, apply: v => a.applyStock(v as Stock) },
  ];
}
