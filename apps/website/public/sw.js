// Aufräumen: Bis November 2026 war die ganze Seite eine PWA mit Service Worker auf „/“. Die App
// lebt jetzt unter /app mit eigenem Service Worker. Dieser hier ersetzt den alten, löscht dessen
// Zwischenspeicher (nicht die der App) und meldet sich ab, damit alte Installationen nicht auf
// einer zwischengespeicherten Fassung hängen bleiben.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => !k.includes('/app/')).map((k) => caches.delete(k)))
      await self.registration.unregister()
      const clients = await self.clients.matchAll({ type: 'window' })
      clients.forEach((c) => c.navigate(c.url))
    })(),
  )
})
