/**
 * AshTec Crew Hub service worker.
 *
 * Deliberately small. The app is an SPA with hashed asset filenames, so there is
 * no fixed list of build files to precache; instead it caches the shell and then
 * fills up at runtime.
 *
 * Rules:
 *   - API calls are never cached. A stale roster or a cached 401 would be worse
 *     than being offline.
 *   - Navigations are network-first, falling back to the cached shell so the app
 *     still opens (and shows its own offline state) with no connection.
 *   - Everything else same-origin is cache-first, then network, then stored.
 *
 * Bump CACHE when the shell changes; the old cache is dropped on activate.
 */
const CACHE = 'ashtec-shell-v1';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Auth and data must always hit the network.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          // Only cache successful, basic responses; a 404 or an opaque error
          // should not poison the cache.
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
    )
  );
});
