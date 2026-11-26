// Replaced in the production output by vite.config.ts so every deployment is detectable.
const CACHE_VERSION = 'strapp-shell-__STRAPP_BUILD_ID__';
const APP_SHELL = ['./manifest.webmanifest', './icons/icon.svg'];

async function primeAppShell() {
  const cache = await caches.open(CACHE_VERSION);
  await cache.addAll(APP_SHELL);

  const pageResponse = await fetch('./', { cache: 'no-cache' });
  if (!pageResponse.ok) throw new Error(`App shell returned ${pageResponse.status}`);
  const html = await pageResponse.clone().text();
  await cache.put('./', pageResponse);

  const resourceUrls = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/gi)]
    .map(match => new URL(match[1], self.registration.scope))
    .filter(url => url.origin === self.location.origin)
    .map(url => url.href);
  await cache.addAll([...new Set(resourceUrls)]);
}

self.addEventListener('install', event => {
  event.waitUntil(primeAppShell());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./').then(cached => cached || fetch(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response.ok) void caches.open(CACHE_VERSION).then(cache => cache.put(request, response.clone()));
        return response;
      });
      return cached || network;
    })
  );
});
