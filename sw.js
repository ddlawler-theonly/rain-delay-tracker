// Rain Delay Tracker service worker (precache bypasses the HTTP cache so a version bump always gets fresh files): precache app shell, cache-first for same-origin; weather APIs always go to network.
const CACHE = 'raindelay-v1.2.0';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './css/app.css', './js/app.js', './js/data.js', './js/config.js',
  './vendor/xlsx.full.min.js', './vendor/jspdf.umd.min.js', './vendor/jspdf.plugin.autotable.min.js', './icons/icon.svg', './icons/icon-maskable.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
