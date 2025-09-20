const CACHE_NAME = "rewards-pwa-v3";
const OFFLINE_URLS = [
  "index.html",
  "style.css",
  "script.js",
  "manifest.json",
  "assets/new_card.mp3",
  "assets/duplicate.mp3",
  // Icon set (if present)
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  // Reward images (add as needed)
  "assets/rewards/reward01.jpg",
  "assets/rewards/reward02.jpg",
  "assets/rewards/reward03.jpg",
  "assets/rewards/reward04.jpg",
  "assets/rewards/reward05.jpg",
  "assets/rewards/reward06.jpg",
  "assets/rewards/reward07.jpg",
  "assets/rewards/reward08.jpg",
  "assets/rewards/reward09.jpg",
  "assets/rewards/reward10.jpg",
  "assets/rewards/reward11.jpg",
  "assets/rewards/reward12.jpg",
  "assets/rewards/reward13.jpg",
  "assets/rewards/reward14.jpg",
  "assets/rewards/reward15.jpg",
  "assets/rewards/reward16.jpg",
  "assets/rewards/reward17.jpg",
  "assets/rewards/reward18.jpg",
  "assets/rewards/reward19.jpg",
  "assets/rewards/reward20.jpg",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(
          OFFLINE_URLS.map((u) => new Request(u, { cache: "reload" }))
        )
      )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached || Promise.reject("offline"));
      return cached || network;
    })
  );
});
