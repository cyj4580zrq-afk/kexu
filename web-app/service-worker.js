const CACHE_NAME = "kexu-web-0.9.6";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./local-db.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./vendor/vue.global.prod.js",
  "./vendor/element-plus.full.min.js",
  "./vendor/element-plus.css",
  "./vendor/capacitor.js",
  "./vendor/jsencrypt.min.js",
  "./vendor/lucide.min.js"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.pathname.startsWith("/api/") || event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("./index.html", clone));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      return response;
    }))
  );
});
