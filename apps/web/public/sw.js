// Minimal service worker — its only job is to exist with a fetch handler, which is
// what makes Chrome/Android consider the app "installable". Network-first, no offline
// cache: this app is useless without live data, so caching stale pages would be worse
// than just failing normally when there's no connection.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
