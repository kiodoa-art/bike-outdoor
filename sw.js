// sw.js — simple but aggressive PWA update handling.
// Bump CACHE_NAME for every released build. New service workers take control immediately,
// clear old caches, and refresh open app windows so GitHub Pages does not hang on old files.

const CACHE_NAME = 'bike-outdoor-v2-color-map-force-update';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './sensors.js',
  './gps.js',
  './storage.js',
  './map.js',
  './export.js',
  './ui.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();

    // Force open app windows to reload once when a new SW version activates.
    // This is intentionally aggressive because this PWA is developed via GitHub Pages
    // and stale cache versions are more annoying than a reload during development.
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if ('navigate' in client && client.url) {
        client.navigate(client.url);
      }
    }
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(new Request(request, { cache: 'reload' }));
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // never intercept CDN/tile requests

  // Network-first prevents old app.js/styles.css/index.html from sticking forever.
  event.respondWith(networkFirst(event.request));
});
