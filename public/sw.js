/* ─── SI Trading ERP — Service Worker ──────────────────────────────────────
   Strategy:
     • Static shell (JS/CSS/fonts) → Cache-First
     • Navigation (HTML)           → Network-First with offline fallback
     • Firebase/API calls          → Network-Only (never cache live data)
   ───────────────────────────────────────────────────────────────────────── */

// Bump on any change to the caching rules below. `activate` deletes every
// cache that is not the current name, so a new version starts clean — a stale
// shell pointing at bundles that no longer exist is a blank page nobody can
// reload their way out of.
const CACHE_NAME = 'si-erp-v2';
const OFFLINE_URL = '/offline.html';

// Deliberately no '/': the app shell is not precached under a fixed key. It is
// stored only after a navigation genuinely succeeds (see below), so a bad
// response can never be pinned here as the permanent offline page.
const STATIC_ASSETS = [
  '/offline.html',
  '/manifest.json',
  '/logo192.png',
  '/logo512.png',
];

// ── Install: pre-cache shell ────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Per-asset so one missing file can't fail the whole install.
      return Promise.all(
        STATIC_ASSETS.map((url) => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin API calls (Supabase REST/auth/realtime)
  if (request.method !== 'GET') return;
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabase.in') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.protocol === 'chrome-extension:'
  ) {
    return; // Network-only — don't intercept
  }

  // Navigation requests — Network-First with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache a real, same-origin 200. Caching whatever came back
          // would store a 404 or a 500 error page and then serve it as the
          // offline shell on every later failure.
          if (response.ok && response.type === 'basic' && !response.redirected) {
            const clone = response.clone();
            caches.open(CACHE_NAME)
              .then((c) => c.put(request, clone))
              .catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          // Each branch is awaited on its own: caches.match() returns a
          // promise, truthy even when it resolves to nothing, so chaining
          // these with || would make the last two fallbacks unreachable.
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
          return new Response(
            '<h1>You are offline</h1><p>Please reconnect to use SI ERP.</p>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
    return;
  }

  // Static assets (JS, CSS, fonts, images) — Cache-First
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf)$/) ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE_NAME)
            .then((c) => c.put(request, clone))
            .catch(() => {});
          return response;
        });
      })
    );
    return;
  }
});

// ── Push Notifications (future-ready) ──────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'SI ERP', {
    body: data.body || '',
    icon: '/logo192.png',
    badge: '/logo192.png',
    data: { url: data.url || '/' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
