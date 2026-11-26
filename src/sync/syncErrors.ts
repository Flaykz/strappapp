// Erreurs typées renvoyées par le client API, indépendantes du SDK (testables sans réseau).
export type SyncErrorKind = 'network' | 'auth' | 'server' | 'conflict' | 'unavailable';

export class SyncError extends Error {
  readonly kind: SyncErrorKind;
  constructor(kind: SyncErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export function userMessage(error: unknown): string {
  if (error instanceof SyncError) {
    if (error.kind === 'network') return 'Serveur injoignable. Les modifications seront envoyées au retour de la connexion.';
    if (error.kind === 'auth') return 'Session expirée ou refusée : reconnecte-toi.';
    if (error.kind === 'unavailable') return 'Collection absente du serveur : synchronisation indisponible pour l’instant.';
    if (error.kind === 'conflict') return 'Conflit de synchronisation persistant. Réessaie dans un instant.';
    return error.message || 'Erreur du serveur de synchronisation.';
  }
  return 'Erreur inattendue pendant la synchronisation.';
}

// Au login, aucune modification n'est « envoyée au retour de la connexion » : message dédié pour l'erreur réseau.
export function loginMessage(error: unknown): string {
  if (error instanceof SyncError && error.kind === 'network') return 'Serveur injoignable, réessaie plus tard.';
  return userMessage(error);
}
