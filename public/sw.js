/**
 * Service Worker do B V Tasks PWA (v4)
 * - Network-First para navegação HTML (evita tela em branco após novo deploy no Render)
 * - Stale-While-Revalidate seguro para assets (valida Content-Type para nunca salvar HTML como JS/CSS)
 * - Limpeza automática de caches antigos
 */

const CACHE_VERSION = 'bv-tasks-v4';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(APP_SHELL_ASSETS).catch(() => {
        // Ignora falha individual no pré-cache para não bloquear a instalação
      }),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((oldKey) => caches.delete(oldKey)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) {
    return;
  }

  // 1. Navegação HTML: SEMPRE Network-First para carregar os hashes JS/CSS mais recentes do Render.
  // Se estiver sem internet (offline), usa o /index.html salvo no cache.
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put('/index.html', copy);
            });
          }
          return response;
        })
        .catch(async () => {
          const cachedIndex = await caches.match('/index.html');
          if (cachedIndex) return cachedIndex;
          const cachedRoot = await caches.match('/');
          return cachedRoot || Response.error();
        }),
    );
    return;
  }

  // 2. Assets estáticos (JS, CSS, Imagens, Fontes):
  // Verifica no cache e atualiza em segundo plano, garantindo que NUNCA armazene text/html no lugar de um .js/.css
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const contentType = networkResponse.headers.get('content-type') || '';
            const isAssetRequest = /\.(js|css|png|svg|ico|woff2?|json)$/i.test(
              new URL(request.url).pathname,
            );
            // Proteção contra SPA fallback salvando HTML como se fosse JS/CSS
            if (!(isAssetRequest && contentType.includes('text/html'))) {
              const responseToCache = networkResponse.clone();
              caches.open(RUNTIME_CACHE).then((cache) => {
                cache.put(request, responseToCache);
              });
            }
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
