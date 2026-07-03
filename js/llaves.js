/* Cuadro eliminatorio — bracket simétrico tipo TV (colores Siigo). */

const FEEDERS = {
  'ko-89': ['ko-74', 'ko-77'],
  'ko-90': ['ko-73', 'ko-75'],
  'ko-91': ['ko-79', 'ko-80'],
  'ko-92': ['ko-81', 'ko-82'],
  'ko-93': ['ko-86', 'ko-88'],
  'ko-94': ['ko-87', 'ko-85'],
  'ko-95': ['ko-83', 'ko-84'],
  'ko-96': ['ko-76', 'ko-78'],
  'ko-97': ['ko-89', 'ko-90'],
  'ko-98': ['ko-93', 'ko-94'],
  'ko-99': ['ko-91', 'ko-92'],
  'ko-100': ['ko-95', 'ko-96'],
  'ko-101': ['ko-97', 'ko-98'],
  'ko-102': ['ko-99', 'ko-100'],
  'ko-103': ['ko-101', 'ko-102'],
  'ko-104': ['ko-101', 'ko-102']
};

const FEEDERS_PERDEDOR = { 'ko-103': ['ko-101', 'ko-102'] };

/* Cuartos (P97+) en adelante: no mostrar países hasta que ESE partido empiece. */
function esCuartosOMas(pid) {
  const n = parseInt(String(pid).replace('ko-', ''), 10);
  return Number.isFinite(n) && n >= 97;
}

const GRID_FILAS = 16;

/* Orden visual FIFA: mitad izquierda P74→P82, mitad derecha P76→P87 */
const MITAD_IZQ = [
  { ronda: '16avos', label: '16avos', ids: ['ko-74', 'ko-77', 'ko-73', 'ko-75', 'ko-83', 'ko-84', 'ko-81', 'ko-82'] },
  { ronda: '8vos', label: '8vos', ids: ['ko-89', 'ko-90', 'ko-95', 'ko-92'] },
  { ronda: '4tos', label: '4tos', ids: ['ko-97', 'ko-98'] },
  { ronda: 'semis', label: 'Semis', ids: ['ko-101'] }
];

const MITAD_DER = [
  { ronda: '16avos', label: '16avos', ids: ['ko-76', 'ko-78', 'ko-79', 'ko-80', 'ko-86', 'ko-88', 'ko-85', 'ko-87'] },
  { ronda: '8vos', label: '8vos', ids: ['ko-96', 'ko-91', 'ko-93', 'ko-94'] },
  { ronda: '4tos', label: '4tos', ids: ['ko-99', 'ko-100'] },
  { ronda: 'semis', label: 'Semis', ids: ['ko-102'] }
];

function cortarEtiq(s) {
  if (!s || s === 'Por definir') return '';
  const m = String(s).match(/(\d)\.?º\s*(?:Grupo\s*)?([A-Z][\w/]*)/i);
  if (m) return `${m[1]}º ${m[2]}`;
  if (s.startsWith('Ganador') || s.startsWith('Perdedor')) return s.replace(' partido ', ' P');
  return s.length > 14 ? `${s.slice(0, 13)}…` : s;
}

function gridPos(roundIdx, matchIdx) {
  const span = Math.pow(2, roundIdx + 1);
  const start = matchIdx * span + 1;
  return { start, end: start + span };
}

function yCentro(roundIdx, matchIdx) {
  const { start, end } = gridPos(roundIdx, matchIdx);
  return ((start + end - 1) / 2 / GRID_FILAS) * 100;
}

function svgConector(roundIdx, invertido = false) {
  const n = Math.pow(2, 3 - roundIdx);
  const paths = [];
  const stroke = 'rgba(143,164,203,.65)';
  for (let m = 0; m < n; m++) {
    const yA = yCentro(roundIdx, m * 2);
    const yB = yCentro(roundIdx, m * 2 + 1);
    const yC = yCentro(roundIdx + 1, m);
    const yM = (yA + yB) / 2;
    if (invertido) {
      paths.push(`<path d="M 12 ${yA} H 8 V ${yM} H 4 V ${yC} H 0" fill="none" stroke="${stroke}" stroke-width="1.2"/>`);
      paths.push(`<path d="M 12 ${yB} H 8 V ${yM}" fill="none" stroke="${stroke}" stroke-width="1.2"/>`);
    } else {
      paths.push(`<path d="M 0 ${yA} H 4 V ${yM} H 8 V ${yC} H 12" fill="none" stroke="${stroke}" stroke-width="1.2"/>`);
      paths.push(`<path d="M 0 ${yB} H 4 V ${yM}" fill="none" stroke="${stroke}" stroke-width="1.2"/>`);
    }
  }
  return `<svg class="bracket-mundial__svg" viewBox="0 0 12 100" preserveAspectRatio="none" aria-hidden="true">${paths.join('')}</svg>`;
}

const Llaves = {
  ganadorPartido(pid, resultados, ajustes) {
    const res = resultados[pid];
    if (!res || res.estado !== 'finalizado') return null;
    const p = Puntos.conAjustes(FIXTURE.porId(pid) || {}, ajustes);
    if (!p.local || !p.visitante) return null;
    if (res.gl > res.gv) return p.local;
    if (res.gv > res.gl) return p.visitante;
    return res.ganadorPenales || null;
  },

  perdedorPartido(pid, resultados, ajustes) {
    const res = resultados[pid];
    if (!res || res.estado !== 'finalizado') return null;
    const p = Puntos.conAjustes(FIXTURE.porId(pid) || {}, ajustes);
    if (!p.local || !p.visitante) return null;
    if (res.gl > res.gv) return p.visitante;
    if (res.gv > res.gl) return p.local;
    return res.perdedorPenales || null;
  },

  /* ¿Terminó el partido fuente con ganador/perdedor definido? */
  _fuenteResuelta(src, resultados, ajustes, perdedor = false) {
    const fn = perdedor ? this.perdedorPartido.bind(this) : this.ganadorPartido.bind(this);
    return !!fn(src, resultados, ajustes);
  },

  /* ¿Los dos cruces anteriores ya tienen ganador? (requisito para jugar este slot). */
  _crucesPreviosListos(feeders, resultados, ajustes, perdedor = false) {
    if (!feeders?.length) return true;
    return feeders.every(src => this._fuenteResuelta(src, resultados, ajustes, perdedor));
  },

  /* Solo en vivo/finalizado si el partido REALMENTE empezó o terminó en Firestore. */
  _partidoJugable(pid, resultados, ajustes, perdedor = false) {
    const res = resultados[pid] || {};
    if (res.estado !== 'en_juego' && res.estado !== 'finalizado') return false;
    const feeders = (perdedor ? FEEDERS_PERDEDOR : FEEDERS)[pid];
    if (!feeders) return true;
    return this._crucesPreviosListos(feeders, resultados, ajustes, perdedor);
  },

  claveSlot(pid, ctx) {
    const p = Puntos.conAjustes(FIXTURE.porId(pid) || {}, ctx.ajustes);
    if (p.local && p.visitante && p.local !== 'Por definir' && p.visitante !== 'Por definir') {
      return U.clavePartidoDuplicado(p);
    }
    return pid;
  },

  _slotPendiente(nPartido, perdedor = false) {
    const pref = perdedor ? 'Perd.' : 'Gan.';
    return {
      eq: { n: `${pref} P${nPartido}`, b: '·', g: '' },
      cod: null,
      etiq: '',
      grupo: '',
      pendiente: true
    };
  },

  equipoSlot(pid, lado, ctx, opts = {}) {
    const { resultados, ajustes } = ctx;
    const usarPerdedor = opts.perdedor;
    const feedersMap = usarPerdedor ? FEEDERS_PERDEDOR : FEEDERS;
    const p = Puntos.conAjustes(FIXTURE.porId(pid) || {}, ajustes);
    const etiq = lado === 'local' ? p.etiqL : p.etiqV;
    const codigo = lado === 'local' ? p.local : p.visitante;
    const feeders = feedersMap[pid];
    const jugable = this._partidoJugable(pid, resultados, ajustes, usarPerdedor);

    const pack = (eq, cod, etiqTxt, grupo = '', pendiente = false) => ({
      eq, cod: cod || null, etiq: cortarEtiq(etiqTxt), grupo, pendiente
    });

    /* Octavos: ganador del 16avos anterior. Cuartos+: solo placeholder hasta pitazo. */
    if (feeders) {
      const src = lado === 'local' ? feeders[0] : feeders[1];
      const n = src.replace('ko-', '');

      if (esCuartosOMas(pid) && !jugable) {
        return this._slotPendiente(n, usarPerdedor);
      }

      const fn = usarPerdedor ? this.perdedorPartido.bind(this) : this.ganadorPartido.bind(this);
      const w = fn(src, resultados, ajustes);
      if (w) {
        const eq = FIXTURE.equipo(w);
        return pack(eq, w, '', eq.g || '', false);
      }
      return this._slotPendiente(n, usarPerdedor);
    }

    /* Dieciseisavos: equipos del calendario. */
    if (codigo && codigo !== 'Por definir') {
      const eq = FIXTURE.equipo(codigo);
      return pack(eq, codigo, etiq, eq.g || '', false);
    }
    return pack(
      FIXTURE.equipo(etiq || 'Por definir'),
      null,
      etiq,
      '',
      !jugable
    );
  },

  renderCaja(pid, ctx, opts = {}) {
    const { resultados, ajustes } = ctx;
    const duplicadoDe = opts.duplicadoDe;
    const mini = opts.mini;
    const esTercer = pid === 'ko-103';
    const esFinal = pid === 'ko-104';
    const res = resultados[pid] || {};
    const num = pid.replace('ko-', '');
    const feeders = (esTercer ? FEEDERS_PERDEDOR : FEEDERS)[pid];
    const jugable = this._partidoJugable(pid, resultados, ajustes, esTercer);
    const previosOk = !feeders || this._crucesPreviosListos(feeders, resultados, ajustes, esTercer);
    const futuro = (esCuartosOMas(pid) && !jugable)
      || (feeders && !previosOk && !jugable);

    if (duplicadoDe) {
      return `<div class="bracket-mundial__box bracket-mundial__box--alias" data-pid="${pid}">
        <span class="bracket-mundial__pid">P${num}</span>
        <span class="bracket-mundial__alias">↔ P${duplicadoDe.replace('ko-', '')}</span>
      </div>`;
    }

    const loc = this.equipoSlot(pid, 'local', ctx, { perdedor: esTercer });
    const vis = this.equipoSlot(pid, 'visitante', ctx, { perdedor: esTercer });
    const marcadorOk = typeof res.gl === 'number' && typeof res.gv === 'number';
    const enJuego = jugable && res.estado === 'en_juego';
    const finalizado = jugable && res.estado === 'finalizado';
    const mostrarGoles = marcadorOk && (enJuego || finalizado);
    const gl = mostrarGoles ? res.gl : '';
    const gv = mostrarGoles ? res.gv : '';
    const ganador = finalizado ? this.ganadorPartido(pid, resultados, ajustes) : null;

    const fila = (slot, goles) => {
      const win = ganador && slot.cod && slot.cod === ganador;
      const pend = slot.pendiente;
      return `<div class="bracket-mundial__row${win ? ' bracket-mundial__row--win' : ''}${pend ? ' bracket-mundial__row--pend' : ''}">
        <span class="bracket-mundial__flag">${slot.eq.b}</span>
        <span class="bracket-mundial__team" title="${U.esc(slot.eq.n)}">${U.esc(slot.eq.n)}</span>
        ${!mini && slot.etiq ? `<span class="bracket-mundial__seed" title="${U.esc(slot.etiq)}">${U.esc(slot.etiq)}</span>` : ''}
        <span class="bracket-mundial__pts">${goles !== '' ? goles : ''}</span>
      </div>`;
    };

    const badge = enJuego ? '<span class="bracket-mundial__live">●</span>'
      : (finalizado && marcadorOk && ganador) ? '<span class="bracket-mundial__fin">✓</span>'
      : (finalizado && marcadorOk && res.gl === res.gv) ? '<span class="bracket-mundial__pend" title="Empate — pendiente penales">⏳</span>'
      : '';

    const cls = [
      'bracket-mundial__box',
      mini ? 'bracket-mundial__box--mini' : '',
      opts.r16 ? 'bracket-mundial__box--r16' : '',
      futuro ? 'bracket-mundial__box--futuro' : '',
      esFinal ? 'bracket-mundial__box--final' : '',
      esTercer ? 'bracket-mundial__box--tercer' : ''
    ].filter(Boolean).join(' ');

    return `<div class="${cls}" data-pid="${pid}">
      <div class="bracket-mundial__box-head">
        <span class="bracket-mundial__pid">P${num}</span>
        ${badge}
      </div>
      ${fila(loc, gl)}
      ${fila(vis, gv)}
    </div>`;
  },

  /* Para 16avos duplicados: el slot oficial P73–P88 siempre es el que se muestra. */
  _canon16avos(ids, ctx) {
    const canon = new Map();
    for (const id of ids) {
      const px = Puntos.conAjustes(FIXTURE.porId(id) || {}, ctx.ajustes);
      if (!px.local || !px.visitante || px.local === 'Por definir') continue;
      const key = this.claveSlot(id, ctx);
      const ofId = U.idSlotKoOficial(px.local, px.visitante);
      const prev = canon.get(key);
      if (!prev) {
        canon.set(key, id);
        continue;
      }
      if (ofId === id) canon.set(key, id);
      else if (ofId === prev) continue;
      else if ((FIXTURE.porId(id)?.n || 999) < (FIXTURE.porId(prev)?.n || 999)) canon.set(key, id);
    }
    return canon;
  },

  renderMitad(rondas, ctx, lado) {
    const invertido = lado === 'der';
    const partes = [];

    rondas.forEach((round, ri) => {
      const canon16 = round.ronda === '16avos' ? this._canon16avos(round.ids, ctx) : null;
      partes.push(`<div class="bracket-mundial__col" data-ronda="${round.ronda}">
        <div class="bracket-mundial__col-label">${U.esc(round.label)}</div>
        <div class="bracket-mundial__col-grid">
          ${round.ids.map((id, mi) => {
            let duplicadoDe = null;
            if (canon16) {
              const key = this.claveSlot(id, ctx);
              const canonId = canon16.get(key);
              if (canonId && canonId !== id) duplicadoDe = canonId;
            }
            const g = gridPos(ri, mi);
            const mini = ri > 0;
            return `<div class="bracket-mundial__slot" style="grid-row:${g.start}/${g.end}">
              ${this.renderCaja(id, ctx, { duplicadoDe, mini, r16: round.ronda === '16avos' })}
            </div>`;
          }).join('')}
        </div>
      </div>`);

      if (ri < rondas.length - 1) {
        partes.push(`<div class="bracket-mundial__pipe">${svgConector(ri, invertido)}</div>`);
      }
    });

    return `<div class="bracket-mundial__half bracket-mundial__half--${lado}">${partes.join('')}</div>`;
  },

  renderCentro(ctx) {
    const semiY101 = yCentro(3, 0);
    const semiY102 = yCentro(3, 0);
    const stroke = 'rgba(143,164,203,.65)';
    const svg = `<svg class="bracket-mundial__svg bracket-mundial__svg--centro" viewBox="0 0 20 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M 0 ${semiY101} H 8 V 42 H 12" fill="none" stroke="${stroke}" stroke-width="1.2"/>
      <path d="M 20 ${semiY102} H 12 V 58 H 8" fill="none" stroke="${stroke}" stroke-width="1.2"/>
    </svg>`;

    return `<div class="bracket-mundial__center">
      ${svg}
      <div class="bracket-mundial__final-block">
        <div class="bracket-mundial__trofeo">🏆</div>
        <div class="bracket-mundial__final-label">FINAL</div>
        ${this.renderCaja('ko-104', ctx, {})}
        <div class="bracket-mundial__tercer-label">3.er puesto</div>
        ${this.renderCaja('ko-103', ctx, {})}
      </div>
    </div>`;
  },

  _initScroll(root) {
    const sc = root.querySelector('.bracket-mundial__scroll');
    const prev = root.querySelector('[data-bracket-prev]');
    const next = root.querySelector('[data-bracket-next]');
    const zoomWrap = root.querySelector('.bracket-mundial__zoom-wrap');
    const btnMenos = root.querySelector('[data-bracket-zoom-out]');
    const btnMas = root.querySelector('[data-bracket-zoom-in]');
    if (!sc) return;

    let zoom = parseFloat(localStorage.getItem('bracketZoom') || '1') || 1;
    zoom = Math.min(1.25, Math.max(0.85, zoom));

    const aplicarZoom = (z) => {
      zoom = Math.min(1.25, Math.max(0.85, Math.round(z * 100) / 100));
      if (zoomWrap) zoomWrap.style.transform = `scale(${zoom})`;
      localStorage.setItem('bracketZoom', String(zoom));
      if (btnMenos) btnMenos.disabled = zoom <= 0.85;
      if (btnMas) btnMas.disabled = zoom >= 1.25;
    };
    aplicarZoom(zoom);
    btnMenos?.addEventListener('click', () => aplicarZoom(zoom - 0.1));
    btnMas?.addEventListener('click', () => aplicarZoom(zoom + 0.1));

    const step = () => Math.max(360, sc.clientWidth * 0.55);
    const sync = () => {
      const max = sc.scrollWidth - sc.clientWidth - 2;
      if (prev) prev.disabled = sc.scrollLeft <= 2;
      if (next) next.disabled = sc.scrollLeft >= max;
    };
    prev?.addEventListener('click', () => { sc.scrollBy({ left: -step(), behavior: 'smooth' }); });
    next?.addEventListener('click', () => { sc.scrollBy({ left: step(), behavior: 'smooth' }); });
    sc.addEventListener('scroll', sync, { passive: true });

    /* Enfocar octavos (ronda actual) al abrir el cuadro. */
    requestAnimationFrame(() => {
      const col8 = root.querySelector('.bracket-mundial__col[data-ronda="8vos"]');
      if (col8) {
        const target = col8.getBoundingClientRect().left - sc.getBoundingClientRect().left + sc.scrollLeft - 24;
        sc.scrollLeft = Math.max(0, target);
      }
      sync();
    });
  },

  pintar(contenedor, ctx) {
    if (!contenedor) return;

    contenedor.innerHTML = `<div class="bracket-mundial">
      <div class="bracket-mundial__top">
        <span class="bracket-mundial__logo">🏆</span>
        <span class="bracket-mundial__titulo">Eliminatorias · Mundial 2026</span>
      </div>
      <p class="bracket-mundial__leyenda">
        <b>16avos y 8vos</b> se van llenando con ganadores reales.
        <b>Cuartos, semis y final</b> dicen <b>Gan. P89</b> hasta que ese partido empiece.
      </p>
      <div class="bracket-mundial__nav">
        <button type="button" class="bracket-mundial__arrow" data-bracket-prev aria-label="Ver izquierda" disabled>‹</button>
        <span class="bracket-mundial__nav-hint">Desliza horizontalmente · empieza en <b>8vos</b></span>
        <button type="button" class="bracket-mundial__arrow" data-bracket-next aria-label="Ver derecha">›</button>
        <span class="bracket-mundial__zoom">
          <button type="button" class="bracket-mundial__zoom-btn" data-bracket-zoom-out aria-label="Alejar">−</button>
          <button type="button" class="bracket-mundial__zoom-btn" data-bracket-zoom-in aria-label="Acercar">+</button>
        </span>
      </div>
      <div class="bracket-mundial__scroll">
        <div class="bracket-mundial__zoom-wrap">
          <div class="bracket-mundial__board">
          ${this.renderMitad(MITAD_IZQ, ctx, 'izq')}
          ${this.renderCentro(ctx)}
          ${this.renderMitad(MITAD_DER, ctx, 'der')}
          </div>
        </div>
      </div>
    </div>`;

    this._initScroll(contenedor);
  }
};

window.Llaves = Llaves;
