// ── BudgetFlow Pro Service Worker ──
const CACHE_NAME    = 'budgetflow-v1';
const RUNTIME_CACHE = 'budgetflow-runtime-v1';

// Files to cache on install (your app shell)
const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
];

// ── Install: cache app shell ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ──
self.addEventListener('activate', event => {
  const validCaches = [CACHE_NAME, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => !validCaches.includes(key))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache, fall back to network ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and browser-extension requests
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // For exchange rate API — network first, fall back to cache
  if (url.hostname.includes('exchangerate-api.com')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // For Anthropic AI API — always use network, never cache
  if (url.hostname.includes('anthropic.com')) {
    event.respondWith(fetch(request));
    return;
  }

  // For everything else — cache first, fall back to network
  event.respondWith(cacheFirstStrategy(request));
});

// ── Cache-first strategy ──
async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Cache valid responses at runtime
    if (response.ok && response.type !== 'opaque') {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // If offline and nothing cached, return offline fallback
    return offlineFallback(request);
  }
}

// ── Network-first strategy ──
async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || offlineFallback(request);
  }
}

// ── Offline fallback ──
function offlineFallback(request) {
  const url = new URL(request.url);
  // For HTML navigation requests, serve the app shell
  if (request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname === '/') {
    return caches.match('./index.html');
  }
  // For everything else return a simple offline response
  return new Response('Offline — content not available', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain' }
  });
}

// ── Push Notifications ──
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : { title: 'BudgetFlow', body: 'You have a new alert.' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f4b0.png',
      badge: 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f4b0.png',
      vibrate: [200, 100, 200],
      tag: 'budgetflow-alert',
      renotify: true,
      data: { url: data.url || './' }
    })
  );
});

// ── Notification click — open the app ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url || './');
      }
    })
  );
});

// ── Background sync (for future use) ──
self.addEventListener('sync', event => {
  if (event.tag === 'sync-transactions') {
    // Placeholder for future cloud sync feature
    console.log('Background sync triggered:', event.tag);
  }
});
