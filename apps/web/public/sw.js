const CACHE_NAME = "menu-builder-v1";
const ASSETS = [
  "/offline",
  "/m/abo-malek",
  "/assets/brand/abo-malek-logo.png",
  "/assets/public/menu-home.png",
  "/assets/public/menu-products.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
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
