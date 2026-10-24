// Retired v1.3 preview service worker: it is now the live app. Delete the preview cache, unregister, send open tabs to the app.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('calorie-preview-')) await caches.delete(k)
    await self.registration.unregister()
    const app = self.registration.scope.replace(/preview\/$/, '')
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(app).catch(() => {})
  })())
})
