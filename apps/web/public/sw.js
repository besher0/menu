// P0: never cache menu snapshots, HTML, RSC, JSON, quotes or orders.
const CACHE_NAME = 'menu-builder-v6-static';
const OFFLINE_HTML = '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>OrderSawa — Offline</title><body><main><h1>أنت غير متصل بالإنترنت</h1><p>لا يمكن التحقق من الأسعار والتوفر دون اتصال. أعد الاتصال ثم أعد تحميل الصفحة.</p><button onclick="location.reload()">إعادة المحاولة</button></main></body></html>';
self.addEventListener('install', event => { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('menu-builder-') && key !== CACHE_NAME).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const isRsc = request.headers.has('RSC') || url.searchParams.has('_rsc');
  const immutableAsset = url.pathname.startsWith('/_next/static/') && !isRsc
    && ['script', 'style', 'font', 'image'].includes(request.destination);
  if (immutableAsset) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok && !response.redirected && !/text\/html/i.test(response.headers.get('content-type') || '')) {
        event.waitUntil(cache.put(request, response.clone()).catch(() => console.warn('OrderSawa SW: static cache write failed')));
      }
      return response;
    })());
    return;
  }
  // Native HTTP cache rules apply. Offline HTML is for real documents ONLY.
  if (request.mode === 'navigate' && !isRsc) {
    event.respondWith(fetch(request).catch(() => new Response(OFFLINE_HTML, {
      status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    })));
  }
});
