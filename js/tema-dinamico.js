/* Tema especial Colombia — "Hoy juega la Selección"
   Auto: se activa el día que Colombia juega (hora Bogotá).
   Admin: Activar/Quitar en panel → localStorage → todas las páginas. */
(function () {
  const STORAGE = 'polla_tema_colombia';
  const CSS_ID = 'tema-colombia-css';
  const BANNER_ID = 'banner-colombia-hoy';
  const TRICOLOR = ['#FFCD00', '#003893', '#CE1126'];
  const BG_URL = 'https://images.pexels.com/photos/274506/pexels-photo-274506.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2';

  function fechaColombia(d) {
    return (d || new Date()).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  }

  function nombreEquipo(c) {
    const F = window.FIXTURE;
    return F?.equipo?.(c)?.n || c || '';
  }

  function partidosColombia() {
    const F = window.FIXTURE;
    if (!F?.partidos) return [];
    const out = [];
    const vistos = new Set();
    for (const p of F.partidos) {
      if (p.local === 'COL' || p.visitante === 'COL') {
        out.push(p);
        vistos.add(p.id);
      }
    }
    const mapa = F.koR32Oficial || {};
    for (const [pair, pid] of Object.entries(mapa)) {
      if (!pair.includes('COL') || vistos.has(pid)) continue;
      const base = F.porId(pid);
      if (!base) continue;
      const [a, b] = pair.split('|');
      out.push({ ...base, local: a, visitante: b });
      vistos.add(pid);
    }
    return out;
  }

  function partidoColombiaHoy() {
    const hoy = fechaColombia();
    for (const p of partidosColombia()) {
      if (window.U?.esPartidoEnDia?.(p, hoy, {})) return p;
      if (p.utc && fechaColombia(new Date(p.utc)) === hoy) return p;
      if (p.fecha === hoy) return p;
      if (p.fase === 'eliminatorias' && p.fecha) {
        const msDia = Date.parse(`${hoy}T05:00:00.000Z`);
        const msF = Date.parse(`${p.fecha}T05:00:00.000Z`);
        if (Math.abs(msF - msDia) <= 36 * 60 * 60 * 1000) return p;
      }
    }
    return null;
  }

  function modoGuardado() {
    try { return localStorage.getItem(STORAGE); } catch (_) { return null; }
  }

  function debeActivarse() {
    const modo = modoGuardado();
    if (modo === 'on') return true;
    if (modo === 'off') return false;
    return !!partidoColombiaHoy();
  }

  function horaPartido(p) {
    if (!p?.utc || !window.U?.horaLocal) return '';
    return `${window.U.diaLocal(p.utc)} · ${window.U.horaLocal(p.utc)}`;
  }

  function inyectarCss() {
    if (document.getElementById(CSS_ID)) return;
    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
      @keyframes pan-bg-col { 0% { background-position: 0% 50%; } 100% { background-position: 100% 50%; } }
      @keyframes brillo-tricolor {
        0%, 100% { opacity: .92; }
        50% { opacity: 1; }
      }

      body.tema-colombia {
        --col-amarillo: #FFCD00;
        --col-azul: #003893;
        --col-rojo: #CE1126;
        --azul: #1a4fc2;
        --azul-claro: #5b8cff;
        --dorado: #FFCD00;
        --copa-oro: #ffe566;
        --rojo: #e84057;
        --verde: #1fa84d;
        --navy: #070e1f;
        --superficie: #0c1630;
        --superficie-2: #122040;
        --linea: rgba(255, 205, 0, 0.18);
        background:
          radial-gradient(ellipse 55% 40% at 0% 0%, rgba(255, 205, 0, 0.09), transparent 55%),
          radial-gradient(ellipse 50% 45% at 100% 15%, rgba(0, 56, 147, 0.14), transparent 55%),
          radial-gradient(ellipse 45% 35% at 50% 100%, rgba(206, 17, 38, 0.08), transparent 55%),
          linear-gradient(rgba(7, 14, 31, 0.82), rgba(7, 14, 31, 0.92)),
          url('${BG_URL}');
        background-size: auto, auto, auto, cover, cover;
        background-position: center center;
        background-attachment: fixed;
        animation: pan-bg-col 80s linear infinite alternate;
      }

      body.tema-colombia::before {
        background:
          linear-gradient(180deg, rgba(255,205,0,.04) 0%, transparent 8%, transparent 92%, rgba(206,17,38,.04) 100%),
          radial-gradient(circle 180px at 50% 35%, transparent 178px, rgba(255,255,255,.02) 179px 180px, transparent 181px),
          repeating-linear-gradient(90deg, transparent 0 119px, rgba(255,255,255,.012) 119px 120px);
      }

      body.tema-colombia .panel,
      body.tema-colombia .partido,
      body.tema-colombia .modal-contenido,
      body.tema-colombia .campeon-op,
      body.tema-colombia .sala-card,
      body.tema-colombia .heroe,
      body.tema-colombia .podio__caja,
      body.tema-colombia .tabla-envoltura {
        background: rgba(12, 22, 48, 0.82);
        backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        border-color: rgba(255, 205, 0, 0.12);
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.25);
      }

      body.tema-colombia .barra {
        background: rgba(8, 14, 32, 0.88);
        backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        border-bottom: 2px solid transparent;
        border-image: linear-gradient(90deg, #FFCD00, #003893, #CE1126) 1;
      }
      body.tema-colombia .barra::after { opacity: .08; }

      body.tema-colombia .nav a.activo,
      body.tema-colombia .chip.activo {
        border-color: rgba(255, 205, 0, 0.45);
        background: rgba(255, 205, 0, 0.1);
        color: var(--col-amarillo);
      }

      body.tema-colombia .boton--verde {
        background: linear-gradient(135deg, #003893, #1a56c4);
        border: 1px solid rgba(255, 205, 0, 0.25);
      }
      body.tema-colombia .boton--verde:hover {
        background: linear-gradient(135deg, #1a56c4, #003893);
        box-shadow: 0 4px 18px rgba(0, 56, 147, 0.35);
      }

      body.tema-colombia .acento,
      body.tema-colombia [data-prox-reloj] {
        color: var(--col-amarillo) !important;
        text-shadow: 0 0 24px rgba(255, 205, 0, 0.2);
      }

      body.tema-colombia .partido:has([data-local="COL"]),
      body.tema-colombia .partido.colombia-hoy {
        border-color: rgba(255, 205, 0, 0.35);
        box-shadow: 0 0 0 1px rgba(0, 56, 147, 0.2), 0 8px 28px rgba(255, 205, 0, 0.08);
      }

      .banner-colombia-hoy {
        position: relative; z-index: 9998;
        background:
          linear-gradient(135deg,
            rgba(255, 205, 0, 0.95) 0%,
            rgba(255, 205, 0, 0.88) 32%,
            rgba(0, 56, 147, 0.92) 33%,
            rgba(0, 56, 147, 0.88) 66%,
            rgba(206, 17, 38, 0.92) 67%,
            rgba(206, 17, 38, 0.95) 100%);
        animation: brillo-tricolor 5s ease-in-out infinite;
        color: #fff; text-align: center;
        padding: 12px 16px 13px;
        font-size: 15px; font-weight: 800;
        letter-spacing: 0.4px;
        text-shadow: 0 1px 4px rgba(0,0,0,.35);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        line-height: 1.35;
      }
      .banner-colombia-hoy__sub {
        display: block; margin-top: 4px;
        font-size: 12px; font-weight: 600; opacity: .92;
      }
      .banner-colombia-hoy__vs {
        display: inline-flex; align-items: center; gap: 8px;
        margin-top: 7px; padding: 5px 16px;
        background: rgba(0,0,0,.22); border-radius: 999px;
        font-size: 13px; font-weight: 700;
        border: 1px solid rgba(255,255,255,.15);
      }
    `;
    document.head.appendChild(style);
  }

  function marcarPartidosColombia() {
    document.querySelectorAll('.partido').forEach(el => {
      const txt = el.textContent || '';
      if (txt.includes('Colombia') || txt.includes('\uD83C\uDDE8\uD83C\uDDF4')) {
        el.classList.add('colombia-hoy');
      }
    });
  }

  function inyectarBanner(p) {
    if (document.getElementById(BANNER_ID)) return;
    const rival = p.local === 'COL' ? p.visitante : p.local;
    const hora = horaPartido(p);
    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.className = 'banner-colombia-hoy';
    banner.setAttribute('role', 'status');
    banner.innerHTML = `
      🇨🇴 ¡HOY JUEGA COLOMBIA!
      <span class="banner-colombia-hoy__sub">Vamos con todo · Entra y pronostica</span>
      <span class="banner-colombia-hoy__vs">
        ${nombreEquipo('COL')} vs ${nombreEquipo(rival)}
        ${hora ? ` · ${hora}` : ''}
      </span>`;
    const mant = document.getElementById('banner-mantenimiento');
    if (mant?.parentNode) mant.parentNode.insertBefore(banner, mant.nextSibling);
    else document.body.insertBefore(banner, document.body.firstChild);
  }

  function quitarBanner() {
    document.getElementById(BANNER_ID)?.remove();
  }

  function cambiarIconos() {
    const favicon = document.querySelector("link[rel*='icon']");
    if (favicon) {
      favicon.href = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>\uD83C\uDDE8\uD83C\uDDF4</text></svg>";
    }
    document.querySelectorAll('.logo__balon').forEach(el => { el.textContent = '\uD83C\uDDE8\uD83C\uDDF4'; });
    document.querySelectorAll('.logo__img').forEach(el => {
      if (!el.dataset.temaColombia) el.dataset.temaColombia = el.src;
      el.style.display = 'none';
      const bandera = el.parentElement?.querySelector('.logo__bandera-col');
      if (!bandera) {
        const span = document.createElement('span');
        span.className = 'logo__bandera-col';
        span.textContent = '\uD83C\uDDE8\uD83C\uDDF4';
        span.style.fontSize = '28px';
        span.style.lineHeight = '1';
        el.parentElement?.insertBefore(span, el);
      }
    });
  }

  function restaurarIconos() {
    document.querySelectorAll('.logo__img[data-tema-colombia]').forEach(el => {
      el.style.display = '';
      el.parentElement?.querySelector('.logo__bandera-col')?.remove();
    });
  }

  function mensajesPagina(p) {
    const saludo = document.getElementById('saludo');
    if (saludo && !saludo.dataset.temaColombia) {
      saludo.dataset.temaColombia = '1';
      saludo.innerHTML += ' <span style="color:var(--dorado);font-weight:400">— \u00a1Vamos, Colombia! \uD83C\uDDE8\uD83C\uDDF4</span>';
    }
    const cta = document.getElementById('hero-cta');
    if (cta && !cta.dataset.temaColombia) {
      cta.dataset.temaColombia = '1';
      const rival = p ? (p.local === 'COL' ? nombreEquipo(p.visitante) : nombreEquipo(p.local)) : 'la Selecci\u00f3n';
      cta.innerHTML = `<b>\u00a1Hoy juega Colombia vs ${rival}! \uD83C\uDDE8\uD83C\uDDF4</b><br>Entra, pronostica y demuestra tu apoyo.`;
    }
    const logoTxt = document.getElementById('logo-texto');
    if (logoTxt && !logoTxt.dataset.temaColombia) {
      logoTxt.dataset.temaColombia = '1';
      logoTxt.innerHTML = 'Polla Siigo <small>\u00a1Hoy juega Colombia! \uD83C\uDDE8\uD83C\uDDF4</small>';
    }
  }

  function limpiarMensajesPagina() {
    document.querySelectorAll('[data-tema-colombia]').forEach(el => {
      delete el.dataset.temaColombia;
    });
  }

  function lanzarConfeti() {
    if (typeof confetti !== 'function') {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';
      s.onload = () => setTimeout(lanzarConfeti, 200);
      document.head.appendChild(s);
      return;
    }
    const end = Date.now() + 3000;
    (function frame() {
      if (Date.now() > end) return;
      confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 }, colors: TRICOLOR });
      confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 }, colors: TRICOLOR });
      requestAnimationFrame(frame);
    }());
  }

  function activar(opciones = {}) {
    const p = partidoColombiaHoy();
    inyectarCss();
    document.body.classList.add('tema-colombia');
    inyectarBanner(p || { local: 'COL', visitante: '???' });
    cambiarIconos();
    mensajesPagina(p);
    setTimeout(marcarPartidosColombia, 500);
    document.addEventListener('DOMContentLoaded', marcarPartidosColombia, { once: true });
    if (opciones.forzar) {
      try { localStorage.setItem(STORAGE, 'on'); } catch (_) {}
    }
    if (!window._temaColombiaConfeti && !sessionStorage.getItem('polla_tema_col_confeti')) {
      window._temaColombiaConfeti = true;
      try { sessionStorage.setItem('polla_tema_col_confeti', '1'); } catch (_) {}
      setTimeout(lanzarConfeti, opciones.confeti === false ? 999999 : 800);
    }
  }

  function desactivar(opciones = {}) {
    document.body.classList.remove('tema-colombia');
    document.querySelectorAll('.partido.colombia-hoy').forEach(el => el.classList.remove('colombia-hoy'));
    document.getElementById(CSS_ID)?.remove();
    quitarBanner();
    restaurarIconos();
    limpiarMensajesPagina();
    window._temaColombiaConfeti = false;
    try { sessionStorage.removeItem('polla_tema_col_confeti'); } catch (_) {}
    if (opciones.forzar) {
      try { localStorage.setItem(STORAGE, 'off'); } catch (_) {}
    }
  }

  function aplicar() {
    if (debeActivarse()) activar({ confeti: modoGuardado() !== 'on' });
    else desactivar();
  }

  function intentarAplicar(reintentos) {
    if (window.FIXTURE?.partidos || modoGuardado() === 'on') {
      aplicar();
      return;
    }
    if (reintentos > 0) setTimeout(() => intentarAplicar(reintentos - 1), 120);
  }

  window.TemaColombia = {
    activar,
    desactivar,
    aplicar,
    marcarPartidosColombia,
    partidoColombiaHoy,
    juegaColombiaHoy: () => !!partidoColombiaHoy()
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => intentarAplicar(25));
  } else {
    intentarAplicar(25);
  }
})();
