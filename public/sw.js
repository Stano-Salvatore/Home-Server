// Deliberately does nothing but exist and answer fetch — a service worker
// with a fetch handler satisfies "Add to Home Screen" installability
// criteria on Android without introducing any caching. Caching would be
// actively harmful here: this is a live local server the owner iterates on
// (`nedory update`), not a static remote site — a cached stale JS bundle
// would be a confusing bug, not a feature. Pure network passthrough only.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
