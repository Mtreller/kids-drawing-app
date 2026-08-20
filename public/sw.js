const CACHE = 'color-pop-v2-2026-08-20';
const BASE = '/kids-drawing-app/';
const CORE = [
  BASE,
  `${BASE}manifest.webmanifest`,
  `${BASE}icon.svg`,
  `${BASE}drawings/paw-patrol/chase-standing-proudly.webp`,
  `${BASE}drawings/paw-patrol/everest-sitting-proudly.webp`,
  `${BASE}drawings/paw-patrol/marshall-sitting-panting.webp`,
  `${BASE}drawings/paw-patrol/mighty-pups-team.webp`,
  `${BASE}drawings/paw-patrol/skye-smiling.webp`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(BASE, copy));
          return response;
        })
        .catch(() => caches.match(BASE)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});
