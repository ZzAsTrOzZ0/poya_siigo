/* ============================================================
   POLLA SIIGO 2026 — CORREOS (EmailJS)
   ------------------------------------------------------------
   Envía: bienvenida al registrarse, recordatorios de jornada y
   resumen de resultados. Usa EmailJS (plan gratuito 200/mes).
   Si EMAILJS no está configurado en config.js, las funciones
   no fallan: devuelven una "vista previa" del correo y la app
   lo informa con un toast (útil en modo demo).
   El SDK se carga bajo demanda solo cuando hace falta.
   ============================================================ */

const Email = {

  _sdk: null,

  configurado() {
    const e = CONFIG.EMAILJS;
    return !!(e && e.publicKey && e.serviceId);
  },

  /* Carga el SDK oficial @emailjs/browser solo la primera vez. */
  async _cargar() {
    if (this._sdk) return this._sdk;
    if (!this.configurado()) return null;
    await new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
      s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar EmailJS'));
      document.head.appendChild(s);
    });
    emailjs.init({ publicKey: CONFIG.EMAILJS.publicKey });
    this._sdk = emailjs;
    return this._sdk;
  },

  /* Envío genérico. Devuelve {enviado, preview}. */
  async _enviar(plantillaId, variables) {
    const preview = { plantilla: plantillaId || '(sin plantilla)', ...variables };
    if (!this.configurado() || !plantillaId) {
      console.info('✉ Vista previa de correo (EmailJS no configurado):', preview);
      return { enviado: false, preview };
    }
    const sdk = await this._cargar();
    await sdk.send(CONFIG.EMAILJS.serviceId, plantillaId, variables);
    return { enviado: true, preview };
  },

  /* --- Correo de bienvenida tras registrarse ----------------- */
  async bienvenida(usuario) {
    return this._enviar(CONFIG.EMAILJS.plantillas.bienvenida, {
      nombre: String(usuario?.nombre || ''),
      correo: String(usuario?.correo || ''),
      url: CONFIG.URL_PUBLICA
    });
  },

  /* --- Recordatorio de jornada (lo dispara el admin) ----------
     usuarios: lista de usuarios activos
     partidosTexto: bloque de texto con los partidos que cierran. Si es null, se genera.
     Se envía secuencialmente con una pequeña pausa para respetar
     los límites del plan gratuito. Devuelve conteo. ------------ */
  async recordatorio(usuarios, partidosTexto = null, alAvanzar) {
    let enviados = 0, simulados = 0;
    for (const u of usuarios) {
      const r = await this._enviar(CONFIG.EMAILJS.plantillas.recordatorio, {
        nombre: u.nombre, correo: u.correo,
        partidos: partidosTexto, url: CONFIG.URL_PUBLICA
      });
      r.enviado ? enviados++ : simulados++;
      alAvanzar && alAvanzar(enviados + simulados, usuarios.length);
      if (r.enviado) await new Promise(ok => setTimeout(ok, 700));
    }
    return { enviados, simulados };
  },

  /* --- Resumen de resultados y posición ----------------------- */
  async resumen(usuarios, resultadosTexto, filasTabla, alAvanzar) {
    let enviados = 0, simulados = 0;
    for (const u of usuarios) {
      const fila = filasTabla.find(f => f.uid === u.uid);
      const r = await this._enviar(CONFIG.EMAILJS.plantillas.resumen, {
        nombre: u.nombre, correo: u.correo,
        resultados: resultadosTexto,
        posicion: fila ? `${fila.pos}.º de ${filasTabla.length}` : '—',
        puntos: fila ? fila.pts : 0,
        url: CONFIG.URL_PUBLICA
      });
      r.enviado ? enviados++ : simulados++;
      alAvanzar && alAvanzar(enviados + simulados, usuarios.length);
      if (r.enviado) await new Promise(ok => setTimeout(ok, 700));
    }
    return { enviados, simulados };
  },

  /* Recordatorio personalizado: solo partidos que el usuario NO ha pronosticado. */
  async recordatorioPersonalizado(usuario, partidosPendientes) {
    if (!usuario?.correo || !partidosPendientes?.length) {
      return { enviado: false, preview: null };
    }
    const partidos = partidosPendientes.map(p => {
      const L = FIXTURE.equipo(p.local), V = FIXTURE.equipo(p.visitante);
      return `• ${L.n} vs ${V.n} — ${U.diaLocal(p.utc)} ${U.horaLocal(p.utc)}`;
    }).join('\n');
    return this._enviar(CONFIG.EMAILJS.plantillas.recordatorio, {
      nombre: String(usuario.nombre || ''),
      correo: String(usuario.correo || ''),
      partidos,
      url: CONFIG.URL_PUBLICA
    });
  },

  /* Texto listo para la plantilla de recordatorio: partidos que
     aún están abiertos en las próximas `horas`. */
  textoProximosPartidos(ajustes, resultados, horas = 30) {
    const limite = Date.now() + horas * 36e5;
    return FIXTURE.partidos
      .map(p => Puntos.conAjustes(p, ajustes))
      .filter(p => p.utc && U.abierto(p, resultados[p.id]) && new Date(p.utc) <= limite)
      .map(p => {
        const L = FIXTURE.equipo(p.local), V = FIXTURE.equipo(p.visitante);
        return `• ${L.n} vs ${V.n} — ${U.diaLocal(p.utc)} ${U.horaLocal(p.utc)}`;
      })
      .join('\n');
  }
};
window.Email = Email;
