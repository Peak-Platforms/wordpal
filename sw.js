// WordPal Service Worker
// Handles push notifications from Supabase Edge Function
// Deploy this file at the same path as wordpal.html

const CACHE = 'wordpal-v1';

// ── Install & Activate ────────────────────────────────────────────────────────
self.addEventListener('install',  function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(clients.claim()); });

// ── Push Event ────────────────────────────────────────────────────────────────
self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch(err) {}

  var title   = data.title   || 'WordPal';
  var body    = data.body    || 'Your leader posted something new.';
  var icon    = data.icon    || '/icon-192.png';
  var badge   = data.badge   || '/icon-72.png';
  var tag     = data.tag     || 'wordpal-post';
  var url     = data.url     || '/';

  e.waitUntil(
    self.registration.showNotification(title, {
      body:    body,
      icon:    icon,
      badge:   badge,
      tag:     tag,
      renotify: true,
      data:    { url: url },
      actions: [
        { action: 'open',    title: 'Open Feed' },
        { action: 'dismiss', title: 'Dismiss'   }
      ]
    })
  );
});

// ── Notification Click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', function(e) {
  e.notification.close();

  if (e.action === 'dismiss') return;

  var url = (e.notification.data && e.notification.data.url) ? e.notification.data.url : '/';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(wins) {
      // If the app is already open, focus it
      for (var i = 0; i < wins.length; i++) {
        if (wins[i].url.indexOf(self.location.origin) === 0 && 'focus' in wins[i]) {
          return wins[i].focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
