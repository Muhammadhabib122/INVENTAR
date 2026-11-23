// Service worker: ilova qobig'ini (sahifalar, JS, CSS) keshlaydi — internet yo'qligida ham ochiladi.
// Ma'lumotlar (API) hech qachon keshlanmaydi: skanlar IndexedDB navbatida saqlanadi.
const V = 'inventar-v1';
const PAGES = ['/', '/scan', '/list', '/report', '/labels', '/done', '/sections', '/more', '/tmz'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(V)
      .then((c) => Promise.all(PAGES.concat(['/manifest.webmanifest', '/icon-192.png']).map((u) => c.add(new Request(u, { credentials: 'same-origin' })).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((k) => Promise.all(k.filter((x) => x !== V).map((x) => caches.delete(x))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // ma'lumotlar — faqat tarmoqdan
  // Next.js statik fayllari o'zgarmaydi (nomida xesh bor) — avval keshdan
  if (url.pathname.startsWith('/_next/static/') || /\.(png|svg|ico|webmanifest|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((r) => {
            if (r.ok) {
              const c = r.clone();
              caches.open(V).then((x) => x.put(req, c));
            }
            return r;
          }),
      ),
    );
    return;
  }
  // sahifalar va RSC so'rovlari — avval tarmoqdan, bo'lmasa keshdan
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r.ok && !r.redirected && (req.mode === 'navigate' || url.searchParams.has('_rsc'))) {
          const c = r.clone();
          caches.open(V).then((x) => x.put(req, c));
        }
        return r;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/scan') : undefined) || Response.error()),
      ),
  );
});
