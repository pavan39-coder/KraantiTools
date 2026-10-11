const CACHE_NAME = 'kraantitools-shell-__BUILD_ID__'
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/app-icon.svg',
  '/app-icon-180.png',
  '/app-icon-192.png',
  '/app-icon-512.png',
  '/precache-manifest.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    await cache.addAll(APP_SHELL)
    const manifestResponse = await cache.match('/precache-manifest.json')
    const assetPaths = await manifestResponse.json()
    await cache.addAll(assetPaths)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key.startsWith('kraantitools-') && key !== CACHE_NAME)
      .map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put(request, response.clone())
        }
        return response
      } catch {
        return (await caches.match(request)) || (await caches.match('/'))
      }
    })())
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME)
      const cached = await cache.match(request)
      const update = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone())
        return response
      })
      return cached || update
    })())
  }
})
