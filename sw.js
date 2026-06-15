// ═══════════════════════════════════════════════════
// FlashSnap Service Worker
// Strategy: Cache-first for app shell, Network-first for API calls
// ═══════════════════════════════════════════════════

const CACHE_NAME = 'flashsnap-shell-v1';

// App shell — ye files offline mein bhi kaam karengi
const SHELL_URLS = [
  './',
  './index.html',
  './manifest.json'
];

// ── INSTALL — cache app shell ────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(SHELL_URLS);
    }).then(() => {
      // Immediately activate without waiting for old SW
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE — delete old caches ────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH — strategy per request type ───────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Gemini API calls — network only, no cache
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('generativelanguage')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Google Fonts — network first, fallback to cache
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // App shell — cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache valid GET responses
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback — return index.html for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── MESSAGE — force update from app ─────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
