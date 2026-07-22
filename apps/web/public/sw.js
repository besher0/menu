const CACHE_NAME = "menu-builder-v4";
const ASSETS = [
  "/offline",
  "/assets/brand/abo-malek-logo.png",
  "/assets/public/menu-home.png",
  "/assets/public/menu-products.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const shouldBypassCache =
    !isSameOrigin ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/dashboard") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/m/") ||
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/manifest") ||
    url.pathname === "/sw.js";

  if (shouldBypassCache) {
    event.respondWith(
      fetch(event.request).catch(() => new Response("Network unavailable", { status: 503, statusText: "Service Unavailable" }))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match("/offline"));
    })
  );
});
