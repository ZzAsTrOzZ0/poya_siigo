/* Registra el SW y fuerza actualización cuando hay versión nueva (evita caché vieja en móvil/PWA). */
(function () {
  if (!('serviceWorker' in navigator)) return;

  const KEY = 'polla_app_version';

  function forzarRecargaSiVersionNueva(version) {
    if (!version) return;
    try {
      const prev = localStorage.getItem(KEY);
      if (prev && prev !== version) {
        localStorage.setItem(KEY, version);
        caches?.keys?.().then(keys => Promise.all(keys.map(k => caches.delete(k)))).finally(() => {
          location.reload();
        });
        return;
      }
      localStorage.setItem(KEY, version);
    } catch (_) {}
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js?v=11').then(reg => {
      reg.update().catch(() => {});
      if (reg.waiting) reg.waiting.postMessage({ type: 'skip-waiting' });

      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            nw.postMessage({ type: 'skip-waiting' });
          }
        });
      });
    }).catch(() => {});

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });

    /* Si config.js ya cargó (módulo), comparar versión */
    const check = () => {
      const v = window.CONFIG?.APP_VERSION;
      if (v) forzarRecargaSiVersionNueva(v);
    };
    check();
    document.addEventListener('polla-config-ready', check);
  });
})();
