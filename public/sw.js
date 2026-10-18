/* Dungeon Delve service worker: offline play without a build-time precache list.
 * - Navigations (HTML): network-first, fall back to the cached page when offline.
 * - Other same-origin GETs (hashed JS/CSS, images, audio, json): stale-while-revalidate.
 * Bump VERSION to drop everything cached by older workers. */
const VERSION = 'v1';
const CACHE = `dungeon-delve-${VERSION}`;

self.addEventListener('install', (event) => {
  // Cache the start page up front so a first offline launch works after one visit.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['./', './manifest.webmanifest']))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('dungeon-delve-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function cacheable(response) {
  return response && response.ok && response.type === 'basic';
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (cacheable(response)) await cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached =
      (await cache.match(request, { ignoreSearch: true })) || (await cache.match('./'));
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(event) {
  const { request } = event;
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const update = fetch(request)
    .then((response) => {
      if (cacheable(response)) return cache.put(request, response.clone()).then(() => response);
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(update);
    return cached;
  }
  const response = await update;
  return response || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // Only same-origin requests inside our scope (GitHub Pages shares the origin across repos).
  if (!request.url.startsWith(self.registration.scope)) return;
  // Range requests (media seeking) can't be served from a full cached response.
  if (request.headers.has('range')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(event));
  }
});
