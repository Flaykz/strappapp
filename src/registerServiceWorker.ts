type UpdateListener = (available:boolean) => void;

const listeners = new Set<UpdateListener>();
let waitingWorker:ServiceWorker|null = null;
let reloadForUpdate = false;

function publishUpdate(worker:ServiceWorker|null) {
  waitingWorker = worker;
  listeners.forEach(listener => listener(worker !== null));
}

export function onServiceWorkerUpdate(listener:UpdateListener) {
  listeners.add(listener);
  listener(waitingWorker !== null);
  return () => listeners.delete(listener);
}

export function applyServiceWorkerUpdate() {
  if (!waitingWorker) return;
  reloadForUpdate = true;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}

// Keep registration scoped to Vite's base URL so GitHub Pages and local builds behave identically.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadForUpdate) window.location.reload();
  });

  window.addEventListener('load', () => {
    const workerUrl = `${import.meta.env.BASE_URL}sw.js`;
    void navigator.serviceWorker.register(workerUrl, { scope: import.meta.env.BASE_URL }).then(registration => {
      if (registration.waiting && navigator.serviceWorker.controller) publishUpdate(registration.waiting);

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) publishUpdate(installing);
        });
      });

      const checkForUpdate = () => {
        if (document.visibilityState === 'visible') void registration.update();
      };
      document.addEventListener('visibilitychange', checkForUpdate);
      window.addEventListener('online', checkForUpdate);
      void registration.update();
    }).catch(error => {
      console.warn('Service worker registration failed.', error);
    });
  });
}
