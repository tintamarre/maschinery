// Maschinery service worker: works offline after the first visit.
// - app shell and hashed assets: cache first (assets never change under the same name)
// - navigations and kit manifest: network first, cache as fallback
const CACHE = 'maschinery-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await cache.addAll(['./', './favicon.svg', './manifest.webmanifest'])
      // also precache the hashed JS/CSS the shell references, so the very first visit works offline
      try {
        const html = await (await fetch('./', { cache: 'no-cache' })).text()
        const assets = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((m) => m[1])
        await cache.addAll(assets)
      } catch {
        /* the runtime cache fills in on the next load */
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
      // drop hashed assets from previous builds that the current shell no longer references
      try {
        const cache = await caches.open(CACHE)
        const html = await (await cache.match('./'))?.text()
        if (html) {
          for (const req of await cache.keys()) {
            const p = new URL(req.url).pathname
            if (p.includes('/assets/') && !html.includes(p.slice(p.indexOf('/assets/')))) await cache.delete(req)
          }
        }
      } catch {
        /* best effort */
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return
  const networkFirst = req.mode === 'navigate' || url.pathname.endsWith('/kits/index.json')

  if (networkFirst) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req).then((hit) => hit ?? caches.match('./'))),
    )
    return
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
