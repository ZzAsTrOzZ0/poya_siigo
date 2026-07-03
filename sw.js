/* ============================================================
   POLLA SIIGO 2026 — SERVICE WORKER
   ------------------------------------------------------------
   • Cachea app shell para funcionar offline
   • Estrategia network-first con fallback a caché
   • Notificaciones push (recibidas desde el servidor o admin)
   • Sincronización periódica en background (Periodic Sync)
   • Actualización automática del SW
   ============================================================ */
const CACHE_NAME = 'polla-cache-v11';
const APP_SHELL = [
  '/',
  'index.html',
  'app.html',
  'tabla.html',
  'cuentas.html',
  'reglas.html',
  'admin.html',
  'css/estilos.css',
  'js/config.js',
  'js/fixture.js',
  'js/utils.js',
  'js/store.js',
  'js/puntos.js',
  'js/tema-dinamico.js',
  'js/sw-update.js',
  'js/api-futbol.js',
  'js/email.js',
  'js/ia.js',
  'js/grupos-api.js',
  'js/notificaciones.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'sounds/gol.mp3'
];

/* HTML y config siempre revalidan en red (evita cuentas/premios viejos en móvil). */
const REVALIDAR_SIEMPRE = /\.html$|\/js\/config\.js$|\/sw\.js$/;

function esRevalidar(url) {
  return url.origin === self.location.origin && REVALIDAR_SIEMPRE.test(url.pathname);
}

/* ─────────────────────────────────────────────
   INSTALL
   ───────────────────────────────────────────── */
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cacheando app shell');
        return cache.addAll(APP_SHELL);
      })
      .catch(error => {
        console.error('[SW] Falló el cacheo inicial', error);
      })
  );
  // Forzar activación inmediata sin esperar a que se cierren todas las pestañas
  self.skipWaiting();
});

/* ─────────────────────────────────────────────
   ACTIVATE
   ───────────────────────────────────────────── */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Limpiando cache antiguo', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Reclamar todas las pestañas para que el nuevo SW controle inmediatamente
      return self.clients.claim();
    })
  );
});

/* ─────────────────────────────────────────────
   FETCH — Network First con caché de respaldo
   ───────────────────────────────────────────── */
self.addEventListener('fetch', (event) => {
  // Solo interceptar peticiones GET
  if (event.request.method !== 'GET') return;

  // No interceptar llamadas a APIs externas ni Firebase
  const url = new URL(event.request.url);
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('api-sports.io') ||
    url.hostname.includes('cdn.jsdelivr.net')
  ) {
    return;
  }

  event.respondWith(
    (esRevalidar(url)
      ? fetch(event.request, { cache: 'no-cache' })
      : fetch(event.request)
    )
      .then(networkResponse => {
        if (networkResponse.ok && url.origin === self.location.origin) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match('index.html');
          }
          return new Response('Sin conexión', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' })
          });
        });
      })
  );
});

/* ─────────────────────────────────────────────
   PUSH — Notificaciones entrantes
   ───────────────────────────────────────────── */
self.addEventListener('push', (event) => {
  console.log('[SW] Push recibido');
  
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { titulo: 'Polla Siigo 2026', cuerpo: event.data ? event.data.text() : 'Novedad en la polla' };
  }

  const titulo = data.titulo || '⚽ Polla Siigo 2026';
  const cuerpo = data.cuerpo || data.body || '¡Hay novedades en la polla!';
  const icono = data.icon || 'icons/icon-192.png';
  const badge = data.badge || 'icons/icon-192.png';
  const tag = data.tag || 'polla-push-' + Date.now();
  const url = data.url || '/app.html';

  const opciones = {
    body: cuerpo,
    icon: icono,
    badge: badge,
    tag: tag,
    vibrate: data.vibrate || [300, 100, 200, 100, 300],
    data: {
      url: url,
      ...(data.data || {})
    },
    actions: data.actions || [
      { action: 'abrir', title: '🔍 Ver partido' },
      { action: 'cerrar', title: '✕ Cerrar' }
    ],
    requireInteraction: true,
    silent: data.silent || false
  };

  event.waitUntil(
    self.registration.showNotification(titulo, opciones)
  );
});

/* ─────────────────────────────────────────────
   CLICK EN NOTIFICACIÓN
   ───────────────────────────────────────────── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const url = data.url || '/app.html';
  const action = event.action;

  if (action === 'cerrar') return;

  // Enfocar o abrir la ventana
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // Buscar una ventana ya abierta de la polla
        for (const client of windowClients) {
          if (client.url.includes('polla') || client.url.includes('app.html')) {
            return client.focus().then(() => {
              // Si hay una URL específica, navegar
              if (url && url !== client.url) {
                return client.navigate(url);
              }
            });
          }
        }
        // Si no hay ninguna ventana abierta, abrir una nueva
        return clients.openWindow(url);
      })
  );
});

/* ─────────────────────────────────────────────
   BACKGROUND SYNC — Sincronización en segundo plano
   ───────────────────────────────────────────── */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sincronizar-partidos') {
    console.log('[SW] Sincronización en background iniciada');
    event.waitUntil(
      // Notificar a todas las pestañas que hagan sync
      clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'background-sync' });
        });
      })
    );
  }
});

/* ─────────────────────────────────────────────
   PERIODIC BACKGROUND SYNC (Chrome específico)
   ───────────────────────────────────────────── */
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'actualizar-partidos') {
    console.log('[SW] Periodic Sync: actualizando partidos...');
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'periodic-sync' });
        });
      })
    );
  }
});

/* ─────────────────────────────────────────────
   MENSAJES DESDE LA APLICACIÓN
   ───────────────────────────────────────────── */
self.addEventListener('message', async (event) => {
  if (!event.data) return;

  switch (event.data.type) {
    case 'skip-waiting':
      self.skipWaiting();
      break;

    case 'actualizar-cache':
      caches.open(CACHE_NAME).then(cache => {
        cache.addAll(APP_SHELL);
      });
      break;

    case 'notificar':
      if (event.data.titulo && event.data.cuerpo) {
        self.registration.showNotification(event.data.titulo, {
          body: event.data.cuerpo,
          icon: 'icons/icon-192.png',
          badge: 'icons/icon-192.png',
          tag: event.data.tag || 'polla-msg-' + Date.now(),
          data: { url: event.data.url || '/app.html' },
          requireInteraction: true
        });
      }
      break;

    case 'registrar-periodic-sync':
      try {
        const registration = await self.registration;
        if ('periodicSync' in registration) {
          await registration.periodicSync.register('actualizar-partidos', {
            minInterval: event.data.intervalo || 30 * 60 * 1000
          });
          console.log('[SW] Periodic Sync registrado');
        }
      } catch (e) {
        console.log('[SW] Periodic Sync no disponible:', e.message);
      }
      break;
  }
});
