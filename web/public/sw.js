self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'FairSplit', body: event.data ? event.data.text() : 'Nuova notifica' }; }
  const title = data.title || 'FairSplit';
  const tag = data.tag || data.id || `fairsplit-${Date.now()}`;
  const options = {
    body: data.body || 'Hai una nuova attività nel gruppo.',
    icon: '/fs-icon-192-v2.png',
    badge: '/fs-badge-96-v2.png',
    tag,
    renotify: false,
    data: { url: data.url || '/', tag }
  };
  event.waitUntil((async () => {
    const existing = await self.registration.getNotifications({ tag });
    await Promise.all(existing.map(notification => notification.close()));
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const existing = list.find(client => client.url.includes(self.location.origin));
    if (existing) return existing.focus();
    return clients.openWindow(url);
  }));
});
