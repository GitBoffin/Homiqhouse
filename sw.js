/* ============================================
   HomiqHouse Service Worker
   Version: 1.0.0
   Handles: Caching, Offline support
============================================ */

const CACHE_NAME = 'homiqhouse-v1';
const OFFLINE_URL = '/offline.html';

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// ── Install ──────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing HomiqHouse service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching assets');
      // Cache what's available, ignore failures (icons may not exist yet)
      return Promise.allSettled(
        PRECACHE_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Could not cache:', url, err))
        )
      );
    }).then(() => {
      console.log('[SW] Install complete');
      return self.skipWaiting();
    })
  );
});

// ── Activate ─────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Now controlling all pages');
      return self.clients.claim();
    })
  );
});

// ── Fetch Strategy ───────────────────────────
// Network-first for API calls (Supabase), Cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Supabase API calls — always go to network
  if (url.hostname.includes('supabase.co') || url.hostname.includes('supabase.io')) {
    return; // Let browser handle normally
  }

  // Skip Google Fonts — let browser handle
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    return;
  }

  // Skip chrome-extension and other non-http requests
  if (!request.url.startsWith('http')) return;

  // For HTML navigation requests — Network first, fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache a fresh copy
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          // Offline: serve cached version
          return caches.match(request)
            .then(cached => cached || caches.match('/'))
            .then(cached => cached || new Response(
              `<!DOCTYPE html>
              <html><head><title>HomiqHouse - Offline</title>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { background:#1A1A1A; color:#fff; font-family:sans-serif;
                  display:flex; flex-direction:column; align-items:center;
                  justify-content:center; height:100vh; text-align:center; padding:20px; }
                .logo { width:60px; height:60px; background:#B8935A; border-radius:16px;
                  display:flex; align-items:center; justify-content:center;
                  font-size:28px; margin-bottom:20px; }
                h1 { font-size:24px; margin-bottom:10px; }
                p { color:rgba(255,255,255,0.5); font-size:14px; line-height:1.6; max-width:280px; }
                button { margin-top:24px; background:#B8935A; color:#fff; border:none;
                  padding:12px 28px; border-radius:100px; font-size:14px;
                  font-weight:700; cursor:pointer; }
              </style></head>
              <body>
                <div class="logo">🏠</div>
                <h1>You're offline</h1>
                <p>Check your internet connection and try again. HomiqHouse needs internet to load listings.</p>
                <button onclick="location.reload()">Try Again</button>
              </body></html>`,
              { headers: { 'Content-Type': 'text/html' } }
            ));
        })
    );
    return;
  }

  // For static assets — Cache first, fallback to network
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        // Only cache valid responses
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      }).catch(() => {
        // Return nothing if fetch fails for non-navigation
        return new Response('', { status: 408 });
      });
    })
  );
});

// ── Background Sync (future use) ─────────────
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
});

// ── Push Notifications (future use) ──────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'HomiqHouse', {
    body: data.body || 'New update from HomiqHouse',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    data: { url: data.url || '/' }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});

console.log('[SW] HomiqHouse service worker loaded ✓');
