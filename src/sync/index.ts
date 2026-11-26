import { createPocketBaseApi } from './pbApi.ts';
import { createSyncEngine } from './syncEngine.ts';
import { appSyncDocs, type AppDocs } from './syncDocs.ts';

const url = (import.meta.env.VITE_PB_URL as string | undefined) || 'https://pb.flaykz.ovh';

// Crée le moteur branché sur PocketBase et le localStorage, et relance la synchro au retour de focus/connexion.
export function createAppSync(docs: AppDocs) {
  const engine = createSyncEngine({ api: createPocketBaseApi(url), storage: localStorage, docs: appSyncDocs(docs) });
  // focus et visibilitychange arrivent presque ensemble : un seul cycle par fenêtre de 2 s.
  let lastResume = 0;
  const resume = () => {
    if (!navigator.onLine || engine.isBusy() || Date.now() - lastResume < 2000) return;
    lastResume = Date.now();
    void engine.resume();
  };
  addEventListener('online', resume);
  const onOffline = () => engine.markOffline();
  const onVisible = () => { if (!document.hidden) resume(); };
  addEventListener('offline', onOffline);
  addEventListener('focus', resume);
  document.addEventListener('visibilitychange', onVisible);
  void engine.start();
  const dispose = () => {
    engine.dispose();
    removeEventListener('online', resume);
    removeEventListener('offline', onOffline);
    removeEventListener('focus', resume);
    document.removeEventListener('visibilitychange', onVisible);
  };
  return { ...engine, dispose };
}
