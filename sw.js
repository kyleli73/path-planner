const CACHE = 'bubblotics-path-planner-v3';
const SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest', './icon.svg',
  './src/main.js', './src/ui.js', './src/store.js', './src/bezier.js', './src/heading.js',
  './src/profile.js', './src/collision.js', './src/codegen.js', './src/render.js', './src/field.js', './field.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Stale-while-revalidate: instant offline loads, and a deploy reaches users on their next visit.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || req.headers.has('range') || req.destination === 'video' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => hit || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error()));
    if (hit) e.waitUntil(fresh.catch(() => {}));
    return hit || fresh;
  }));
});
