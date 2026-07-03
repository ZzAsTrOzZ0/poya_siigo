/* ============================================================
   POLLA SIIGO 2026 — RESULTADOS EN VIVO
   ------------------------------------------------------------
   Flujo: el admin activa "Marcador automático". El panel
   consulta la API, escribe en la base de datos y todos
   los demás lo ven en tiempo real. Una polla de 300 personas
   consume la cuota de 1 sola.

   Con un plan de pago de la API, el sistema es más agresivo:
   - Refresca marcadores cada 10-15 segundos.
   - Actualiza estadísticas (tarjetas, corners) cada 5 minutos.
   - Genera análisis de IA para partidos futuros automáticamente.
   ============================================================ */

const ApiFutbol = {

  async _fetchWithTimeout(url, options = {}, timeout = 20000) { // 20 segundos de timeout
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(id);
    }
  },

  disponible() { return !!(CONFIG.API_FUTBOL.proxyUrl || '').trim(); },

  /* Alias inglés del proveedor → código interno. */
  _alias: {
    'mexico':'MEX','south africa':'RSA','south korea':'KOR','korea republic':'KOR','czech republic':'CZE','czechia':'CZE',
    'canada':'CAN','bosnia and herzegovina':'BIH','bosnia & herzegovina':'BIH','qatar':'QAT','switzerland':'SUI',
    'brazil':'BRA','morocco':'MAR','haiti':'HAI','scotland':'SCO',
    'usa':'USA','united states':'USA','paraguay':'PAR','australia':'AUS','turkey':'TUR','turkiye':'TUR','türkiye':'TUR',
    'germany':'GER','curacao':'CUW','curaçao':'CUW','ivory coast':'CIV',"cote d'ivoire":'CIV','ecuador':'ECU',
    'netherlands':'NED','japan':'JPN','sweden':'SWE','tunisia':'TUN',
    'belgium':'BEL','egypt':'EGY','iran':'IRN','new zealand':'NZL',
    'spain':'ESP','cape verde':'CPV','cabo verde':'CPV','saudi arabia':'KSA','uruguay':'URU',
    'france':'FRA','senegal':'SEN','iraq':'IRQ','norway':'NOR',
    'argentina':'ARG','algeria':'ALG','austria':'AUT','jordan':'JOR',
    'portugal':'POR','dr congo':'COD','congo dr':'COD','uzbekistan':'UZB','colombia':'COL',
    'england':'ENG','croatia':'CRO','ghana':'GHA','panama':'PAN'
  },

  _codigo(nombre) {
    const nom = String(nombre || '').toLowerCase().trim();
    const idEq = Object.keys(window.FIXTURE.equipos).find(k => {
      const e = window.FIXTURE.equipos[k];
      return e.n.toLowerCase() === nom || (e.n_en && e.n_en.toLowerCase() === nom);
    });
    return idEq || this._alias[nom] || null;
  },

  _estado(corto) {
    if (['1H','2H','HT','ET','BT','P','LIVE'].includes(corto)) return 'en_juego';
    if (['FT','AET','PEN'].includes(corto)) return 'finalizado';
    // PST=Postponed, SUSP=Suspended, INT=Interrupted, CANC=Cancelled, ABD=Abandoned
    if (['PST','SUSP','INT','CANC','ABD'].includes(corto)) return 'aplazado';
    return null;
  },

  /* Normaliza la fecha de la API a ISO UTC (siempre con offset explícito). */
  _parseApiUtc(dateStr) {
    if (!dateStr) return null;
    const raw = String(dateStr).trim();
    // Sin zona horaria → la API la entrega en UTC; forzar Z para evitar parseo local.
    const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) && !/[Z+-]/.test(raw.slice(-6))
      ? raw + 'Z'
      : raw;
    const t = Date.parse(normalized);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  },

  _motivoAplazamiento(corto) {
    if (corto === 'PST') return 'Partido pospuesto';
    if (corto === 'SUSP') return 'Partido suspendido';
    if (corto === 'INT') return 'Partido interrumpido';
    if (['CANC', 'ABD'].includes(corto)) return 'Partido cancelado/abandonado';
    return null;
  },

  /* ¿El partido API cae en la ventana de sync? Evita tocar partidos lejanos o viejos. */
  _enVentanaSync(ap, horas = 48) {
    const ms = U.parseUtcMs(ap.utc);
    if (!ms) return false;
    return Math.abs(ms - Date.now()) <= horas * 60 * 60 * 1000;
  },

  /* Ventana estrecha para marcar "iniciando" sin pitazo confirmado por la API. */
  _enVentanaIniciando(kickoffMs) {
    if (!kickoffMs) return false;
    const ahora = Date.now();
    return ahora >= kickoffMs && ahora < kickoffMs + 3 * 60 * 60 * 1000;
  },

  async traerPartidosDelDia(fecha) { // fecha in 'YYYY-MM-DD' format
    if (!this.disponible()) return [];
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    const url = new URL(urlBase);
    url.pathname = '/fixtures';
    url.searchParams.set('date', fecha);
    // Asegurar que traemos solo los del mundial
    url.searchParams.set('league', '1');
    url.searchParams.set('season', '2026');

    let r;
    try {
      r = await this._fetchWithTimeout(url.toString());
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn(`API: La petición para la fecha ${fecha} tardó demasiado y fue cancelada.`);
      } else {
        console.warn(`API: Conexión bloqueada para fecha ${fecha}. Revisa tu internet o la configuración de la API.`);
      }
      return [];
    }
    if (!r.ok) { console.warn(`API respondió ${r.status}`); return []; }
    const data = await r.json();
    if (data.errors && Object.keys(data.errors).length > 0) {
      console.warn('Error en la API: ' + JSON.stringify(data.errors));
      return [];
    }
    
    return (data.response || []).map(f => ({
      apiId:              f.fixture?.id,
      local:              this._codigo(f.teams?.home?.name),
      visitante:          this._codigo(f.teams?.away?.name),
      localApiTeamId:     f.teams?.home?.id || null,
      visitanteApiTeamId: f.teams?.away?.id || null,
      utc:       this._parseApiUtc(f.fixture?.date),
      estadio:   f.fixture?.venue?.name || '',
      sede:      f.fixture?.venue?.city || '',
      estado:    this._estado(f.fixture?.status?.short),
      periodo:     f.fixture?.status?.short || null,
      minuto:      f.fixture?.status?.elapsed ?? null,
      minutoExtra: f.fixture?.status?.extra ?? null,
      gl: f.goals?.home,
      gv: f.goals?.away,
      penalesGl: f.score?.penalty?.home ?? null,
      penalesGv: f.score?.penalty?.away ?? null
    })).filter(x => x.local && x.visitante);
  },

  /* Descarga y normaliza los partidos del Mundial desde la API. */
  async traerPartidos() {
    if (!this.disponible()) throw new Error('Proxy no configurado en js/config.js');
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    const url = new URL(urlBase);
    url.pathname = '/fixtures';
    url.searchParams.set('league', '1'); // ID para el Mundial
    url.searchParams.set('season', '2026');
    let r;
    try {
      r = await this._fetchWithTimeout(url.toString());
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('La petición a la API tardó demasiado y fue cancelada.');
      }
      throw new Error('Conexión bloqueada. Revisa tu internet o la configuración de la API.');
    }
    if (!r.ok) throw new Error('La API respondió ' + r.status);
    const data = await r.json();
    if (data.errors && Object.keys(data.errors).length > 0)
      throw new Error('Error en la API: ' + JSON.stringify(data.errors));
    return (data.response || []).map(f => ({
      apiId:              f.fixture?.id,
      local:              this._codigo(f.teams?.home?.name),
      visitante:          this._codigo(f.teams?.away?.name),
      localApiTeamId:     f.teams?.home?.id || null,
      visitanteApiTeamId: f.teams?.away?.id || null,
      utc:       this._parseApiUtc(f.fixture?.date),
      estadio:   f.fixture?.venue?.name || '',
      sede:      f.fixture?.venue?.city || '',
      estado:    this._estado(f.fixture?.status?.short),
      periodo:     f.fixture?.status?.short || null,
      minuto:      f.fixture?.status?.elapsed ?? null,
      minutoExtra: f.fixture?.status?.extra ?? null,
      gl: f.goals?.home,
      gv: f.goals?.away,
      penalesGl: f.score?.penalty?.home ?? null,
      penalesGv: f.score?.penalty?.away ?? null
    })).filter(x => x.local && x.visitante);
  },

  /* Tanda de penales: tiros en orden (⚽ anotado / ❌ fallado). */
  async traerTandaPenales(apiFixtureId) {
    if (!apiFixtureId || !this.disponible()) return [];
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    const url = new URL(urlBase);
    url.pathname = '/fixtures/events';
    url.searchParams.set('fixture', apiFixtureId);
    try {
      const r = await this._fetchWithTimeout(url.toString());
      if (!r.ok) return [];
      const data = await r.json();
      const ape = n => (n || '').split(' ').slice(-1)[0];
      return (data.response || [])
        .filter(ev => {
          const det = (ev.detail || '').toLowerCase();
          const el = ev.time?.elapsed ?? 0;
          if (det.includes('penalty shootout')) return true;
          if (det === 'missed penalty' && el >= 120) return true;
          return false;
        })
        .map(ev => {
          const det = (ev.detail || '').toLowerCase();
          return {
            eq: this._codigo(ev.team?.name) || '',
            j: ape(ev.player?.name),
            ok: !det.includes('missed')
          };
        })
        .filter(ev => ev.eq);
    } catch (_) { return []; }
  },

  /* Trae goles y tarjetas rojas de un partido por su ID de API.
     Solo disponible con acceso directo a api-sports.io. */
  async traerEventos(apiFixtureId) {
    if (!apiFixtureId || !this.disponible()) return [];
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    const url = new URL(urlBase);
    url.pathname = '/fixtures/events';
    url.searchParams.set('fixture', apiFixtureId);

    try {
      const r = await this._fetchWithTimeout(url.toString());
      if (!r.ok) return [];
      const data = await r.json();
      return (data.response || [])
        .filter(ev => ev.type === 'Goal' || // Goles
          ev.type === 'subst' ||
          ev.type === 'var' ||   // Revisiones del VAR (para goles anulados)
          (ev.type === 'Card' && ['Red Card', 'Second Yellow card', 'Yellow Card'].includes(ev.detail))) // Tarjetas
        .map(ev => {
          const ape = n => (n || '').split(' ').slice(-1)[0];

          let tipo = ev.type === 'Goal' ? 'gol'
                   : ev.type === 'subst' ? 'cambio'
                   : ev.detail === 'Yellow Card' ? 'amarilla' : 'roja';
          let subtipo = '';

          if (ev.type === 'Goal') {
            const det = (ev.detail || '').toLowerCase();
            if (det.includes('penalty')) subtipo = 'penal';
            else if (det.includes('own goal')) subtipo = 'autogol';
            else if (det.includes('free kick')) subtipo = 'tiro_libre';
            else if (det.includes('header')) subtipo = 'cabeza';
            else subtipo = 'normal';
          } else if (ev.type === 'var' && (ev.detail || '').toLowerCase().includes('goal cancelled')) {
            tipo = 'gol_anulado'; // Nuevo tipo de evento para goles anulados por VAR
          }

          return {
            m:  ev.time?.elapsed || 0,
            x:  ev.time?.extra || null,
            eq: this._codigo(ev.team?.name) || '',
            j:  ape(ev.player?.name),
            n:  (ev.player?.name || ''), // nombre completo disponible
            a:  ev.type === 'subst' ? ape(ev.assist?.name) : null,
            t:  tipo,
            subtipo: subtipo,
            detail: ev.detail || ''
          };
        });
    } catch (_) { return []; }
  },

  /* Trae conteo de tarjetas desde estadísticas (para rojas sin gol).
     Solo disponible con acceso directo a api-sports.io.
     teamIdMap: { apiTeamId: 'COD' } para resolver nombres que no coincidan. */
  async traerTarjetas(apiFixtureId, teamIdMap = {}) {
    if (!apiFixtureId || !this.disponible()) return {};
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    const url = new URL(urlBase);
    url.pathname = '/fixtures/statistics';
    url.searchParams.set('fixture', apiFixtureId);

    try {
      const r = await this._fetchWithTimeout(url.toString());
      if (!r.ok) return {};
      const data = await r.json();
      const res = {};
      (data.response || []).forEach(eq => {
        const cod = this._codigo(eq.team?.name) || teamIdMap[eq.team?.id] || null;
        if (!cod) return;
        const st = eq.statistics || [];
        const g = t => st.find(s => s.type === t)?.value ?? null;
        res[cod] = {
          amarillas:      g('Yellow Cards') || 0,
          rojas:          g('Red Cards') || 0,
          posesion:       g('Ball Possession'),
          tirosArc:       g('Shots on Goal') ?? 0,
          tirosTot:       g('Total Shots') ?? 0,
          corners:        g('Corner Kicks') ?? 0,
          faltas:         g('Fouls') ?? 0,
          fueras:         g('Offsides') ?? 0,
          precisionPases: g('Passes %'),
          paradas:        g('Goalkeeper Saves') ?? 0
        };
      });
      return res;
    } catch (_) { return {}; }
  },

  /* Predicción oficial (probabilidades de victoria, goles esperados). */
  async traerPrediccion(apiFixtureId) {
    if (!apiFixtureId || !this.disponible()) return null;
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    const url = new URL(urlBase);
    url.pathname = '/predictions';
    url.searchParams.set('fixture', apiFixtureId);

    try {
      const r = await this._fetchWithTimeout(url.toString());
      if (!r.ok) return null;
      const data = await r.json();
      const p = (data.response || [])[0]?.predictions;
      if (!p) return null;
      const fmtGol = v => {
        const n = parseFloat(v);
        return Number.isFinite(n) && n >= 0 ? String(Math.round(n)) : null;
      };
      const gl = fmtGol(p.goals?.home) ?? fmtGol(p.compare?.home) ?? '—';
      const gv = fmtGol(p.goals?.away) ?? fmtGol(p.compare?.away) ?? '—';
      return {
        consejo: p.advice || '',
        pct: { l: p.percent?.home || '?%', e: p.percent?.draw || '?%', v: p.percent?.away || '?%' },
        goles: { l: gl, v: gv },
        linea: p.under_over || null
      };
    } catch { return null; }
  },

  /* Alineaciones confirmadas (disponibles ~1h antes; reintentamos hasta 24h antes). */
  async traerAlineacion(apiFixtureId) {
    if (!apiFixtureId || !this.disponible()) return null;
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    const url = new URL(urlBase);
    url.pathname = '/fixtures/lineups';
    url.searchParams.set('fixture', apiFixtureId);

    try {
      const r = await this._fetchWithTimeout(url.toString());
      if (!r.ok) return null;
      const data = await r.json();
      if (!data.response?.length) return null;
      const ord = {G:0, D:1, M:2, F:3};
      return data.response.map(eq => ({
        cod:   this._codigo(eq.team?.name) || '',
        apiId: eq.team?.id || null,
        f: eq.formation || '',
        xi: (eq.startXI || [])
          .map(e => ({ n: (e.player?.name || '').split(' ').slice(-1)[0], num: e.player?.number || '', pos: e.player?.pos || '' }))
          .sort((a, b) => (ord[a.pos] ?? 9) - (ord[b.pos] ?? 9)),
        supl: (eq.substitutes || [])
          .map(e => ({ n: (e.player?.name || '').split(' ').slice(-1)[0], num: e.player?.number || '', pos: e.player?.pos || '' }))
      }));
    } catch { return null; }
  },

  /* Historial de enfrentamientos directos entre dos equipos (H2H). */
  async traerH2H(teamId1, teamId2) {
    if (!teamId1 || !teamId2 || !this.disponible()) return null;
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    const url = new URL(urlBase);
    url.pathname = '/fixtures/headtohead';
    url.searchParams.set('h2h', `${teamId1}-${teamId2}`);
    url.searchParams.set('last', '10');

    try {
      const r = await this._fetchWithTimeout(url.toString());
      if (!r.ok) return null;
      const data = await r.json();
      const matches = (data.response || []).slice(0, 5);
      if (!matches.length) return null;
      let w1 = 0, empate = 0, w2 = 0;
      const recientes = [];
      for (const m of matches) {
        const homeWinner = m.teams?.home?.winner;
        const t1IsHome = m.teams?.home?.id === teamId1;
        if (homeWinner === null || homeWinner === undefined) { empate++; }
        else if ((homeWinner && t1IsHome) || (!homeWinner && !t1IsHome)) { w1++; }
        else { w2++; }
        recientes.push({
          gl: t1IsHome ? (m.goals?.home ?? 0) : (m.goals?.away ?? 0),
          gv: t1IsHome ? (m.goals?.away ?? 0) : (m.goals?.home ?? 0)
        });
      }
      return { w1, empate, w2, recientes };
    } catch { return null; }
  },

  /* Jugadores lesionados/ausentes para un partido específico. */
  async traerLesiones(apiFixtureId) {
    if (!apiFixtureId || !this.disponible()) return null;
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    const url = new URL(urlBase);
    url.pathname = '/injuries';
    url.searchParams.set('fixture', apiFixtureId);

    try {
      const r = await this._fetchWithTimeout(url.toString());
      if (!r.ok) return null;
      const data = await r.json();
      const mapa = {};
      for (const item of data.response || []) {
        const cod = this._codigo(item.team?.name);
        if (!cod) continue;
        if (!mapa[cod]) mapa[cod] = [];
        const apellido = (item.player?.name || '').split(' ').slice(-1)[0];
        mapa[cod].push({ nombre: apellido, razon: item.injury?.reason || item.injury?.type || '' });
      }
      return Object.keys(mapa).length ? mapa : null;
    } catch { return null; }
  },

  /* Genera y guarda un análisis de IA para un partido específico. */
  async generarAnalisisIA(partidoId) {
    if (!this.disponible() || !window.IA?.disponible()) {
      throw new Error('La función de IA o la API de fútbol no están configuradas.');
    }

    const ajustes = await Store.ajustes();
    const p = FIXTURE.partidos.find(x => x.id === partidoId);
    if (!p) throw new Error('Partido no encontrado.');

    const ap = Puntos.conAjustes(p, ajustes);
    if (!ap.local || !ap.visitante) throw new Error('Los equipos para este partido aún no están definidos.');

    const resAnterior = (await Store.resultados())[partidoId] || {};

    const L = FIXTURE.equipo(ap.local);
    const V = FIXTURE.equipo(ap.visitante);

    // 1. Gather all data needed for the prompt
    const datos = {
        prediccion: resAnterior.prediccion || await this.traerPrediccion(ap.apiId),
        h2h: resAnterior.h2h || await this.traerH2H(ap.localApiTeamId, ap.visitanteApiTeamId),
        lesiones: resAnterior.lesiones || await this.traerLesiones(ap.apiId)
    };

    // 2. Build the prompt
    let prompt = `Eres un analista experto de fútbol. Analiza el partido del Mundial 2026 entre ${L.n_en} y ${V.n_en}.\n\nDATOS DISPONIBLES:\n`;
    if (datos.prediccion) {
        prompt += `- Probabilidades (modelo API): ${L.n_en} (${datos.prediccion.pct.l}), Empate (${datos.prediccion.pct.e}), ${V.n_en} (${datos.prediccion.pct.v}).\n`;
        prompt += `- Marcador más probable (modelo API): ${datos.prediccion.goles.l} a ${datos.prediccion.goles.v}.\n`;
        if (datos.prediccion.consejo) prompt += `- Consejo de apuesta: ${datos.prediccion.consejo}.\n`;
    }
    if (datos.h2h) {
        prompt += `- Historial (últimos ${datos.h2h.w1 + datos.h2h.empate + datos.h2h.w2}): ${L.n_en} ganó ${datos.h2h.w1}, empataron ${datos.h2h.empate}, y ${V.n_en} ganó ${datos.h2h.w2}.\n`;
    }
    if (datos.lesiones && (datos.lesiones[ap.local]?.length || datos.lesiones[ap.visitante]?.length)) {
        prompt += `- Bajas por lesión: `;
        if (datos.lesiones[ap.local]?.length) prompt += `${L.n_en}: ${datos.lesiones[ap.local].map(j => j.nombre).join(', ')}. `;
        if (datos.lesiones[ap.visitante]?.length) prompt += `${V.n_en}: ${datos.lesiones[ap.visitante].map(j => j.nombre).join(', ')}.`;
        prompt += `\n`;
    }
    prompt += `\nINSTRUCCIONES:\nBasado en estos datos, genera un análisis conciso en 2-3 párrafos en español, con un título atractivo usando markdown. Enfócate en las claves del partido, el favorito y por qué. Sé directo, profesional y analítico. No repitas los datos crudos, interprétalos.`;

    // 3. Call IA and store result
    const analisisMd = await IA.analizar(prompt);
    if (!analisisMd) throw new Error('La IA no generó una respuesta.');

    await Store.guardarResultado(partidoId, { ...resAnterior, analisisIA: analisisMd });
    
    return analisisMd;
  },

  _slotMsKo(m, p) {
    return U.parseUtcMs(m.utc) || Date.parse(`${p.fecha}T16:00:00.000Z`);
  },

  _diaKoCoincide(p, m, apiMs, apiDia) {
    if (!apiMs || !apiDia) return false;
    if (U.diaPartido(m) === apiDia || p.fecha === apiDia) return true;
    return Math.abs(this._slotMsKo(m, p) - apiMs) < 36 * 60 * 60 * 1000;
  },

  _slotKoVacioParaApi(ap, ajustes, usados = new Set()) {
    if (this._slotCanonicoPorPareja(ap, ajustes)) return null;
    const ideal = U._slotKoIdealPorHorario(ap, ajustes);
    if (ideal && !usados.has(ideal.id)) return ideal;
    return null;
  },

  _slotCanonicoPorPareja(ap, ajustes) {
    if (!ap?.local || !ap?.visitante) return null;
    const oficialId = U.idSlotKoOficial(ap.local, ap.visitante);
    if (oficialId) return FIXTURE.porId(oficialId);
    /* Pareja de fase de grupos sin cruce KO oficial → su canon es el partido de grupos,
       aunque un ajuste KO contaminado tenga esos equipos. */
    if (U.esParejaFaseGrupos(ap.local, ap.visitante)) {
      return U.partidoGruposPorPareja(ap.local, ap.visitante);
    }
    const hits = FIXTURE.partidos
      .filter(p => p.fase === 'eliminatorias')
      .map(p => ({ p, raw: U._ajusteRaw(p, ajustes) }))
      .filter(({ raw }) => raw.local && raw.visitante && raw.local !== 'Por definir'
        && ((raw.local === ap.local && raw.visitante === ap.visitante)
          || (raw.local === ap.visitante && raw.visitante === ap.local)))
      .sort((a, b) => a.p.n - b.p.n);
    return hits[0]?.p || null;
  },

  _mismoParKo(m, ap) {
    return m?.local && m?.visitante
      && ((m.local === ap.local && m.visitante === ap.visitante)
        || (m.local === ap.visitante && m.visitante === ap.local));
  },

  /* Mapa de emparejamiento eliminatorias: apiId → partido fixture. */
  _mapaEliminatorias(partidosApi, ajustes) {
    const mapa = new Map();
    const usados = new Set();

    const slotVacio = () => FIXTURE.partidos
      .filter(p => p.fase === 'eliminatorias' && p.ronda === '16avos')
      .map(p => ({ p, raw: U._ajusteRaw(p, ajustes) }))
      .filter(({ raw }) => !raw.local || !raw.visitante || raw.local === 'Por definir')
      .sort((a, b) => a.p.n - b.p.n);

    const mismoPar = (m, ap) => (m.local === ap.local && m.visitante === ap.visitante)
      || (m.local === ap.visitante && m.visitante === ap.local);

    for (const ap of partidosApi) {
      if (!ap.utc || !ap.local || !ap.apiId) continue;
      const apiMs = U.parseUtcMs(ap.utc);
      if (!apiMs) continue;

      const oficialId = U.idSlotKoOficial(ap.local, ap.visitante);
      /* Partido de grupos: nunca consumir un slot KO (evita "correr" los cruces reales). */
      if (!oficialId && U.esParejaFaseGrupos(ap.local, ap.visitante)) continue;
      if (oficialId && !usados.has(oficialId)) {
        mapa.set(ap.apiId, FIXTURE.porId(oficialId));
        usados.add(oficialId);
        continue;
      }

      const conEquipos = FIXTURE.partidos.filter(p => {
        const raw = U._ajusteRaw(p, ajustes);
        return raw.local && raw.visitante && mismoPar(raw, ap);
      });
      if (conEquipos.length === 1) {
        mapa.set(ap.apiId, conEquipos[0]);
        usados.add(conEquipos[0].id);
        continue;
      }
      if (conEquipos.length > 1) {
        conEquipos.sort((a, b) => a.n - b.n);
        mapa.set(ap.apiId, conEquipos[0]);
        usados.add(conEquipos[0].id);
        continue;
      }

      let candidato = null;
      let diffMin = Infinity;
      for (const { p, raw } of slotVacio()) {
        if (usados.has(p.id)) continue;
        const slotMs = U._slotMsKo(raw, p);
        if (slotMs && apiMs) {
          const diff = Math.abs(slotMs - apiMs);
          if (diff < diffMin && diff < 4 * 60 * 60 * 1000) {
            diffMin = diff;
            candidato = p;
          }
        }
      }
      if (candidato) {
        mapa.set(ap.apiId, candidato);
        usados.add(candidato.id);
        continue;
      }

      const ideal = U._slotKoIdealPorHorario(ap, ajustes);
      if (ideal && !usados.has(ideal.id)) {
        mapa.set(ap.apiId, ideal);
        usados.add(ideal.id);
        continue;
      }

      const libresDia = slotVacio().filter(({ p, raw }) => !usados.has(p.id)
        && U._diaKoCoincide(p, raw, apiMs, U.fechaColombia(new Date(apiMs))));
      if (libresDia.length) {
        libresDia.sort((a, b) => {
          const da = Math.abs(U._slotMsKo(a.raw, a.p) - apiMs);
          const db = Math.abs(U._slotMsKo(b.raw, b.p) - apiMs);
          return da - db || a.p.n - b.p.n;
        });
        mapa.set(ap.apiId, libresDia[0].p);
        usados.add(libresDia[0].p.id);
      }
    }
    return mapa;
  },

  _resolverSlotCanonico(ap, ajustes, pDefault) {
    return this._slotCanonicoPorPareja(ap, ajustes) || pDefault;
  },

  async _asignarOrfanosEliminatoria(partidosApi) {
    let asignados = 0;
    const ajustes = await Store.ajustes();
    const slots = FIXTURE.partidos.filter(p => p.fase === 'eliminatorias');
    const clavesUsadas = new Set();
    const slotsOcupados = new Set();

    for (const p of slots) {
      const raw = U._ajusteRaw(p, ajustes);
      if (raw.local && raw.visitante && raw.local !== 'Por definir') {
        const key = U.claveParejaKo(raw.local, raw.visitante);
        if (key) clavesUsadas.add(key);
        slotsOcupados.add(p.id);
      }
    }

    const apis = partidosApi
      .filter(ap => ap.local && ap.visitante && ap.utc)
      .sort((a, b) => (U.parseUtcMs(a.utc) || 0) - (U.parseUtcMs(b.utc) || 0));

    for (const ap of apis) {
      if (U.esParejaFaseGrupos(ap.local, ap.visitante)) continue;
      const key = U.claveParejaKo(ap.local, ap.visitante);
      if (!key || clavesUsadas.has(key)) continue;

      const canon = this._slotCanonicoPorPareja(ap, ajustes);
      if (canon) {
        const raw = U._ajusteRaw(canon, ajustes);
        const patch = {};
        const vacio = !raw.local || !raw.visitante || raw.local === 'Por definir';
        const ocupadoMal = !vacio && !this._mismoParKo(raw, ap);
        if ((vacio || ocupadoMal) && U.idSlotKoOficial(ap.local, ap.visitante) === canon.id) {
          patch.local = ap.local;
          patch.visitante = ap.visitante;
        }
        if (ap.utc && (ap.utc !== raw.utc || !raw.utc || ocupadoMal || vacio)) {
          patch.utc = ap.utc;
          patch.horaOk = true;
        }
        if (ap.estadio && ap.estadio !== raw.estadio) patch.estadio = ap.estadio;
        if (ap.sede && ap.sede !== raw.sede) patch.sede = ap.sede;
        if (Object.keys(patch).length) {
          try {
            await Store.guardarAjuste(canon.id, patch);
            asignados++;
          } catch (_) { /* sin permiso */ }
        }
        clavesUsadas.add(key);
        continue;
      }

      const apiMs = U.parseUtcMs(ap.utc);
      const apiDia = U.fechaColombia(new Date(apiMs));
      let mejor = U._slotKoIdealPorHorario(ap, ajustes);
      let mejorDiff = mejor ? 0 : Infinity;

      if (!mejor) {
        for (const p of slots.filter(x => x.ronda === '16avos')) {
          if (slotsOcupados.has(p.id)) continue;
          const raw = U._ajusteRaw(p, ajustes);
          const slotMs = U._slotMsKo(raw, p);
          const diff = slotMs && apiMs ? Math.abs(slotMs - apiMs) : 999999999;
          const diaOk = U._diaKoCoincide(p, raw, apiMs, apiDia);
          if (diaOk && diff < mejorDiff) {
            mejorDiff = diff;
            mejor = p;
          }
        }
      }

      if (!mejor && apiMs) {
        for (const p of slots.filter(x => x.ronda === '16avos')) {
          if (slotsOcupados.has(p.id)) continue;
          const raw = U._ajusteRaw(p, ajustes);
          const slotMs = U._slotMsKo(raw, p);
          const diff = slotMs && apiMs ? Math.abs(slotMs - apiMs) : 999999999;
          if (diff < mejorDiff) {
            mejorDiff = diff;
            mejor = p;
          }
        }
      }

      if (mejor) {
        try {
          await Store.guardarAjuste(mejor.id, {
            local: ap.local,
            visitante: ap.visitante,
            utc: ap.utc,
            horaOk: true,
            estadio: ap.estadio || undefined,
            sede: ap.sede || undefined
          });
          clavesUsadas.add(key);
          slotsOcupados.add(mejor.id);
          asignados++;
        } catch (_) { /* sin permiso */ }
      }
    }
    return asignados;
  },

  async _limpiarDuplicadosEliminatoria() {
    const ajustes = await Store.ajustes();
    const elim = FIXTURE.partidos
      .filter(p => p.fase === 'eliminatorias')
      .map(p => ({ p, raw: U._ajusteRaw(p, ajustes) }))
      .filter(({ raw }) => raw.local && raw.visitante && raw.local !== 'Por definir');

    const grupos = new Map();
    for (const item of elim) {
      const key = U.claveParejaKo(item.raw.local, item.raw.visitante);
      if (!key) continue;
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key).push(item);
    }

    let limpiados = 0;
    for (const items of grupos.values()) {
      if (items.length < 2) continue;
      const key = U.claveParejaKo(items[0].raw.local, items[0].raw.visitante);
      const oficialId = key ? U.idSlotKoOficial(items[0].raw.local, items[0].raw.visitante) : null;
      let canon = oficialId ? items.find(x => x.p.id === oficialId) : null;
      if (!canon) {
        items.sort((a, b) => a.p.n - b.p.n);
        canon = items[0];
      }
      for (const dup of items) {
        if (dup.p.id === canon.p.id) continue;
        const patch = {};
        if (!canon.raw.local || !canon.raw.visitante || canon.raw.local === 'Por definir') {
          patch.local = dup.raw.local;
          patch.visitante = dup.raw.visitante;
        }
        if (!canon.raw.utc && dup.raw.utc) {
          patch.utc = dup.raw.utc;
          patch.horaOk = dup.raw.horaOk !== false;
        } else if (dup.raw.horaOk && !canon.raw.horaOk) {
          patch.horaOk = true;
        }
        if (!canon.raw.estadio && dup.raw.estadio) patch.estadio = dup.raw.estadio;
        if (!canon.raw.sede && dup.raw.sede) patch.sede = dup.raw.sede;
        if (Object.keys(patch).length) {
          try {
            await Store.guardarAjuste(canon.p.id, patch);
            Object.assign(canon.raw, patch);
          } catch (_) { /* sin permiso */ }
        }
        try {
          if (typeof Store.migrarPrediccionesSlot === 'function') {
            await Store.migrarPrediccionesSlot(dup.p.id, canon.p.id);
          }
          if (typeof Store.migrarResultadoSlot === 'function') {
            await Store.migrarResultadoSlot(dup.p.id, canon.p.id);
          }
          await Store.guardarAjuste(dup.p.id, { local: null, visitante: null, utc: null, horaOk: false });
          limpiados++;
        } catch (_) { /* sin permiso */ }
      }
    }
    return limpiados;
  },

  async _consolidarKoMalUbicados(ajustesIn = null) {
    const ajustes = ajustesIn || await Store.ajustes();
    let movidos = 0;
    /* Varias pasadas: los corrimientos en cadena (A en el slot de B, B en el de C)
       se destraban a medida que se liberan slots. */
    for (let pasada = 0; pasada < 3; pasada++) {
      const movidosAntes = movidos;
      movidos += await this._pasadaConsolidarKo(ajustes);
      if (movidos === movidosAntes) break;
    }
    return movidos;
  },

  async _pasadaConsolidarKo(ajustes) {
    let movidos = 0;
    for (const p of FIXTURE.partidos.filter(x => x.fase === 'eliminatorias')) {
      const raw = U._ajusteRaw(p, ajustes);
      if (!raw.local || !raw.visitante || raw.local === 'Por definir') continue;
      const oficialId = U.idSlotKoOficial(raw.local, raw.visitante);
      /* Pareja de fase de grupos ocupando un slot KO (incl. 16avos): desalojar.
         Pronósticos y marcador se migran al partido de grupos real. */
      if (!oficialId && U.esParejaFaseGrupos(raw.local, raw.visitante)) {
        const pg = U.partidoGruposPorPareja(raw.local, raw.visitante);
        try {
          if (pg && typeof Store.migrarPrediccionesSlot === 'function') {
            await Store.migrarPrediccionesSlot(p.id, pg.id);
          }
          if (pg && typeof Store.migrarResultadoSlot === 'function') {
            await Store.migrarResultadoSlot(p.id, pg.id);
          }
          await Store.guardarAjuste(p.id, { local: null, visitante: null, utc: null, horaOk: false });
          ajustes[p.id] = { ...(ajustes[p.id] || {}), local: null, visitante: null, utc: null, horaOk: false };
          Puntos.invalidarAjustes?.(ajustes);
          if (typeof Store.vaciarResultado === 'function') {
            try { await Store.vaciarResultado(p.id); } catch (_) {}
          }
          movidos++;
        } catch (_) { /* sin permiso */ }
        continue;
      }
      if (!oficialId || oficialId === p.id) continue;
      const dest = FIXTURE.porId(oficialId);
      if (!dest) continue;
      const destRaw = U._ajusteRaw(dest, ajustes);
      if (destRaw.local && destRaw.visitante && destRaw.local !== 'Por definir'
          && !this._mismoParKo(destRaw, raw)) continue;
      try {
        if (typeof Store.migrarPrediccionesSlot === 'function') {
          await Store.migrarPrediccionesSlot(p.id, oficialId);
        }
        if (typeof Store.migrarResultadoSlot === 'function') {
          await Store.migrarResultadoSlot(p.id, oficialId);
        }
        await Store.guardarAjuste(oficialId, {
          local: raw.local,
          visitante: raw.visitante,
          utc: raw.utc,
          horaOk: raw.horaOk !== false,
          estadio: raw.estadio || undefined,
          sede: raw.sede || undefined
        });
        ajustes[oficialId] = {
          ...(ajustes[oficialId] || {}),
          local: raw.local, visitante: raw.visitante,
          utc: raw.utc, horaOk: raw.horaOk !== false
        };
        await Store.guardarAjuste(p.id, { local: null, visitante: null, utc: null, horaOk: false });
        ajustes[p.id] = { ...(ajustes[p.id] || {}), local: null, visitante: null, utc: null, horaOk: false };
        Puntos.invalidarAjustes?.(ajustes);
        movidos++;
      } catch (_) { /* sin permiso */ }
    }
    return movidos;
  },

  /* Slots KO con cruces de fase de grupos (fantasma) — rompen tabla y duplican partidos. */
  async _limpiarSlotsKoFantasma() {
    const ajustes = await Store.ajustes();
    const resultados = await Store.resultados();
    let limpiados = 0;
    for (const p of FIXTURE.partidos) {
      if (p.fase !== 'eliminatorias') continue;
      const raw = U._ajusteRaw(p, ajustes);
      if (!raw.local || !raw.visitante || raw.local === 'Por definir') continue;

      const oficialId = U.idSlotKoOficial(raw.local, raw.visitante);
      if (oficialId === p.id) continue;
      if (oficialId && oficialId !== p.id) {
        try {
          if (typeof Store.migrarPrediccionesSlot === 'function') {
            await Store.migrarPrediccionesSlot(p.id, oficialId);
          }
          if (typeof Store.migrarResultadoSlot === 'function') {
            await Store.migrarResultadoSlot(p.id, oficialId);
          }
          const destRaw = U._ajusteRaw(FIXTURE.porId(oficialId), ajustes);
          const patch = U.patchMigracionKoOficial(p.id, raw, oficialId, destRaw);
          if (Object.keys(patch).length) await Store.guardarAjuste(oficialId, patch);
          await Store.guardarAjuste(p.id, { local: null, visitante: null, utc: null, horaOk: false });
          if (resultados[p.id] && typeof Store.vaciarResultado === 'function') {
            await Store.vaciarResultado(p.id);
          }
          limpiados++;
        } catch (_) { /* sin permiso */ }
        continue;
      }

      if (!U.esParejaFaseGrupos(raw.local, raw.visitante)) continue;
      try {
        const pg = U.partidoGruposPorPareja(raw.local, raw.visitante);
        if (pg && typeof Store.migrarPrediccionesSlot === 'function') {
          await Store.migrarPrediccionesSlot(p.id, pg.id);
        }
        if (pg && typeof Store.migrarResultadoSlot === 'function') {
          await Store.migrarResultadoSlot(p.id, pg.id);
        }
        await Store.guardarAjuste(p.id, { local: null, visitante: null, utc: null, horaOk: false });
        if (resultados[p.id] && typeof Store.vaciarResultado === 'function') {
          await Store.vaciarResultado(p.id);
        }
        limpiados++;
      } catch (_) { /* sin permiso */ }
    }
    return limpiados;
  },

  /* Empareja cada partido del proveedor con el fixture local. */
  _emparejar(apiPartido, ajustes, mapaKo) {
    if (apiPartido.local && apiPartido.visitante && U.esParejaFaseGrupos(apiPartido.local, apiPartido.visitante)) {
      const g = U.partidoGruposPorPareja(apiPartido.local, apiPartido.visitante);
      if (g) return g;
    }

    const existente = this._slotCanonicoPorPareja(apiPartido, ajustes);
    if (existente) return existente;

    if (mapaKo && apiPartido.apiId && mapaKo.has(apiPartido.apiId)) {
      const mapped = mapaKo.get(apiPartido.apiId);
      return this._slotCanonicoPorPareja(apiPartido, ajustes) || mapped;
    }

    /* Eliminatorias: priorizar emparejamiento por equipos cuando ambos están definidos. */
    if (apiPartido.local && apiPartido.visitante) {
      const porEquipos = FIXTURE.partidos.filter(p => {
        if (p.fase === 'grupos') return false;
        const m = Puntos.conAjustes(p, ajustes);
        if (!m.local || !m.visitante) return false;
        if (U.esParejaFaseGrupos(m.local, m.visitante)) return false;
        return this._mismoParKo(m, apiPartido);
      });
      if (porEquipos.length >= 1) {
        porEquipos.sort((a, b) => a.n - b.n);
        return porEquipos[0];
      }
    }

    const slotVacio = this._slotKoVacioParaApi(apiPartido, ajustes);
    if (slotVacio) return slotVacio;

    return FIXTURE.partidos.find(p => {
      if (p.fase !== 'grupos') return false;
      const m = Puntos.conAjustes(p, ajustes);
      const mismoPar = (m.local === apiPartido.local && m.visitante === apiPartido.visitante) ||
                       (m.local === apiPartido.visitante && m.visitante === apiPartido.local);
      if (!m.local || !m.visitante || !mismoPar) return false;
      const apiMs = U.parseUtcMs(apiPartido.utc);
      if (!apiMs) return false;
      if (m.horaOk === true && m.utc) {
        const localMs = U.parseUtcMs(m.utc);
        if (localMs && Math.abs(apiMs - localMs) < 2 * 60 * 60 * 1000) return true;
      }
      const apiDiaCol = U.fechaColombia(new Date(apiMs));
      if (apiDiaCol === m.fecha) return true;
      const fixtureMidCol = Date.parse(`${m.fecha}T05:00:00.000Z`);
      return Math.abs(apiMs - fixtureMidCol) < 20 * 60 * 60 * 1000;
    }) || FIXTURE.partidos.find(p => {
      if (p.fase === 'grupos') return false;
      const m = Puntos.conAjustes(p, ajustes);
      const mismoPar = (m.local === apiPartido.local && m.visitante === apiPartido.visitante) ||
                       (m.local === apiPartido.visitante && m.visitante === apiPartido.local);
      if (m.local && m.visitante && mismoPar) {
        const apiMs = U.parseUtcMs(apiPartido.utc);
        if (!apiMs) return false;

        if (m.horaOk === true && m.utc) {
          const localMs = U.parseUtcMs(m.utc);
          if (localMs && Math.abs(apiMs - localMs) < 2 * 60 * 60 * 1000) return true;
        }

        /* Sin hora confirmada: emparejar por día calendario en Colombia.
           Partidos nocturnos (ej. 9 p.m. COT) caen en el día UTC siguiente. */
        const apiDiaCol = U.fechaColombia(new Date(apiMs));
        if (apiDiaCol === m.fecha) return true;

        const fixtureMidCol = Date.parse(`${m.fecha}T05:00:00.000Z`);
        if (Math.abs(apiMs - fixtureMidCol) < 20 * 60 * 60 * 1000) return true;
      }
      return false;
    });
  },

  async _procesarPartidosApi(partidosApi, esCicloEnVivo = false) {
    const [ajustes, resActuales] = await Promise.all([Store.ajustes(), Store.resultados()]);
    try {
      await this._consolidarKoMalUbicados(ajustes);
    } catch (e) {
      console.warn('Consolidar KO mal ubicados:', e);
    }
    const mapaKo = this._mapaEliminatorias(partidosApi, ajustes);
    let calendario = 0, marcadores = 0;
    const ventanaHoras = esCicloEnVivo ? 36 : 52;
    for (const ap of partidosApi) {
      if (!this._enVentanaSync(ap, ventanaHoras)) continue;

      const pEmp = this._emparejar(ap, ajustes, mapaKo);
      if (!pEmp) continue;

      let p = this._resolverSlotCanonico(ap, ajustes, pEmp);
      const oficialId = U.idSlotKoOficial(ap.local, ap.visitante);
      if (oficialId) {
        p = FIXTURE.porId(oficialId) || p;
      } else if (!this._slotCanonicoPorPareja(ap, ajustes)) {
        const ideal = U._slotKoIdealPorHorario(ap, ajustes);
        if (ideal) p = ideal;
      }
      if (oficialId && p?.id !== oficialId) {
        p = FIXTURE.porId(oficialId) || p;
      }
      /* Cruce de fase de grupos jamás va en un slot eliminatorio (ni en 16avos):
         redirigir el marcador al partido de grupos real. */
      if (p?.fase === 'eliminatorias' && U.esParejaFaseGrupos(ap.local, ap.visitante) && !oficialId) {
        const pg = U.partidoGruposPorPareja(ap.local, ap.visitante);
        if (!pg) {
          console.warn(`Sync: ignorando ${ap.local} vs ${ap.visitante} en slot ${p.id} (cruce de grupos en KO)`);
          continue;
        }
        p = pg;
      }
      const m = Puntos.conAjustes(p, ajustes);
      const ahora = Date.now();
      const kickoff = U.parseUtcMs(ap.utc) || U.parseUtcMs(m.utc);
      // Limbo: desde el pitazo hasta +15 min si la API aún no confirma en vivo.
      const enLimbo = kickoff && ahora >= kickoff && ahora < kickoff + U.LIMBO_MS;

      const aj = {};
      const invertido = m.local && (m.local === ap.visitante);
      if (ap.utc && (ap.utc !== m.utc || m.horaOk === false)) {
        const newApiDate = U.parseUtcMs(ap.utc);
        const apiDiaCol = newApiDate ? U.fechaColombia(new Date(newApiDate)) : null;
        const diaFixtureOk = apiDiaCol === p.fecha;
        const ventanaOk = newApiDate
          && Math.abs(newApiDate - Date.parse(`${p.fecha}T12:00:00.000Z`)) < 48 * 60 * 60 * 1000;
        const diaPartidoOk = apiDiaCol && apiDiaCol === U.diaPartido({ ...m, utc: ap.utc });

        if (diaFixtureOk || ventanaOk || diaPartidoOk) {
          aj.utc = ap.utc;
          const placeholder = `${p.fecha}T16:00:00Z`;
          aj.horaOk = m.horaOk === true || ap.utc !== placeholder;
        } else {
          console.warn(`Sync warning for ${p.id}: API UTC ${ap.utc} no coincide con fecha fixture ${p.fecha}. Ignorando actualización de hora.`);
        }
      }
      if (ap.estadio && ap.estadio !== m.estadio) { aj.estadio = ap.estadio; aj.sede = ap.sede || m.sede; }
      const parejaKoOficial = oficialId && p?.id === oficialId;
      const slotMalOcupado = m.local && m.visitante && !this._mismoParKo(m, ap);
      if (ap.local) {
        const slotVacio = !m.local || m.local === 'Por definir' || !m.visitante || m.visitante === 'Por definir';
        const mismoPar = this._mismoParKo(m, ap);
        const slotCorrecto = oficialId === p.id;
        /* No pisar un slot 16avos oficial que ya tiene el cruce correcto. */
        if (slotVacio || mismoPar || (parejaKoOficial && slotMalOcupado) || slotCorrecto) {
          if (!mismoPar || slotVacio || slotCorrecto) {
            aj.local = ap.local;
            aj.visitante = ap.visitante;
          }
        }
      }

      if (Object.keys(aj).length) {
          try {
            await Store.guardarAjuste(p.id, aj);
            calendario++;
            if (aj.utc && typeof Store.recalcularTardiosPartido === 'function') {
              const ajustesFresh = await Store.ajustes();
              await Store.recalcularTardiosPartido([p.id], id =>
                Puntos.conAjustes(FIXTURE.porId(id) || {}, ajustesFresh));
            }
          }
          catch (_) { /* sin permiso — solo admins actualizan ajustes */ }
        }
      if (ap.estado) {
        const resAnterior = resActuales[p.id];
        const glNuevo = invertido ? ap.gv : ap.gl;
        const gvNuevo = invertido ? ap.gl : ap.gv;

        // No marcar en vivo/finalizado antes del cierre de pronósticos (evita cierres prematuros).
        const partidoEf = { ...p, ...m, ...(Object.keys(aj).length ? aj : {}) };
        const estadoConfiable = U._estadoLiveConfiable(partidoEf, resAnterior, ap.estado);

        if (!estadoConfiable && (ap.estado === 'en_juego' || ap.estado === 'finalizado')) {
          console.warn(`Sync: ignorando estado "${ap.estado}" prematuro para ${p.id} (pitazo ${ap.utc})`);
        } else {
        const minutoN = U.minutoNum(ap.minuto);
        let minutoExtraN = U.minutoNum(ap.minutoExtra);
        const minutoGuardado = minutoN != null ? minutoN : U.minutoNum(resAnterior?.minuto);
        /* Limpiar descuento obsoleto: API null + minuto < 90 → no conservar extra viejo en Firestore. */
        if (minutoExtraN == null && ap.minutoExtra == null) {
          minutoExtraN = null;
        } else if (minutoExtraN != null && minutoExtraN > 0 && minutoGuardado != null) {
          const per = ap.periodo || '';
          const desc1 = per === '1H' && minutoGuardado >= 45;
          const desc2 = minutoGuardado >= 90;
          if (!desc1 && !desc2) minutoExtraN = null;
        }
        const minutoExtraGuardado = minutoExtraN;
        const relojNuevo = {
          minuto: minutoGuardado,
          minutoExtra: minutoExtraGuardado,
          periodo: ap.periodo || null,
          estado: ap.estado
        };
        const resultado = {
          apiId:    ap.apiId || null,
          estado:   ap.estado,
          minuto:   minutoGuardado,
          minutoExtra: minutoExtraGuardado,
          minutoAt: U.cambioRelojLive(relojNuevo, resAnterior)
            ? Date.now()
            : (U.minutoAtServidor(resAnterior) || Date.now()),
          periodo:  ap.periodo || null,
          gl: glNuevo,
          gv: gvNuevo
        };
        if (ap.estado === 'aplazado') resultado.motivoAplazamiento = this._motivoAplazamiento(ap.periodo) || '';

        const penGlApi = ap.penalesGl ?? null;
        const penGvApi = ap.penalesGv ?? null;
        if (penGlApi != null && penGvApi != null) {
          resultado.penales = {
            gl: invertido ? penGvApi : penGlApi,
            gv: invertido ? penGlApi : penGvApi
          };
        } else if (resAnterior?.penales) {
          resultado.penales = resAnterior.penales;
        }

        console.log(`⚽ Partido ${p.id}: estado=${ap.estado}, gl=${glNuevo}, gv=${gvNuevo}`);

        // Eventos / stats: solo en ciclo en vivo y partidos realmente activos (ahorra cuota API).
        const recienFin   = ap.estado === 'finalizado' && resAnterior?.estado !== 'finalizado';
        const extrasVivos = esCicloEnVivo && (ap.estado === 'en_juego' || recienFin);
        const enPenales   = ap.periodo === 'P' || (penGlApi != null && penGvApi != null);
        const cambioGol   = (glNuevo + gvNuevo) > ((resAnterior?.gl || 0) + (resAnterior?.gv || 0));
        const cambioPen   = resultado.penales && (
          !resAnterior?.penales
          || resultado.penales.gl !== resAnterior.penales.gl
          || resultado.penales.gv !== resAnterior.penales.gv
        );
        if (extrasVivos && (cambioGol || recienFin) && ap.apiId) {
          const evs = await this.traerEventos(ap.apiId);
          resultado.eventos = evs.length ? evs : (resAnterior?.eventos || []);
        } else {
          resultado.eventos = resAnterior?.eventos || [];
        }

        if (extrasVivos && enPenales && ap.apiId && (ap.periodo === 'P' || cambioPen || recienFin || !resAnterior?.penalesTanda)) {
          const tanda = await this.traerTandaPenales(ap.apiId);
          if (tanda.length) {
            resultado.penalesTanda = tanda;
          } else if (resAnterior?.penalesTanda) {
            resultado.penalesTanda = resAnterior.penalesTanda;
          }
        } else if (resAnterior?.penalesTanda) {
          resultado.penalesTanda = resAnterior.penalesTanda;
        }

        if (extrasVivos && ap.apiId) {
          if (ahora - (resAnterior?.statsAt || 0) > 5 * 60000 || recienFin) {
            // Mapa ID de equipo API → código interno, por si el nombre difiere entre endpoints
            const teamIdMap = {};
            if (ap.localApiTeamId)     teamIdMap[ap.localApiTeamId]     = invertido ? ap.visitante : ap.local;
            if (ap.visitanteApiTeamId) teamIdMap[ap.visitanteApiTeamId] = invertido ? ap.local     : ap.visitante;
            const tarj = await this.traerTarjetas(ap.apiId, teamIdMap);
            resultado.tarjetas = Object.keys(tarj).length ? tarj : (resAnterior?.tarjetas || {});
            resultado.statsAt  = ahora;
          } else {
            resultado.tarjetas = resAnterior?.tarjetas || {};
            resultado.statsAt  = resAnterior?.statsAt  || 0;
          }
        }

        // Predicción y alineación: preservar lo que ya tengamos
        resultado.prediccion = resAnterior?.prediccion || null;
        resultado.alineacion = resAnterior?.alineacion || null;
        resultado.h2h = resAnterior?.h2h || null;
        resultado.lesiones = resAnterior?.lesiones || null;

        // Alineación durante el partido si aún no se obtuvo (solo ciclo en vivo)
        if (esCicloEnVivo && !resultado.alineacion && ap.apiId && ap.estado === 'en_juego') {
          const alin = await this.traerAlineacion(ap.apiId);
          if (alin?.length) {
            const tmAlin = {};
            if (ap.localApiTeamId)     tmAlin[ap.localApiTeamId]     = invertido ? ap.visitante : ap.local;
            if (ap.visitanteApiTeamId) tmAlin[ap.visitanteApiTeamId] = invertido ? ap.local     : ap.visitante;
            for (const eq of alin) {
              if (!eq.cod && eq.apiId && tmAlin[eq.apiId]) eq.cod = tmAlin[eq.apiId];
            }
            resultado.alineacion = alin;
          }
        }

        await Store.guardarResultado(p.id, resultado);
        marcadores++;
        }
      } else if (kickoff && this._enVentanaIniciando(kickoff)) {
        /* Pitazo reciente sin confirmación API: marcar iniciando (máx. 3 h). */
        const resAnterior = resActuales[p.id] || {};
        if (resAnterior.estado !== 'en_juego' && resAnterior.estado !== 'finalizado' && resAnterior.estado !== 'aplazado') {
          if (resAnterior.estado !== 'iniciando') {
            try {
              await Store.guardarResultado(p.id, { ...resAnterior, estado: 'iniciando' });
              marcadores++;
            } catch (_) { /* usuarios no-admin usan regla limitada de iniciando */ }
          }
        }
      } else if (esCicloEnVivo && ap.apiId && ap.utc) {
          // Partidos próximos: predicción/alineación solo en ciclo automático del admin.
          const mins   = (U.parseUtcMs(ap.utc) - ahora) / 60000;
          if (mins > 0) {
            const resAnterior = resActuales[p.id] || {};
            const extra = {};

            // Análisis IA (48h antes) - Con plan PRO, se puede generar en el ciclo en vivo.
            if (mins < 2880 && !resAnterior.analisisIA && window.IA && IA.disponible()) {
                const L = FIXTURE.equipo(ap.local);
                const V = FIXTURE.equipo(ap.visitante);
                
                // 1. Gather all data needed for the prompt
                const datos = {
                    prediccion: resAnterior.prediccion || await this.traerPrediccion(ap.apiId),
                    h2h: resAnterior.h2h || await this.traerH2H(ap.localApiTeamId, ap.visitanteApiTeamId),
                    lesiones: resAnterior.lesiones || await this.traerLesiones(ap.apiId)
                };

                // 2. Build the prompt
                let prompt = `Eres un analista experto de fútbol. Analiza el partido del Mundial 2026 entre ${L.n_en} y ${V.n_en}.\n\nDATOS DISPONIBLES:\n`;
                if (datos.prediccion) {
                    prompt += `- Probabilidades (modelo API): ${L.n_en} (${datos.prediccion.pct.l}), Empate (${datos.prediccion.pct.e}), ${V.n_en} (${datos.prediccion.pct.v}).\n`;
                    prompt += `- Marcador más probable (modelo API): ${datos.prediccion.goles.l} a ${datos.prediccion.goles.v}.\n`;
                    if (datos.prediccion.consejo) prompt += `- Consejo de apuesta: ${datos.prediccion.consejo}.\n`;
                }
                if (datos.h2h) {
                    prompt += `- Historial (últimos ${datos.h2h.w1 + datos.h2h.empate + datos.h2h.w2}): ${L.n_en} ganó ${datos.h2h.w1}, empataron ${datos.h2h.empate}, y ${V.n_en} ganó ${datos.h2h.w2}.\n`;
                }
                if (datos.lesiones && (datos.lesiones[ap.local]?.length || datos.lesiones[ap.visitante]?.length)) {
                    prompt += `- Bajas por lesión: `;
                    if (datos.lesiones[ap.local]?.length) prompt += `${L.n_en}: ${datos.lesiones[ap.local].map(j => j.nombre).join(', ')}. `;
                    if (datos.lesiones[ap.visitante]?.length) prompt += `${V.n_en}: ${datos.lesiones[ap.visitante].map(j => j.nombre).join(', ')}.`;
                    prompt += `\n`;
                }
                prompt += `\nINSTRUCCIONES:\nBasado en estos datos, genera un análisis conciso en 2-3 párrafos en español, con un título atractivo usando markdown. Enfócate en las claves del partido, el favorito y por qué. Sé directo, profesional y analítico. No repitas los datos crudos, interprétalos.`;

                // 3. Call IA and store result
                try { const analisisMd = await IA.analizar(prompt); if (analisisMd) extra.analisisIA = analisisMd; }
                catch (e) { console.warn(`Fallo al generar análisis IA para ${p.id}:`, e); }
            }

            // Predicción (24h antes) y Alineación (2h antes) - se pueden buscar en vivo
            if (mins < 1440 && !resAnterior.prediccion) {
              const pred = await this.traerPrediccion(ap.apiId);
              if (pred) extra.prediccion = pred;
            }
            if (mins < 1440 && !resAnterior.h2h && ap.localApiTeamId && ap.visitanteApiTeamId) {
              const h2h = await this.traerH2H(ap.localApiTeamId, ap.visitanteApiTeamId);
              if (h2h) extra.h2h = h2h;
            }
            if (mins < 1440 && !resAnterior.lesiones && ap.apiId) {
              const lesiones = await this.traerLesiones(ap.apiId);
              if (lesiones) extra.lesiones = lesiones;
            }
            // Alineaciones: reintentar desde 24h antes hasta 30 min después del pitazo
            if (mins < 1440 && mins > -30 && !resAnterior.alineacion) {
              const alin = await this.traerAlineacion(ap.apiId);
              if (alin && alin.length) {
                const tmAlin = {};
                if (ap.localApiTeamId)     tmAlin[ap.localApiTeamId]     = invertido ? ap.visitante : ap.local;
                if (ap.visitanteApiTeamId) tmAlin[ap.visitanteApiTeamId] = invertido ? ap.local     : ap.visitante;
                for (const eq of alin) {
                  if (!eq.cod && eq.apiId && tmAlin[eq.apiId]) eq.cod = tmAlin[eq.apiId];
                }
                extra.alineacion = alin;
              }
            }
            if (Object.keys(extra).length) {
              await Store.guardarResultado(p.id, { ...resAnterior, ...extra });
              marcadores++;
              }
            }
      }
    }

    let limpiados = 0, asignados = 0, movidos = 0;
    try {
      movidos = await this._consolidarKoMalUbicados();
      limpiados = await this._limpiarDuplicadosEliminatoria();
      asignados = await this._asignarOrfanosEliminatoria(partidosApi);
      if (asignados || limpiados || movidos) {
        console.log(`🧹 Reconciliación KO: ${asignados} huérfano(s), ${limpiados} dup. limpiados, ${movidos} reubicados.`);
      }
    } catch (e) {
      console.warn('Reconciliación eliminatorias:', e);
    }

    return { calendario, marcadores, total: partidosApi.length, limpiados, asignados, movidos };
  },

  /* Sincronización manual del admin: ventana de ±1 día (3 llamadas API), no todo el torneo. */
  async sincronizar() {
    if (!this.disponible()) throw new Error('Configura primero la URL del proxy en js/config.js.');
    console.log('🔄 Sincronización manual (ayer · hoy · mañana — 3 peticiones API)...');
    return this.sincronizarEnVivo();
  },

  /* Sync completa del calendario (1 petición, sin extras). Solo si hace falta reconciliar todo. */
  async sincronizarCalendarioCompleto() {
    if (!this.disponible()) throw new Error('Configura primero la URL del proxy en js/config.js.');
    console.log('🔄 Sincronización COMPLETA de calendario (1 petición API)...');
    const partidosApi = await this.traerPartidos();
    const partidosUnicos = Array.from(new Map(partidosApi.map(p => [p.apiId, p])).values());
    console.log(`📊 ${partidosUnicos.length} partidos en API. Solo se actualizan los de la ventana ±52 h.`);
    return this._procesarPartidosApi(partidosUnicos, false);
  },

  async sincronizarEnVivo(opts = {}) {
    if (!this.disponible()) {
      console.warn('API no disponible, saltando ciclo en vivo.');
      return { calendario: 0, marcadores: 0, total: 0 };
    }
    console.log('🔄 Sync en vivo (ayer · hoy · mañana — 3 peticiones API)...');

    const hoy = new Date();
    const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
    const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1);
    const format = (d) => U.fechaColombia(d);

    try {
      const [partidosAyer, partidosHoy, partidosManana] = await Promise.all([
        this.traerPartidosDelDia(format(ayer)),
        this.traerPartidosDelDia(format(hoy)),
        this.traerPartidosDelDia(format(manana))
      ]);
      const partidosApi = [...partidosAyer, ...partidosHoy, ...partidosManana];

      const partidosUnicos = Array.from(new Map(partidosApi.map(p => [p.apiId, p])).values());
      return this._procesarPartidosApi(partidosUnicos, opts.ligero === true);
    } catch (e) {
      console.error('Error en ciclo de sincronización en vivo:', e);
      return { calendario: 0, marcadores: 0, total: 0, error: true };
    }
  },

  /* Marcador automático: repite sincronizar() cada N segundos
     mientras la pestaña esté visible. Devuelve función para parar.
     Tasa adaptativa (plan Pro ~7.500 req/día; ciclo auto = 2 peticiones):
     - Entretiempo / penales: cada 20 s
     - Últimos 10 min de cada tiempo: cada 15 s
     - Resto del partido en vivo: cada 30 s (config)
     - Sin partidos activos: cada 2 min */
  cicloEnVivo(alTerminarCadaCiclo) {
    let activo = true;
    let tickTimeout = null;
    let ultimoSyncOculto = 0;
    const INTERVALO_OCULTO_MS = 45000; // pestaña en segundo plano: cada 45 s

    const baseMs = () => Math.max((CONFIG.API_FUTBOL.intervaloSegundos || 30) * 1000, 15000);

    const _intervaloPartidoVivo = (r) => {
      const per = r.periodo || '';
      const min = parseInt(r.minuto, 10) || 0;
      if (per === 'HT' || per === 'BT' || U.esDescanso(r)) return 20000;
      if (per === 'P' || r.penales) return 20000;
      if (per === '1H' && min >= 35) return 15000;
      if (per === '2H' && min >= 80) return 15000;
      if (!per && min >= 35 && min <= 45) return 15000;
      if (!per && min >= 80) return 15000;
      if (min <= 15) return 25000;
      return baseMs();
    };

    const _proximoIntervalo = (ajFix, resLive) => {
      const ahora = Date.now();
      let intervaloMinimo = 120000;

      const vivos = Object.values(resLive || {}).filter(r => r.estado === 'en_juego');
      if (vivos.length) {
        return Math.min(...vivos.map(_intervaloPartidoVivo));
      }

      for (const p of (window.FIXTURE?.partidos || [])) {
        const utc = ajFix?.[p.id]?.utc || p.utc;
        if (!utc) continue;

        const inicio = new Date(utc).getTime();
        const minutosHastaInicio = (inicio - ahora) / 60000;

        if (minutosHastaInicio > 0 && minutosHastaInicio <= 30) {
          intervaloMinimo = Math.min(intervaloMinimo, 30000);
        } else if (minutosHastaInicio <= 0 && minutosHastaInicio > -120) {
          intervaloMinimo = Math.min(intervaloMinimo, 45000);
        }
      }

      return Math.max(intervaloMinimo, 30000);
    };

    const tick = async () => {
      if (!activo) return;

      const ajFix = window._ajustesLive || {};
      const resLive = window._resultadosLive || {};

      // Sincronizar con pestaña visible (intervalo adaptativo) o en segundo plano (cada 90s).
      const oculto = document.hidden;
      const tocaSyncOculto = oculto && (Date.now() - ultimoSyncOculto >= INTERVALO_OCULTO_MS);
      if (!oculto || tocaSyncOculto) {
        const puedeSync = Store.reclamarSincronizacion
          ? await Store.reclamarSincronizacion()
          : true;
        if (puedeSync) {
          try {
            const r = await this.sincronizarEnVivo({ ligero: true });
            if (oculto) ultimoSyncOculto = Date.now();
            alTerminarCadaCiclo && alTerminarCadaCiclo(r);
          } catch (e) {
            console.warn('Sincronización en vivo:', e.message);
          }
        }
      }

      if (activo) {
        const proxIntervalo = _proximoIntervalo(ajFix, resLive);
        tickTimeout = setTimeout(tick, proxIntervalo);
      }
    };

    tick();
    return () => {
      activo = false;
      if (tickTimeout) {
        clearTimeout(tickTimeout);
        tickTimeout = null;
      }
    };
  },

  /* Simulador minuto a minuto (solo modo demo). */
  simular(pid, alAvanzar) {
    let minuto = 0, gl = 0, gv = 0, parado = false;
    const paso = async () => {
      if (parado) return;
      minuto = Math.min(90, minuto + 5 + Math.floor(Math.random() * 4));
      if (Math.random() < 0.16) gl++;
      if (Math.random() < 0.13) gv++;
      const fin = minuto >= 90;
      await Store.guardarResultado(pid, { estado: fin ? 'finalizado' : 'en_juego', minuto: fin ? 90 : minuto, gl, gv });
      alAvanzar && alAvanzar({ minuto, gl, gv, fin });
      if (!fin) setTimeout(paso, 2500);
    };
    paso();
    return () => { parado = true; };
  }
};
window.ApiFutbol = ApiFutbol;

/* La sync con la API la controla el admin (automático si hay partidos en vivo).
   Ciclo automático: 2 peticiones API (ayer+hoy). Manual: 3 (±1 día).
   El resto de usuarios reciben marcadores vía Firestore en tiempo real. */
