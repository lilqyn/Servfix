const CACHE_NAME = "servfix-shell-v2";
const OFFLINE_FALLBACKS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.ico",
  "./servfix-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(OFFLINE_FALLBACKS))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

const isCacheableStaticAsset = (requestUrl) => {
  const assetPattern = /\.(?:js|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|map|json)$/i;
  return assetPattern.test(requestUrl.pathname);
};

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put("./index.html", networkResponse.clone()).catch(() => undefined);
          }
          return networkResponse;
        } catch {
          const cached = await caches.match("./index.html");
          return cached || caches.match("./");
        }
      })(),
    );
    return;
  }

  if (!isCacheableStaticAsset(url)) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);

      if (cached) {
        event.waitUntil(
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse.ok) {
                return cache.put(request, networkResponse.clone());
              }
              return undefined;
            })
            .catch(() => undefined),
        );

        return cached;
      }

      try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
          cache.put(request, networkResponse.clone()).catch(() => undefined);
        }
        return networkResponse;
      } catch {
        return caches.match(request).then((fallback) => fallback || Response.error());
      }
    })(),
  );
});
