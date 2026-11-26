import type { Protocol } from '../planner.ts';
import { decodeProtocol } from '../protocol.ts';

export type LocalSyncState = { clientUpdatedAt: number; pending: boolean };
export type RemoteRecord = { id: string; data: unknown; clientUpdatedAt: number } | null;

export type Decision =
  | { action: 'create' }
  | { action: 'push' }
  | { action: 'pull'; protocol: Protocol }
  | { action: 'noop' }
  | { action: 'invalid-remote' };

// Règle « le plus récent gagne » (comparaison de clientUpdatedAt, en ms).
// - aucun enregistrement distant : création ;
// - données distantes invalides : on les écrase seulement si le local a été modifié, sinon erreur ;
// - distant strictement plus récent : il remplace le local, même si des modifications étaient en attente
//   (l'appelant sauvegarde alors le local écrasé) ;
// - local plus récent, ou en attente à horodatage égal : envoi.
export function decide(local: LocalSyncState, remote: RemoteRecord): Decision {
  if (!remote) return { action: 'create' };
  const decoded = decodeProtocol(remote.data);
  if (!decoded) return local.clientUpdatedAt > 0 || local.pending ? { action: 'push' } : { action: 'invalid-remote' };
  const remoteAt = Number.isFinite(remote.clientUpdatedAt) ? remote.clientUpdatedAt : 0;
  if (remoteAt > local.clientUpdatedAt) return { action: 'pull', protocol: decoded.protocol };
  if (local.clientUpdatedAt > remoteAt || local.pending) return { action: 'push' };
  return { action: 'noop' };
}
