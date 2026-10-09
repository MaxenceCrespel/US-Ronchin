// Service worker: makes the app installable, keeps the app *shell* available offline, and
// handles push. It never caches API data — this app is useless with stale data, so offline you
// get the shell plus an "hors ligne" notice rather than yesterday's answers.
//   - navigations: network first (so a new release is picked up right away), the last shell as
//     fallback when the network is down;
//   - /assets/* (content-hashed, immutable): cache first;
//   - everything else, and every /api call: straight to the network.
const SHELL_CACHE = 'ronchin-shell-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.add('/')).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy))
          return response
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            const copy = response.clone()
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy))
            return response
          }),
      ),
    )
  }
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  const { title, body, url } = event.data.json()
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(self.clients.openWindow(url))
})

// The browser can renew a push subscription on its own (expiry, key rotation). Without
// handling it the old one just dies and the device silently stops receiving notifications.
// Re-subscribe right away with the same server key so the device stays reachable; the app
// registers the new subscription with the server (and drops the old one) the next time it
// opens — see PushSync.tsx. The worker can't call the API itself: it has no session token.
self.addEventListener('pushsubscriptionchange', (event) => {
  const options = event.oldSubscription && event.oldSubscription.options
  if (!options || !options.applicationServerKey) return
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: options.applicationServerKey })
      .catch(() => {}),
  )
})
