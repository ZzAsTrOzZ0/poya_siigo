/* Banner global de mantenimiento (ajustes.GLOBAL.mantenimiento) */
(async function () {
  async function run() {
    for (let i = 0; i < 80; i++) {
      if (typeof Store !== 'undefined' && typeof U?.pintarBannerMantenimiento === 'function') break;
      await new Promise(r => setTimeout(r, 50));
    }
    if (typeof Store?.init === 'function') {
      try { await Store.init(); } catch (_) { /* la página también llama init */ }
    }
    if (typeof U?.pintarBannerMantenimiento !== 'function') return;
    try { await U.pintarBannerMantenimiento(); } catch (_) { /* sin bloquear la app */ }
    if (typeof Store?.enCambios === 'function') {
      Store.enCambios(() => U.pintarBannerMantenimiento().catch(() => {}));
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
