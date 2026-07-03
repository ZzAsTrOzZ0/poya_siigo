/* js/marcadores.js */
export const Marcadores = {
  container: null,
  intervalo: null,

  async init(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    
    // Dibuja el marcador inmediatamente
    await this.render();
  },

  async render() {
    // Usar el proxy de la API, no la llave directa.
    if (!window.ApiFutbol || !window.ApiFutbol.disponible()) {
      this.container.innerHTML = `<!-- Widget de marcadores deshabilitado: API no configurada. -->`;
      return;
    }

    this.container.innerHTML = `
      <div class="mrc-widget">
        <div class="mrc-header" style="margin-bottom: 15px;">
          <div class="mrc-titulo">⏱ Partidos de Hoy — FIFA Mundial 2026</div>
        </div>
        <div id="marcadores-hoy-lista">
          <div class="aviso">Cargando partidos de hoy...</div>
        </div>
      </div>
    `;

    try {
      const hoyLocal = U.fechaColombia();
      const partidos = await window.ApiFutbol.traerPartidosDelDia(hoyLocal);
      
      if (this.intervalo) clearInterval(this.intervalo);
      const listaEl = document.getElementById('marcadores-hoy-lista');

      if (!partidos.length) {
        listaEl.innerHTML = '<div class="aviso" style="text-align:center">No hay partidos programados para hoy.</div>';
        return;
      }

      const html = partidos.map(p => {
        const L = window.FIXTURE.equipo(p.local);
        const V = window.FIXTURE.equipo(p.visitante);
        const hora = p.utc ? window.U.horaLocal(p.utc) : 'Hora TBD';

        const marcadorHtml = (p.estado === 'en_juego' || p.estado === 'finalizado')
          ? `<div class="mrc-score ${p.estado === 'en_juego' ? 'mrc-score--live' : ''}">${p.gl} - ${p.gv}</div>`
          : `<div class="mrc-time">${hora}</div>`;

        const estadoHtml = p.estado === 'en_juego'
          ? `<div class="mrc-status mrc-status--live">● ${p.minuto}'</div>`
          : p.estado === 'finalizado' ? `<div class="mrc-status">Finalizado</div>` : '';

        return `
          <div class="mrc-partido">
            <div class="mrc-equipo"><span class="mrc-bandera">${L.b}</span><span class="mrc-nombre">${L.n}</span></div>
            <div class="mrc-centro">${marcadorHtml}${estadoHtml}</div>
            <div class="mrc-equipo mrc-equipo--v"><span class="mrc-nombre">${V.n}</span><span class="mrc-bandera">${V.b}</span></div>
          </div>`;
      }).join('');

      listaEl.innerHTML = html;

    } catch (error) {
      console.error('Error al cargar marcadores de hoy:', error);
      document.getElementById('marcadores-hoy-lista').innerHTML = `<div class="aviso aviso--rojo">Error al cargar partidos: ${error.message}</div>`;
    }
  },

  destroy() {
    if (this.intervalo) {
      clearInterval(this.intervalo);
      this.intervalo = null;
    }
  }
};
