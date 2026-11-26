import { useState } from 'preact/hooks';
import './sync/sync.css';
import type { SyncEngine, SyncState } from './sync/syncEngine.ts';

const labels: Record<SyncState['status'], { icon: string; text: string }> = {
  'signed-out': { icon: '○', text: 'Non connecté' },
  syncing: { icon: '↻', text: 'Synchronisation en cours…' },
  synced: { icon: '●', text: 'Synchronisé' },
  pending: { icon: '◐', text: 'Modifications en attente d’envoi' },
  offline: { icon: '⚠', text: 'Hors ligne : envoi au retour de la connexion' },
  error: { icon: '⚠', text: 'Erreur de synchronisation' },
};

export function SyncPanel({ engine, state }: { engine: SyncEngine; state: SyncState }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false);
  const label = labels[state.status];
  const connected = state.status !== 'signed-out';
  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    await engine.login(email.trim(), password);
    setBusy(false);
    if (engine.getState().status !== 'signed-out') setPassword('');
  }
  return <details class="sync-panel"><summary>Synchronisation <span class={`sync-status sync-${state.status}`} role="status" aria-live="polite"><span aria-hidden="true">{label.icon}</span> {label.text}</span></summary>
    <div class="sync-body">
      {connected ? <>
        <p>Connecté en tant que <strong>{state.email}</strong>. Les modifications du protocole sont envoyées automatiquement ; la version la plus récente est conservée.</p>
        {state.message && <p role="alert" class="sync-message">{state.message}</p>}
        <div class="sync-actions"><button type="button" onClick={() => void engine.resume()}>Synchroniser maintenant</button><button type="button" onClick={() => engine.logout()}>Se déconnecter</button></div>
      </> : <form onSubmit={e => void submit(e)}>
        <p>Optionnel : connecte-toi pour retrouver ton protocole sur tes autres appareils. L’app reste utilisable sans compte et hors ligne. Le compte est créé par l’administrateur.</p>
        <div class="sync-fields"><label>Email<input type="email" autocomplete="username" required value={email} onInput={e => setEmail(e.currentTarget.value)}/></label><label>Mot de passe<input type="password" autocomplete="current-password" required value={password} onInput={e => setPassword(e.currentTarget.value)}/></label></div>
        {state.message && <p role="alert" class="sync-message">{state.message}</p>}
        <button class="primary" type="submit" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
      </form>}
    </div></details>;
}
