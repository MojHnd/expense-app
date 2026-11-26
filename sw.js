// Service worker: cache first for the app files, so the app opens at once (also offline or on a weak signal).
// Each request also updates the cache in the background. For a release, change CACHE: the new worker
// then caches all files again, and the page reloads (see app.js).
// Requests to other origins (the GitHub API) are not touched.

const CACHE = 'expenses-v4';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'src/app.js', 'src/model.js', 'src/money.js', 'src/merge.js', 'src/reports.js', 'src/names.js',
  'src/store.js', 'src/sync.js', 'src/lock.js',
  'src/ui/dom.js', 'src/ui/charts.js', 'src/ui/item-sheet.js', 'src/ui/month.js',
  'src/ui/history.js', 'src/ui/trends.js', 'src/ui/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const network = caches.open(CACHE).then(async (cache) => {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) await cache.put(req, res.clone());
    return res;
  });
  event.waitUntil(network.catch(() => {}));
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = (await cache.match(req, { ignoreSearch: true }))
      || (req.mode === 'navigate' ? await cache.match('index.html') : undefined);
    return cached || network;
  })());
});
