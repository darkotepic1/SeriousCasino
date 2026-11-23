// Service Worker – zeigt Push-Benachrichtigungen an (z. B. neue Duell-Herausforderung).
// Es wird nichts zwischengespeichert; die Seite lädt immer frisch.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data?.text() }; }
  e.waitUntil((async () => {
    // Ist das Casino gerade offen und sichtbar, reicht die Meldung auf der Seite
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (!d.force && wins.some((w) => w.visibilityState === 'visible' && w.focused)) return;
    await self.registration.showNotification(d.title || 'Spaß-Casino', {
      body: d.body || '',
      tag: d.tag || 'casino',
      renotify: true,
      icon: 'icon.svg',
      badge: 'icon.svg',
      data: { url: d.url || '#/' },
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(self.registration.scope).href + (e.notification.data?.url || '#/');
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins.find((x) => x.url.startsWith(self.registration.scope));
    if (w) { await w.focus(); return w.navigate(target).catch(() => {}); }
    return self.clients.openWindow(target);
  })());
});
