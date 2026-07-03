/* ============================================================
   POLLA SIIGO 2026 — UTILIDADES COMPARTIDAS
   Seguridad: TODO texto que venga de un usuario pasa por
   U.esc() antes de tocar el DOM. Nunca usar innerHTML con
   datos de usuario sin escapar.
   ============================================================ */

const U = {

  /* Zona horaria de referencia para cierres y visualización (Colombia). */
  TZ_COLOMBIA: 'America/Bogota',
  /* Partidos sin hora confirmada: cierre a las 11:00 a.m. Colombia (16:00 UTC). */
  CIERRE_SIN_HORA_UTC_H: 16,
  MARGEN_CIERRE_MS: 0, /* pronósticos cierran al pitazo o cuando la API marca en vivo */
  LIMBO_MS: 15 * 60 * 1000,

  /* --- Seguridad ------------------------------------------- */
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  },

  correoValido(c) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(c || '').trim());
  },

  esCorreoEmpresa(c) {
    const dominio = String(CONFIG.DOMINIO_EMPRESA || 'siigo.com').toLowerCase();
    return String(c || '').toLowerCase().trim().endsWith('@' + dominio);
  },

  esAdmin(correo) {
    return (CONFIG.ADMINS || [])
      .filter(Boolean)
      .map(a => String(a).toLowerCase())
      .includes(String(correo || '').toLowerCase());
  },

  async sha256(texto) {
    const data = new TextEncoder().encode(texto);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /* --- Fechas (UTC en datos; visualización y cierres en hora Colombia) --- */
  ahora() { return new Date(); },

  /* Milisegundos absolutos desde un ISO UTC (o null si inválido). */
  parseUtcMs(utcISO) {
    if (!utcISO) return null;
    const t = Date.parse(String(utcISO));
    return Number.isFinite(t) ? t : null;
  },

  /* Fecha calendario YYYY-MM-DD en Colombia (para consultas a la API). */
  fechaColombia(d = new Date()) {
    return d.toLocaleDateString('en-CA', { timeZone: this.TZ_COLOMBIA });
  },

  /* Pitazo del partido en ms (UTC ISO). */
  inicioPartidoMs(p) {
    return this.parseUtcMs(p?.utc);
  },

  /* Momento en que cierran pronósticos (ms absolutos, UTC).
     Solo para partidos SIN hora confirmada (cierre 11:00 a.m. Colombia).
     Con hora confirmada el cierre es cuando la API marca en vivo. */
  cierrePronosticoMs(p) {
    if (!p?.local || !p?.visitante) return null;

    if (p.horaOk === false) {
      const fecha = p.fecha || (p.utc ? String(p.utc).slice(0, 10) : null);
      if (!fecha) return null;
      return Date.parse(`${fecha}T${String(this.CIERRE_SIN_HORA_UTC_H).padStart(2, '0')}:00:00.000Z`);
    }

    /* Con hora confirmada: la UI cuenta regresiva al pitazo; el cierre real es en vivo. */
    return this.inicioPartidoMs(p);
  },

  fechaLarga(iso) {
    const d = new Date(iso + 'T12:00:00Z');
    return d.toLocaleDateString('es-CO', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: this.TZ_COLOMBIA
    });
  },

  horaLocal(utcISO) {
    if (!utcISO) return '';
    return new Date(utcISO).toLocaleTimeString('es-CO', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: this.TZ_COLOMBIA
    }).replace('a. m.', 'a.m.').replace('p. m.', 'p.m.');
  },

  diaLocal(utcISO) {
    if (!utcISO) return '';
    return new Date(utcISO).toLocaleDateString('es-CO', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: this.TZ_COLOMBIA
    });
  },

  cuentaRegresiva(utcISOOrMs) {
    const destino = typeof utcISOOrMs === 'number'
      ? utcISOOrMs
      : this.parseUtcMs(utcISOOrMs);
    if (!destino) return { ms: 0, d: 0, h: 0, m: 0, s: 0 };
    const t = Math.max(0, destino - Date.now());
    return {
      ms: destino - Date.now(),
      d: Math.floor(t / 864e5),
      h: Math.floor(t / 36e5) % 24,
      m: Math.floor(t / 6e4) % 60,
      s: Math.floor(t / 1e3) % 60
    };
  },

  fechaActualizacion(ms) {
    if (!ms) return '';
    return new Date(ms).toLocaleString('es-CO', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      timeZone: this.TZ_COLOMBIA
    }).replace(',', '');
  },

  /* Ventana post-pitazo en la que "iniciando" tiene sentido (3 h). */
  iniciandoVigente(p, res) {
    if (res?.estado !== 'iniciando') return false;
    const kickoff = this.inicioPartidoMs(p);
    if (!kickoff) return false;
    const ahora = Date.now();
    return ahora >= kickoff && ahora < kickoff + 3 * 60 * 60 * 1000;
  },

  /* Eliminatoria con equipos en fecha muy distinta al slot del fixture (sync errónea).
     Tolera ±6 días en dieciseisavos/octavos; cuartos+ en mes distinto = error. */
  asignacionKoSospechosa(p) {
    if (p?.fase !== 'eliminatorias' || !p.local || p.local === 'Por definir') return false;
    const kickoff = this.inicioPartidoMs(p);
    if (!kickoff || !p.fecha) return false;
    const fixtureMs = Date.parse(`${p.fecha}T12:00:00.000Z`);
    const diff = Math.abs(kickoff - fixtureMs);
    if (diff <= 6 * 24 * 60 * 60 * 1000) return false;
    const rondasEstrictas = ['4tos', 'semis', 'tercer', 'final'];
    if (rondasEstrictas.includes(p.ronda)) {
      const mesKick = new Date(kickoff).getUTCMonth();
      const mesFix = new Date(fixtureMs).getUTCMonth();
      return mesKick !== mesFix || diff > 8 * 24 * 60 * 60 * 1000;
    }
    return diff > 12 * 24 * 60 * 60 * 1000;
  },

  /* ¿El partido cae en un día concreto (Colombia)? Tolera ±36 h fecha fixture vs pitazo en KO. */
  esPartidoEnDia(p, diaLocal, resultados = {}) {
    if (!diaLocal) return false;
    if (this.diaPartido(p) === diaLocal) return true;
    const kick = this.inicioPartidoMs(p);
    if (kick && this.fechaColombia(new Date(kick)) === diaLocal) return true;
    if (p?.fase === 'eliminatorias' && p.local && p.visitante && p.local !== 'Por definir' && p.fecha) {
      const msDia = Date.parse(`${diaLocal}T05:00:00.000Z`);
      const msF = Date.parse(`${p.fecha}T05:00:00.000Z`);
      if (Math.abs(msF - msDia) <= 36 * 60 * 60 * 1000) {
        const est = this.estadoPartido(p, resultados[p.id]);
        if (est === 'finalizado' && this.diaPartido(p) < diaLocal) return false;
        return true;
      }
    }
    return false;
  },

  /* ¿Cae hoy o mañana (Colombia)? Tolera fecha fixture ±1 día vs pitazo real en KO. */
  esPartidoCercano(p, hoyLocal, mananaLocal, resultados = {}) {
    return this.esPartidoEnDia(p, hoyLocal, resultados)
      || this.esPartidoEnDia(p, mananaLocal, resultados);
  },

  /* ¿La API/admin puede marcar el partido como en vivo o finalizado? */
  _estadoLiveConfiable(p, res, estado) {
    if (!estado) return false;
    if (estado === 'aplazado') return true;
    if (estado !== 'en_juego' && estado !== 'finalizado' && estado !== 'iniciando') return false;

    if (res?.estado === 'en_juego' || res?.estado === 'finalizado') return true;

    const kickoff = this.inicioPartidoMs(p);
    if (!kickoff) return estado === 'en_juego' || estado === 'finalizado';

    /* Con hora confirmada: en vivo solo después del pitazo (margen 2 min por reloj API). */
    if (p.horaOk !== false) {
      return Date.now() >= kickoff - 2 * 60 * 1000;
    }

    const cierre = this.cierrePronosticoMs(p);
    return cierre != null && Date.now() >= cierre;
  },

  /* Milisegundos en que cierran pronósticos (ajustes Firestore o cálculo local). */
  cierreMsEfectivo(p) {
    if (p?.cierreMs && Number.isFinite(p.cierreMs)) return p.cierreMs;
    return this.cierrePronosticoMs(p);
  },

  /* ¿Se guardó/changed después del cierre? */
  fueraDeTiempo(p, tMs = Date.now()) {
    if (!p?.local || !p?.visitante) return false;
    const cierre = this.cierreMsEfectivo(p);
    return cierre != null && tMs >= cierre;
  },

  /* Calcula cierreMs para guardar en Firestore (bloqueo server-side). */
  calcCierreMs(p) {
    if (!p?.local || !p?.visitante) return null;
    if (p.horaOk !== false && p.utc) return this.parseUtcMs(p.utc);
    const cierre = this.cierrePronosticoMs(p);
    return cierre != null ? cierre : null;
  },

  mensajeTramposo() {
    return 'Partido cerrado. Tu intento quedó registrado para revisión del admin.';
  },

  /* ¿Cuenta este pronóstico para puntos? (aprobado por admin si fue fuera de hora). */
  pronosticoCuenta(pr, pe) {
    if (!pr) return false;
    if (pr.perdonadoPorAdmin) return true;
    if (pr.aprobado === false) return false;
    /* Guardado a tiempo: cuenta aunque un recálculo de calendario KO dejó flags pendientes. */
    if (pe && pr.t) {
      const kick = this.inicioPartidoMs(pe);
      if (kick && pr.t < kick) return true;
      const cierre = this.cierreMsEfectivo(pe);
      if (cierre != null && pr.t < cierre) return true;
      /* Pendiente por bug de sync, pero con la hora actual NO es tarde → cuenta. */
      if ((pr.pendienteAprobacion || pr.aprobado === null) && !this.fueraDeTiempo(pe, pr.t)) {
        return true;
      }
    }
    if (pr.pendienteAprobacion === true || pr.aprobado === null) return false;
    if (pr.aprobado === true) return true;
    if (pe && pr.t && U.fueraDeTiempo(pe, pr.t)) return false;
    return true;
  },

  /* Admin: recalcula tarde con la hora ACTUAL del partido (no flags viejos). */
  esTardeRecalculado(pe, tMs, pr = null) {
    if (!pe?.local) return false;
    if (pr?.perdonadoPorAdmin) return false;
    if (pr?.aprobado === false) return false;
    if (pr?.pendienteAprobacion || pr?.aprobado === null) return true;
    if (!tMs) return false;
    return this.fueraDeTiempo(pe, tMs);
  },

  /* Marcado tarde al guardar pero con la hora corregida ya no lo sería (error API). */
  falsoPositivoHoraApi(pe, tMs, flags = {}) {
    if (!tMs || flags.perdonado) return false;
    const stale = !!(flags.fueraDeTiempoGuardado);
    return stale && !this.fueraDeTiempo(pe, tMs);
  },

  /* Estado efectivo de un partido según la hora y los datos. */
  estadoPartido(p, res) {
    if (!p?.local || !p?.visitante) return 'sin_definir';
    if (!p.utc && !p.fecha) return 'sin_definir';

    const kickoff = this.inicioPartidoMs(p);
    const ahora = Date.now();

    /* Pitazo futuro → pronósticos abiertos (ignora estados obsoletos en BD). */
    if (kickoff && ahora < kickoff) return 'programado';

    const resEstado = res?.estado;
    if (resEstado === 'aplazado') return 'aplazado';
    if (resEstado === 'finalizado' && this._estadoLiveConfiable(p, res, resEstado)) return 'finalizado';
    if (resEstado === 'en_juego' && this._estadoLiveConfiable(p, res, resEstado)) return 'en_juego';

    if (resEstado === 'iniciando' && kickoff && ahora >= kickoff) {
      if (this.iniciandoVigente(p, res)) return 'iniciando';
      if (typeof res?.gl === 'number' && typeof res?.gv === 'number') return 'finalizado';
      return 'cerrado';
    }

    const cierre = this.cierreMsEfectivo(p);

    if (p.horaOk === false && !p.utc) {
      if (!cierre) return 'sin_definir';
      return ahora >= cierre ? 'cerrado' : 'programado';
    }

    /* Hora confirmada: cierra al pitazo aunque la API no haya sincronizado aún. */
    if (cierre && ahora >= cierre) {
      return 'cerrado';
    }

    return 'programado';
  },

  /* Texto legible de por qué un pronóstico quedó tarde. */
  detalleTarde(p, tGuardado = Date.now()) {
    if (!p?.local || !p?.visitante) return null;
    const cierre = this.cierreMsEfectivo(p);
    if (!cierre || tGuardado < cierre) return null;
    const msTarde = tGuardado - cierre;
    const segTarde = Math.max(1, Math.ceil(msTarde / 1000));
    const minTarde = Math.max(1, Math.round(msTarde / 60000));
    const horaPartido = p.utc
      ? `${this.diaLocal(p.utc)} ${this.horaLocal(p.utc)} (Colombia)`
      : p.fecha
        ? `${p.fecha} · cierre 11:00 a.m. Colombia (sin hora confirmada)`
        : 'sin hora definida';
    const horaCierre = new Date(cierre).toLocaleString('es-CO', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: this.TZ_COLOMBIA
    });
    const horaGuardado = new Date(tGuardado).toLocaleString('es-CO', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: this.TZ_COLOMBIA
    });
    const deltaTxt = segTarde < 60
      ? `${segTarde} seg después del cierre`
      : `${minTarde} min (${segTarde} seg) después del cierre`;
    return {
      segTarde, minTarde, msTarde,
      horaPartido, horaCierre, horaGuardado,
      texto: `Guardado ${horaGuardado}, ${deltaTxt}. Cierre: ${horaCierre}. Partido: ${horaPartido}.`
    };
  },

  /* ¿Puede guardarse un pronóstico ahora? */
  puedePronosticar(p, res) {
    if (!p?.local || !p?.visitante) return false;
    const est = this.estadoPartido(p, res);
    if (['finalizado', 'en_juego', 'aplazado', 'iniciando'].includes(est)) return false;
    const kickoff = this.inicioPartidoMs(p);
    if (kickoff) return Date.now() < kickoff;
    const cierre = this.cierreMsEfectivo(p);
    return cierre != null && Date.now() < cierre;
  },

  abierto(p, res) {
    return this.puedePronosticar(p, res);
  },

  /* --- Dinero ----------------------------------------------- */
  moneda(valor, codigo) {
    const m = CONFIG.CUOTAS[codigo] || { simbolo: '', nombre: codigo };
    return `${m.simbolo} ${Number(valor).toLocaleString('es-CO')} ${codigo}`;
  },

  /* --- UI: toasts y confirmaciones --------------------------- */
  toast(msg, tipo = 'ok') {
    let cont = document.querySelector('.toasts');
    if (!cont) { cont = document.createElement('div'); cont.className = 'toasts'; document.body.appendChild(cont); }
    const t = document.createElement('div');
    t.className = `toast toast--${tipo}`;
    t.textContent = msg;
    cont.appendChild(t);
    setTimeout(() => { t.classList.add('toast--fuera'); setTimeout(() => t.remove(), 350); }, 3400);
  },

  /* --- Sesión / navegación ----------------------------------- */
  requiereSesion(usuario) {
    if (!usuario) { location.href = 'index.html'; return false; }
    return true;
  },

  iniciales(nombre) {
    return String(nombre || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  },

  /* Mensaje amigable para errores de red (evita "Failed to fetch" crudo). */
  msgError(err, fallback = 'Ocurrió un error. Intenta de nuevo.') {
    const msg = String(err?.message || err || '');
    if (!msg || msg === 'Failed to fetch' || /networkerror|load failed|fetch/i.test(msg)) {
      return fallback;
    }
    return msg;
  },

  /* Hora actual Colombia en formato 24h (ej. 20:05). */
  horaRelojAhora(d = new Date()) {
    return d.toLocaleTimeString('es-CO', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: this.TZ_COLOMBIA
    });
  },

  /* Descuento válido según minuto real (evita 90+06 con partido en 77′). */
  minutoExtraSano(res, minBase = null) {
    const extra = this.minutoNum(res?.minutoExtra) || 0;
    if (extra <= 0) return 0;
    const min = minBase != null ? minBase : (this.minutoNum(res?.minuto) ?? 0);
    const per = this.periodoNorm(res?.periodo, min);
    if (per === '1H' && min >= 45) return extra;
    if (min >= 90) return extra;
    if (per === 'ET' && min >= 105) return extra;
    return 0;
  },

  /* Minuto del partido para recuadro (solo número, ej. 67 o 45+2). Sin segundos ni prefijos. */
  formatMinutoCaja(res, minInterp = null) {
    if (!res) return '—';
    if (this.esDescanso(res)) return res.periodo === 'BT' ? 'PA' : 'DT';
    const per = this.periodoNorm(res.periodo, res.minuto);
    if (['HT', 'BT'].includes(per)) return per === 'HT' ? 'DT' : 'PA';
    if (per === 'P') return 'PEN';

    const base = minInterp != null ? minInterp : (this.minutoNum(res.minuto) ?? 0);
    const extra = this.minutoExtraSano(res, base);

    if (extra > 0) {
      if (base < 90) return `45+${extra}`;
      if (base < 105) return `90+${extra}`;
      return `105+${extra}`;
    }
    return String(base);
  },

  /* Minuto en vivo estilo broadcast (ej. 27:03, 45+02) — para etiquetas secundarias. */
  formatMinutoLive(res, minInterp = null, secInterp = null) {
    if (!res) return 'En Vivo';
    if (this.esDescanso(res)) {
      return res.periodo === 'BT' ? 'Pausa ET' : 'Descanso';
    }
    const PERIODOS = { '1H': '1ª', '2H': '2ª', 'HT': 'Descanso', 'BT': 'Pausa ET', 'ET': 'Prórroga', 'P': 'Penales' };
    const per = this.periodoNorm(res.periodo, res.minuto);
    if (per === 'P') return 'Penales';
    if (['HT', 'BT'].includes(per)) return PERIODOS[per] || 'Descanso';

    const base = minInterp != null ? minInterp : (this.minutoNum(res.minuto) ?? 0);
    const extra = this.minutoExtraSano(res, base);
    const ss = String(secInterp != null ? secInterp : 0).padStart(2, '0');

    if (extra > 0) {
      if (base < 90) return `45+${String(extra).padStart(2, '0')}`;
      if (base < 105) return `90+${String(extra).padStart(2, '0')}`;
      return `105+${String(extra).padStart(2, '0')}`;
    }
    return `${base}:${ss}`;
  },

  /* Minuto corto para la barra superior (alias de formatMinutoCaja). */
  formatMinutoTicker(res, minInterp = null) {
    return this.formatMinutoCaja(res, minInterp) === '—' ? 'VIVO' : this.formatMinutoCaja(res, minInterp);
  },

  /* Minuto API/Firestore como entero o null. */
  minutoNum(v) {
    if (v == null || v === '') return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  },

  /* LIVE de la API → mitad efectiva (evita resetear minutoAt en cada sync). */
  periodoNorm(periodo, minuto) {
    const p = String(periodo || '').trim();
    if (p !== 'LIVE' && p) return p;
    const m = this.minutoNum(minuto) ?? 0;
    if (m > 105) return 'ET';
    if (m > 45) return '2H';
    if (m > 0) return '1H';
    return p;
  },

  /* Ancla del reloj: solo minutoAt (t cambia en cada sync y congela el reloj). */
  minutoAtServidor(res) {
    if (!res) return null;
    const at = parseInt(res.minutoAt, 10);
    return Number.isFinite(at) && at > 0 ? at : null;
  },

  minutoAtEfectivo(res) {
    return this.minutoAtServidor(res);
  },

  /* ¿Hay que reiniciar el reloj interpolado del cliente? */
  cambioRelojLive(nuevo, anterior) {
    const min = this.minutoNum(nuevo?.minuto);
    const minPrev = this.minutoNum(anterior?.minuto);
    const extra = this.minutoNum(nuevo?.minutoExtra) ?? 0;
    const extraPrev = this.minutoNum(anterior?.minutoExtra) ?? 0;
    const per = this.periodoNorm(nuevo?.periodo, min);
    const perPrev = this.periodoNorm(anterior?.periodo, minPrev);

    if (min != null && minPrev != null && min !== minPrev) return true;
    if (min != null && minPrev == null) return true;
    if (extra !== extraPrev) return true;

    if (per !== perPrev) {
      const claves = ['HT', 'BT', '2H', 'ET', 'P', '1H'];
      if (claves.includes(per) || claves.includes(perPrev)) return true;
    }

    const est = nuevo?.estado;
    const estPrev = anterior?.estado;
    if (est === 'finalizado' && estPrev !== 'finalizado') return true;
    if (est === 'en_juego' && estPrev && estPrev !== 'en_juego' && estPrev !== 'iniciando') return true;
    return false;
  },

  /* Minuto/segundo interpolados para el reloj en pantalla. */
  calcMinutoInterp(res, now = Date.now()) {
    const min = this.minutoNum(res?.minuto) ?? 0;
    const extra = this.minutoExtraSano(res, min);
    const per = this.periodoNorm(res?.periodo, min);
    const pseudo = { minuto: min, minutoExtra: extra, periodo: per, minutoAt: res?.minutoAt, t: res?.t };

    if (this.esDescanso(pseudo) || ['HT', 'BT', 'P'].includes(per)) {
      return { min, sec: 0 };
    }
    if (extra > 0) return { min, sec: 0 };

    const at = this.minutoAtEfectivo(res) || parseInt(res?.minutoAt, 10) || null;
    if (!at) return { min, sec: 0 };

    const elapsedSec = Math.max(0, Math.floor((now - at) / 1000));
    const tope = this.topeMinutoInterp(per);
    return {
      min: Math.min(min + Math.floor(elapsedSec / 60), tope),
      sec: elapsedSec % 60
    };
  },

  enTiempoExtra(res) {
    return this.minutoExtraSano(res) > 0;
  },

  /* Descanso / pausa: solo HT o BT confirmados por la API. */
  esDescanso(res) {
    if (!res) return false;
    const per = String(res.periodo || '').trim();
    return per === 'HT' || per === 'BT';
  },

  /* Tope de interpolación del reloj local (evita 45′ → 61′ durante el descanso). */
  topeMinutoInterp(periodo) {
    if (periodo === 'ET') return 120;
    if (periodo === '2H') return 90;
    return 45; /* 1H, LIVE, vacío */
  },

  params() { return new URLSearchParams(location.search); },

  /* Día Colombia del partido (para filtros y títulos). */
  diaPartido(p) {
    if (p?.utc) {
      const ms = this.parseUtcMs(p.utc);
      if (ms) return this.fechaColombia(new Date(ms));
    }
    return p?.fecha || '';
  },

  /* Misma llave para slots distintos (ej. ko-76 y ko-78) con los mismos equipos.
     Eliminatorias: solo la pareja (un cruce = un slot canónico).
     Grupos: día Colombia + equipos. */
  _slotMsKo(m, p) {
    return U.parseUtcMs(m.utc) || Date.parse(`${p.fecha}T16:00:00.000Z`);
  },

  _diaKoCoincide(p, m, apiMs, apiDia) {
    if (!apiMs || !apiDia) return false;
    if (U.diaPartido(m) === apiDia || p.fecha === apiDia) return true;
    return Math.abs(U._slotMsKo(m, p) - apiMs) < 36 * 60 * 60 * 1000;
  },

  _ajusteRaw(p, ajustes) {
    return { ...p, ...((ajustes || {})[p.id] || {}) };
  },

  /* Datos para mover un cruce de un slot KO incorrecto (ej. P89 octavos) al oficial dieciseisavos (P74). */
  patchMigracionKoOficial(origenId, raw, destId, destRaw) {
    const patch = {};
    if (!destRaw?.local || destRaw.local === 'Por definir') {
      patch.local = raw.local;
      patch.visitante = raw.visitante;
    }
    if (raw.utc && (!destRaw?.utc || origenId !== destId)) {
      patch.utc = raw.utc;
      patch.horaOk = raw.horaOk !== false;
    } else if (raw.horaOk && !destRaw?.horaOk) {
      patch.horaOk = true;
    }
    if (raw.estadio && !destRaw?.estadio) patch.estadio = raw.estadio;
    if (raw.sede && !destRaw?.sede) patch.sede = raw.sede;
    return patch;
  },

  idSlotKoOficial(local, visitante) {
    return FIXTURE.idSlotKoPorPareja(local, visitante);
  },

  _slotKoIdealPorHorario(ap, ajustes) {
    const oficial = U.idSlotKoOficial(ap?.local, ap?.visitante);
    if (oficial) return FIXTURE.porId(oficial);
    const apiMs = U.parseUtcMs(ap?.utc);
    if (!apiMs || !ap?.local || !ap?.visitante) return null;
    /* Cruce de fase de grupos sin mapa KO oficial: jamás ocupa un slot eliminatorio. */
    if (U.esParejaFaseGrupos(ap.local, ap.visitante)) return null;
    const apiDia = U.fechaColombia(new Date(apiMs));
    const candidatos = FIXTURE.partidos
      .filter(p => p.fase === 'eliminatorias' && p.ronda === '16avos')
      .map(p => ({ p, raw: U._ajusteRaw(p, ajustes) }))
      .filter(({ raw }) => !raw.local || !raw.visitante || raw.local === 'Por definir')
      .filter(({ p, raw }) => U._diaKoCoincide(p, raw, apiMs, apiDia))
      .sort((a, b) => {
        const da = Math.abs(U._slotMsKo(a.raw, a.p) - apiMs);
        const db = Math.abs(U._slotMsKo(b.raw, b.p) - apiMs);
        return da - db || a.p.n - b.p.n;
      });
    return candidatos[0]?.p || null;
  },

  /* Si el slot oficial (P87) está vacío pero el cruce vive en otro slot, heredar para UI. */
  koAjusteVisible(pid, ajustes) {
    const base = FIXTURE.porId(pid);
    if (!base || base.fase !== 'eliminatorias') {
      return { ...(base || {}), ...((ajustes || {})[pid] || {}) };
    }
    const rawSelf = { ...base, ...((ajustes || {})[pid] || {}) };
    const finish = (m) => {
      const newHoraOk = m.utc ? true : (typeof m.horaOk === 'boolean' ? m.horaOk : base.horaOk);
      const merged = { ...m, horaOk: newHoraOk };
      const cierre = U.calcCierreMs(merged);
      if (cierre != null) merged.cierreMs = cierre;
      return merged;
    };
    if (rawSelf.local && rawSelf.visitante && rawSelf.local !== 'Por definir') {
      return finish(rawSelf);
    }

    for (const p of FIXTURE.partidos) {
      if (p.fase !== 'eliminatorias' || p.id === pid) continue;
      const raw = { ...p, ...((ajustes || {})[p.id] || {}) };
      if (!raw.local || !raw.visitante || raw.local === 'Por definir') continue;
      const oficial = U.idSlotKoOficial(raw.local, raw.visitante);
      if (oficial !== pid) continue;
      return finish({
        ...rawSelf,
        local: raw.local,
        visitante: raw.visitante,
        utc: rawSelf.utc || raw.utc,
        horaOk: rawSelf.horaOk !== false ? rawSelf.horaOk : raw.horaOk,
        estadio: rawSelf.estadio || raw.estadio,
        sede: rawSelf.sede || raw.sede,
        etapa: FIXTURE.porId(oficial)?.etapa || rawSelf.etapa,
        ronda: FIXTURE.porId(oficial)?.ronda || rawSelf.ronda,
        slotCanon: oficial
      });
    }
    return finish(rawSelf);
  },

  claveParejaKo(local, visitante) {
    if (!local || !visitante || local === 'Por definir' || visitante === 'Por definir') return '';
    return `ko:${[local, visitante].sort().join('-')}`;
  },

  /* Slot ko oficial (P73–P88) → clave de pareja, aunque el slot esté vacío en Firestore. */
  claveOficialPorSlotKo(pid) {
    if (!pid || !FIXTURE.koR32Oficial) return null;
    for (const [pair, id] of Object.entries(FIXTURE.koR32Oficial)) {
      if (id !== pid) continue;
      const [a, b] = pair.split('|');
      return this.claveParejaKo(a, b);
    }
    return null;
  },

  equiposOficialSlotKo(pid) {
    if (!pid || !FIXTURE.koR32Oficial) return null;
    for (const [pair, id] of Object.entries(FIXTURE.koR32Oficial)) {
      if (id !== pid) continue;
      const [a, b] = pair.split('|');
      return [a, b];
    }
    return null;
  },

  /* Historial en slot incorrecto (ej. CIV–NOR en ko-76): gl/gv hay que invertirlos al slot oficial ko-78. */
  invertirPredDesdeSlotHistorial(slotOrigen, pidCanon, equipos) {
    if (!slotOrigen || !pidCanon || slotOrigen === pidCanon || !equipos?.length) return false;
    const [a, b] = equipos;
    const slotOficial = this.idSlotKoOficial(a, b);
    if (!slotOficial || slotOficial !== pidCanon) return false;
    const eqOf = this.equiposOficialSlotKo(slotOrigen);
    if (!eqOf) return false;
    const clOf = this.claveParejaKo(eqOf[0], eqOf[1]);
    const clCanon = this.claveParejaKo(a, b);
    if (clOf === clCanon) {
      return eqOf[0] === b && eqOf[1] === a;
    }
    return true;
  },

  invertirGolesPred(gl, gv, invertir) {
    if (!invertir || gl == null || gv == null) return { gl, gv };
    return { gl: gv, gv: gl };
  },

  /* ¿Este cruce ya existe en fase de grupos del fixture? */
  esParejaFaseGrupos(local, visitante) {
    if (!local || !visitante || local === 'Por definir' || visitante === 'Por definir') return false;
    return FIXTURE.partidos.some(p => p.fase === 'grupos'
      && ((p.local === local && p.visitante === visitante)
        || (p.local === visitante && p.visitante === local)));
  },

  partidoGruposPorPareja(local, visitante) {
    if (!local || !visitante) return null;
    return FIXTURE.partidos.find(p => p.fase === 'grupos'
      && ((p.local === local && p.visitante === visitante)
        || (p.local === visitante && p.visitante === local))) || null;
  },

  clavePartidoDesdePid(pid, ajustes) {
    const base = FIXTURE.porId(pid);
    if (!base) return `id:${pid}`;
    const px = { ...base, ...((ajustes || {})[pid] || {}) };
    if (px.local && px.visitante && px.local !== 'Por definir') {
      return this.clavePartidoDuplicado(px);
    }
    return this.claveOficialPorSlotKo(pid) || `id:${pid}`;
  },

  clavePartidoDuplicado(p) {
    if (!p?.local || !p?.visitante || p.local === 'Por definir' || p.visitante === 'Por definir') {
      return `id:${p.id}`;
    }
    if (p.fase === 'eliminatorias') {
      return this.claveParejaKo(p.local, p.visitante);
    }
    const equipos = [p.local, p.visitante].sort().join('-');
    const ms = p.utc ? this.parseUtcMs(p.utc) : null;
    const dia = ms ? this.fechaColombia(new Date(ms)) : (p.fecha || p.id);
    return `${equipos}__${dia}`;
  },

  puntajePartidoCanonico(p, ctx = {}) {
    const { misPred = {}, predsByPartido = {}, resultados = {} } = ctx;
    let s = 0;
    if (misPred[p.id]) s += 200;
    if ((predsByPartido[p.id] || []).length) s += 150;
    if ((resultados[p.id] || {}).estado === 'finalizado') s += 80;
    if (p.horaOk) s += 50;
    if (p.estadio) s += 20;
    if (p.sede && p.sede !== 'Sede por confirmar') s += 15;
    s -= (p.n || 999) * 0.01;
    return s;
  },

  dedupePartidos(lista, ctx = {}) {
    const map = new Map();
    for (const p of lista) {
      const key = this.clavePartidoDuplicado(p);
      const prev = map.get(key);
      if (!prev) {
        map.set(key, p);
        continue;
      }
      const mejor = this._mejorSlotDuplicado(p, prev, ctx);
      map.set(key, mejor);
    }
    return [...map.values()];
  },

  _mejorSlotDuplicado(a, b, ctx = {}) {
    const parOficial = (p) => {
      if (!p?.local || !p?.visitante) return null;
      return U.idSlotKoOficial(p.local, p.visitante);
    };
    const ofA = parOficial(a);
    const ofB = parOficial(b);
    if (ofA === a.id && ofB !== b.id) return a;
    if (ofB === b.id && ofA !== a.id) return b;
    const esFantasma = p => p.fase === 'eliminatorias' && p.ronda !== '16avos'
      && this.esParejaFaseGrupos(p.local, p.visitante)
      && !this.idSlotKoOficial(p.local, p.visitante);
    if (esFantasma(a) && !esFantasma(b)) return b;
    if (esFantasma(b) && !esFantasma(a)) return a;
    if (this.esParejaFaseGrupos(a.local, a.visitante)) {
      if (a.fase === 'grupos' && b.fase !== 'grupos') return a;
      if (b.fase === 'grupos' && a.fase !== 'grupos') return b;
    }
    const oficialA = this.idSlotKoOficial(a.local, a.visitante);
    const oficialB = this.idSlotKoOficial(b.local, b.visitante);
    if (oficialA === a.id && oficialB !== b.id) return a;
    if (oficialB === b.id && oficialA !== a.id) return b;
    if ((a.n || 999) !== (b.n || 999)) return (a.n || 999) < (b.n || 999) ? a : b;
    return this.puntajePartidoCanonico(a, ctx) >= this.puntajePartidoCanonico(b, ctx) ? a : b;
  },

  async pintarBannerMantenimiento() {
    const el = document.getElementById('banner-mantenimiento');
    if (!el || typeof Store === 'undefined') return;
    try {
      const aj = await Store.ajustes();
      const g = aj.GLOBAL || {};
      if (!g.mantenimiento) {
        el.classList.add('oculto');
        el.textContent = '';
        return;
      }
      el.classList.remove('oculto');
      el.textContent = g.mantenimientoMsg
        || '⚠️ Mantenimiento: estamos recalculando la tabla de posiciones y corrigiendo el calendario eliminatorio. Los puntos pueden variar unos minutos. Gracias por tu paciencia.';
    } catch (_) {
      el.classList.add('oculto');
    }
  },

  /* Agrupa cruces duplicados — conserva el slot de menor P (canon). */
  agruparPartidosDuplicados(lista) {
    const grupos = [];
    const map = new Map();
    for (const p of [...lista].sort((a, b) => (a.n || 999) - (b.n || 999))) {
      if (!p.local || !p.visitante || p.local === 'Por definir') {
        grupos.push({ canon: p, duplicados: [] });
        continue;
      }
      const key = this.clavePartidoDuplicado(p);
      if (map.has(key)) {
        map.get(key).duplicados.push(p);
      } else {
        const g = { canon: p, duplicados: [] };
        map.set(key, g);
        grupos.push(g);
      }
    }
    return grupos;
  },

  claveCruceApi(ap) {
    if (!ap?.local || !ap?.visitante) return '';
    return U.claveParejaKo(ap.local, ap.visitante);
  },

  mapaPartidosCanonicos(lista, ctx = {}) {
    const deduped = this.dedupePartidos(lista, ctx);
    const canonPorClave = new Map();
    deduped.forEach(p => canonPorClave.set(this.clavePartidoDuplicado(p), p.id));
    const alias = {};
    for (const p of lista) {
      alias[p.id] = canonPorClave.get(this.clavePartidoDuplicado(p)) || p.id;
    }
    return { alias, deduped, canonIds: new Set(deduped.map(x => x.id)) };
  },

  normalizarPrediccionesUsuario(preds, alias = {}) {
    const out = {};
    Object.entries(preds || {}).forEach(([pid, pr]) => {
      const canon = alias[pid] || pid;
      const prev = out[canon];
      if (!prev || (pr.t || 0) >= (prev.t || 0)) out[canon] = { ...pr, pid: canon };
    });
    return out;
  },

  /* Una tarjeta por cruce real — si pusieron en dos slots duplicados, queda uno (el más reciente). */
  dedupeVistaPredicciones(partidos, resolverPred) {
    const map = new Map();
    for (const p of partidos) {
      const pr = resolverPred(p);
      if (!pr) continue;
      const key = this.clavePartidoDuplicado(p);
      const prev = map.get(key);
      if (!prev || (pr.t || 0) >= (prev.pr.t || 0)) map.set(key, { p, pr });
    }
    return [...map.values()];
  }
};
window.U = U;
