/* ============================================================
   POLLA SIIGO 2026 — POSICIONES Y GOLEADORES
   Usa la API cuando el proxy lo permite; si no, calcula desde
   los resultados registrados en la Polla.
   ============================================================ */

const GruposApi = (() => {

  const LEAGUE = 1;
  const SEASON = 2026;

  async function _fetchApi(path, params = {}) {
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    if (!urlBase) return null;
    const url = new URL(`${urlBase}${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    try {
      const r = await fetch(url.toString());
      if (!r.ok) return null;
      const data = await r.json();
      if (data.error) return null;
      return data;
    } catch (_) { return null; }
  }

  /* Obtiene las posiciones de todos los grupos desde la API */
  async function obtenerPosiciones() {
    const data = await _fetchApi('/standings', { league: LEAGUE, season: SEASON });
    if (!data?.response?.length) return null;

    const grupos = {};
    for (const entry of data.response) {
      const liga = entry.league;
      if (!liga?.standings) continue;
      for (const grupoStanding of liga.standings) {
        if (!grupoStanding?.length) continue;
        const grupoNombre = grupoStanding[0]?.group || grupoStanding[0]?.description || '';
        const letra = (grupoNombre.match(/Group\s+([A-L])/i)?.[1] ||
                      grupoNombre.match(/\b([A-L])\b/)?.[0] || '?').toUpperCase();

        grupos[letra] = grupoStanding.map(eq => {
          const all = eq.all || {};
          return {
            rank: eq.rank || 0,
            code: ApiFutbol._codigo(eq.team?.name) || eq.team?.name?.slice(0, 3).toUpperCase() || '???',
            teamName: eq.team?.name || '',
            logo: eq.team?.logo || '',
            pj: all.played || 0,
            pg: all.win || 0,
            pe: all.draw || 0,
            pp: all.lose || 0,
            gf: all.goals?.for || 0,
            gc: all.goals?.against || 0,
            dg: (all.goals?.for || 0) - (all.goals?.against || 0),
            pts: eq.points || 0,
            form: eq.form || '',
            fuente: 'api'
          };
        });
      }
    }
    return Object.keys(grupos).length ? grupos : null;
  }

  /* Convierte tablas locales de Puntos.gruposMundial al formato del widget */
  function posicionesDesdeResultados(resultados) {
    if (!window.Puntos || !window.FIXTURE) return null;
    const tablas = Puntos.gruposMundial(resultados || {});
    const grupos = {};
    for (const [letra, filas] of Object.entries(tablas)) {
      grupos[letra] = filas.map((f, i) => ({
        rank: i + 1,
        code: f.code,
        teamName: FIXTURE.equipo(f.code)?.n || f.code,
        logo: '',
        pj: f.pj, pg: f.pg, pe: f.pe, pp: f.pp,
        gf: f.gf, gc: f.gc, dg: f.dg, pts: f.pts,
        form: '',
        fuente: 'polla'
      }));
    }
    return Object.keys(grupos).length ? grupos : null;
  }

  /* Obtiene los máximos goleadores del torneo */
  async function obtenerGoleadores(limite = 20) {
    const data = await _fetchApi('/players/topscorers', { league: LEAGUE, season: SEASON });
    if (!data?.response?.length) return null;

    return data.response.slice(0, limite).map(j => {
      const p = j.player || {};
      const est = j.statistics?.[0] || {};
      const goles = est.goals || {};
      return {
        nombre: p.name || '',
        foto: p.photo || '',
        equipo: ApiFutbol._codigo(est.team?.name) || '',
        equipoNombre: est.team?.name || '',
        goles: goles.total ?? 0,
        asistencias: est.goals?.assists ?? 0,
        partidos: est.games?.appearences ?? est.games?.appearances ?? 0,
        minutos: est.games?.minutes ?? 0,
        penales: goles.penalty ?? goles.penalties ?? 0,
        fuente: 'api'
      };
    }).filter(g => g.goles > 0);
  }

  /* Goleadores calculados desde eventos de partidos en Firestore */
  function goleadoresDesdeResultados(resultados, limite = 20) {
    const mapa = {};
    for (const res of Object.values(resultados || {})) {
      for (const ev of res?.eventos || []) {
        if (ev.t !== 'gol' || ev.subtipo === 'autogol') continue;
        const nombre = ev.n || ev.j || 'Desconocido';
        const key = `${ev.eq}::${nombre}`;
        if (!mapa[key]) {
          mapa[key] = {
            nombre,
            foto: '',
            equipo: ev.eq,
            equipoNombre: FIXTURE.equipo(ev.eq)?.n || ev.eq,
            goles: 0,
            asistencias: 0,
            partidos: 0,
            penales: ev.subtipo === 'penal' ? 1 : 0,
            fuente: 'polla'
          };
        }
        mapa[key].goles++;
        if (ev.subtipo === 'penal') mapa[key].penales++;
      }
    }
    return Object.values(mapa)
      .sort((a, b) => b.goles - a.goles || a.nombre.localeCompare(b.nombre))
      .slice(0, limite);
  }

  function badgeFuente(fuente) {
    if (fuente === 'api') return '<span class="widget-fuente widget-fuente--api">Feed en vivo</span>';
    if (fuente === 'polla') return '<span class="widget-fuente widget-fuente--polla">Datos Polla</span>';
    return '';
  }

  /* Renderiza las posiciones en HTML */
  function renderPosiciones(grupos) {
    if (!grupos || !Object.keys(grupos).length) {
      return `<div class="aviso" style="margin:16px 0">No hay datos de posiciones disponibles. <button class="boton boton--mini" onclick="GruposApi.cargarWidgets()">🔄 Reintentar</button></div>`;
    }

    const fuente = grupos[Object.keys(grupos)[0]]?.[0]?.fuente;
    const gruposKeys = Object.keys(grupos).sort();
    return `${badgeFuente(fuente)}<div class="grupos-api-grid">
      ${gruposKeys.map(letra => {
        const filas = grupos[letra];
        return `<div class="panel grupo-card">
          <div class="grupo-header">
            <h3>GRUPO ${letra}</h3>
            <span style="font-size:10.5px;color:var(--tinta-3);">${filas.length} equipos</span>
          </div>
          <table class="grupo-tabla">
            <thead><tr>
              <th style="text-align:left">#</th>
              <th style="text-align:left">Equipo</th>
              <th>PJ</th><th>G</th><th>E</th><th>P</th>
              <th>GF</th><th>GC</th><th>DG</th><th>PTS</th>
            </tr></thead>
            <tbody>
              ${filas.map(f => {
                const eq = window.FIXTURE?.equipo(f.code);
                const bandera = eq?.b || (f.logo ? `<img src="${U.esc(f.logo)}" style="width:18px;height:18px;vertical-align:middle;border-radius:2px;">` : '⚽');
                const clasif = f.rank <= 2 ? 'clasifica' : '';
                const dgStr = f.dg > 0 ? `+${f.dg}` : String(f.dg);
                return `<tr class="${clasif}">
                  <td style="font-weight:600;color:var(--tinta-3);font-size:11px;">${f.rank}</td>
                  <td><div class="td-equipo">${bandera}<span class="td-nombre">${U.esc(f.teamName || eq?.n || f.code)}</span></div></td>
                  <td>${f.pj}</td><td>${f.pg}</td><td>${f.pe}</td><td>${f.pp}</td>
                  <td>${f.gf}</td><td>${f.gc}</td>
                  <td style="font-family:var(--fuente-marcador);font-size:12px;color:${f.dg > 0 ? 'var(--verde-claro)' : f.dg < 0 ? '#e0354b' : 'var(--tinta-3)'};">${dgStr}</td>
                  <td style="font-family:var(--fuente-marcador);font-weight:700;color:var(--dorado);">${f.pts}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
      }).join('')}
    </div>`;
  }

  /* Renderiza los goleadores en HTML */
  function renderGoleadores(goleadores) {
    if (!goleadores || !goleadores.length) {
      return `<div class="aviso" style="margin:16px 0">No hay datos de goleadores todavía. Se actualizan conforme avancen los partidos. <button class="boton boton--mini" onclick="GruposApi.cargarWidgets()">🔄 Reintentar</button></div>`;
    }

    const fuente = goleadores[0]?.fuente;
    return `${badgeFuente(fuente)}<div class="goleadores-api">
      <table class="grupo-tabla">
        <thead><tr>
          <th style="text-align:left">#</th>
          <th style="text-align:left">Jugador</th>
          <th style="text-align:left">Equipo</th>
          <th>Goles</th>
          <th>Penales</th>
          <th>Asist.</th>
          <th>PJ</th>
        </tr></thead>
        <tbody>
          ${goleadores.map((g, i) => {
            const eq = window.FIXTURE?.equipo(g.equipo);
            const bandera = eq?.b || '⚽';
            return `<tr>
              <td style="font-weight:600;color:var(--tinta-3);font-size:11px;">${i + 1}</td>
              <td><div style="display:flex;align-items:center;gap:8px;">${g.foto ? `<img src="${U.esc(g.foto)}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;">` : ''}<span style="font-weight:600;">${U.esc(g.nombre)}</span></div></td>
              <td>${bandera} ${U.esc(g.equipoNombre || eq?.n || g.equipo)}</td>
              <td style="font-family:var(--fuente-marcador);font-size:16px;color:var(--dorado);font-weight:700;">${g.goles}</td>
              <td style="color:var(--tinta-3);font-size:12px;">${g.penales > 0 ? g.penales : '—'}</td>
              <td>${g.asistencias || '—'}</td>
              <td>${g.partidos || '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  /* Carga los datos y actualiza los contenedores */
  async function cargarWidgets(resultadosLocales) {
    const contPos = document.getElementById('contenedor-posiciones-api');
    const contGol = document.getElementById('contenedor-goleadores-api');

    if (contPos) contPos.innerHTML = '<div style="text-align:center;padding:20px;color:var(--tinta-3);font-size:13px;">⏳ Cargando posiciones...</div>';
    if (contGol) contGol.innerHTML = '<div style="text-align:center;padding:20px;color:var(--tinta-3);font-size:13px;">⏳ Cargando goleadores...</div>';

    const res = resultadosLocales || window._resultadosLive || {};

    let [posiciones, goleadores] = await Promise.all([
      obtenerPosiciones(),
      obtenerGoleadores()
    ]);

    if (!posiciones) posiciones = posicionesDesdeResultados(res);
    if (!goleadores?.length) {
      const local = goleadoresDesdeResultados(res);
      if (local.length) goleadores = local;
    }

    if (contPos) contPos.innerHTML = renderPosiciones(posiciones);
    if (contGol) contGol.innerHTML = renderGoleadores(goleadores);
  }

  return { obtenerPosiciones, obtenerGoleadores, renderPosiciones, renderGoleadores, cargarWidgets, goleadoresDesdeResultados, posicionesDesdeResultados };
})();

window.GruposApi = GruposApi;
