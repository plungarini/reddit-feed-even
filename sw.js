// Reddit G2 — Service Worker
const CACHE = 'reddit-g2-v1';
const PRECACHE = ['/', '/env.js'];

globalThis.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => globalThis.skipWaiting())
  );
});

globalThis.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => globalThis.clients.claim())
  );
});

globalThis.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Pass API calls straight through (network-only)
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // Cache-first for everything else
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (cached) return cached;

    const res = await fetch(e.request);
    if (res?.status === 200 && res.type !== 'opaque') {
      const clone = res.clone();
      const cache = await caches.open(CACHE);
      await cache.put(e.request, clone);
    }
    return res;
  })());
});
