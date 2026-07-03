/* ============================================================
   POLLA SIIGO 2026 — CAPA DE DATOS (Store)
   ------------------------------------------------------------
   Una sola interfaz, dos motores:
   • MODO 'demo'     → localStorage del navegador (probar ya).
   • MODO 'firebase' → Firebase Auth + Cloud Firestore (real).
   Las páginas solo hablan con `Store`, nunca con el motor.
   ============================================================ */
import { CONFIG } from './config.js';

const Store = (() => {

  /* =========================================================
     MOTOR DEMO (localStorage) — datos solo en este navegador
     ========================================================= */
  const LS = 'pollaSiigo';
  const _db = () => JSON.parse(localStorage.getItem(LS) || '{"usuarios":{},"predicciones":{},"resultados":{},"ajustes":{},"tabla":null}');
  const _save = d => localStorage.setItem(LS, JSON.stringify(d));
  const _sesKey = LS + 'Sesion';

  const demo = {
    async init() {},

    async registrar(datos) {
      const d = _db();
      const correo = String(datos.correo || '').toLowerCase().trim();
      if (Object.values(d.usuarios).some(u => u.correo === correo)) {
        throw new Error('Ya existe una cuenta con ese correo.');
      }
      const uid = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const esEmpleado = U.esCorreoEmpresa(correo);
      const u = {
        uid, correo,
        nombre: datos.nombre.trim(),
        area: datos.area.trim(),
        vinculo: esEmpleado ? 'empleado' : 'externo',
        moneda: datos.moneda,
        claveHash: await U.sha256(datos.clave),
        rol: U.esAdmin(correo) ? 'admin' : 'jugador',
        estado: (esEmpleado || CONFIG.APROBAR_EXTERNOS_AUTO || U.esAdmin(correo)) ? 'activo' : 'pendiente',
        pagado: false, campeon: null, creado: Date.now()
      };
      d.usuarios[uid] = u; _save(d);
      sessionStorage.setItem(_sesKey, uid);
      return { ...u };
    },

    async login(correo, clave) {
      correo = String(correo || '').toLowerCase().trim();
      clave = String(clave || '');
      if (!correo) throw new Error('Introduce un correo válido para iniciar sesión.');
      if (!clave) throw new Error('Introduce tu contraseña para iniciar sesión.');
      const d = _db();
      const u = Object.values(d.usuarios).find(x => x.correo === correo);
      if (!u || u.claveHash !== await U.sha256(clave)) throw new Error('Correo o contraseña incorrectos.');
      sessionStorage.setItem(_sesKey, u.uid);
      return { ...u };
    },

    async loginGoogle() {
      throw new Error('El inicio de sesión con Google solo está disponible en modo Firebase. Cambia CONFIG.MODO a "firebase" para usarlo.');
    },

    async logout() { sessionStorage.removeItem(_sesKey); },

    async sesion() {
      const uid = sessionStorage.getItem(_sesKey);
      return uid ? (_db().usuarios[uid] ? { ..._db().usuarios[uid] } : null) : null;
    },

    async usuarios() { return Object.values(_db().usuarios).map(u => ({ ...u, claveHash: undefined })); },

    async actualizarUsuario(uid, cambios) {
      const d = _db();
      if (!d.usuarios[uid]) throw new Error('No existe el participante.');
      Object.assign(d.usuarios[uid], cambios); _save(d);
    },

    async eliminarUsuario(uid) {
      const d = _db();
      delete d.usuarios[uid];
      Object.keys(d.predicciones).filter(k => k.startsWith(uid + '__')).forEach(k => delete d.predicciones[k]);
      _save(d);
    },

    async guardarPrediccion(uid, pid, gl, gv, extra = {}) {
      const d = _db();
      const pe = Puntos.conAjustes(FIXTURE.porId(pid) || {}, _db().ajustes);
      const tarde = U.fueraDeTiempo(pe);
      const doc = {
        uid, pid, gl, gv, t: Date.now(),
        aprobado: extra.aprobado ?? (tarde ? null : true),
        pendienteAprobacion: extra.pendienteAprobacion ?? (tarde ? true : false),
        fueraDeTiempo: tarde,
        ...extra
      };
      d.predicciones[`${uid}__${pid}`] = doc;
      _save(d);
      return doc;
    },

    async guardarPrediccionAdmin(uid, pid, gl, gv, extra = {}) {
      return this.guardarPrediccion(uid, pid, gl, gv, {
        aprobado: extra.aprobado ?? true,
        pendienteAprobacion: false,
        editadoPorAdmin: true,
        ...extra
      });
    },

    async aprobarPrediccion(uid, pid, aprobar, opts = {}) {
      const d = _db();
      const key = `${uid}__${pid}`;
      if (!d.predicciones[key]) {
        if (!aprobar) return false;
        throw new Error('No existe el pronóstico.');
      }
      d.predicciones[key].aprobado = !!aprobar;
      d.predicciones[key].pendienteAprobacion = false;
      d.predicciones[key].revisadoEn = Date.now();
      if (!aprobar) {
        d.predicciones[key].perdonadoPorAdmin = false;
        d.predicciones[key].fueraDeTiempo = true;
        d.predicciones[key].rechazadoEn = Date.now();
        if (opts.motivoRechazo) {
          d.predicciones[key].motivoRechazo = opts.motivoRechazo;
          if (opts.ptsDescontados != null) d.predicciones[key].ptsDescontados = opts.ptsDescontados;
        }
        if (d.usuarios[uid]) {
          d.usuarios[uid].intentosTrampa = (d.usuarios[uid].intentosTrampa || 0) + 1;
        }
      }
      _save(d);
      return true;
    },

    async perdonarPrediccion(uid, pid, datos = {}) {
      const d = _db();
      const key = `${uid}__${pid}`;
      const prev = d.predicciones[key] || {};
      d.predicciones[key] = {
        ...prev,
        uid, pid,
        gl: datos.gl ?? prev.gl ?? 0,
        gv: datos.gv ?? prev.gv ?? 0,
        t: datos.t ?? prev.t ?? Date.now(),
        aprobado: true,
        fueraDeTiempo: false,
        pendienteAprobacion: false,
        perdonadoPorAdmin: true,
        perdonadoEn: Date.now(),
        ...(datos.motivoPerdon ? { motivoPerdon: datos.motivoPerdon } : {})
      };
      _save(d);
    },

    async rechazarPrediccion(uid, pid, datos = {}) {
      const d = _db();
      const key = `${uid}__${pid}`;
      const prev = d.predicciones[key] || {};
      d.predicciones[key] = {
        ...prev,
        uid, pid,
        gl: datos.gl ?? prev.gl ?? 0,
        gv: datos.gv ?? prev.gv ?? 0,
        t: datos.t ?? prev.t ?? Date.now(),
        aprobado: false,
        fueraDeTiempo: true,
        pendienteAprobacion: false,
        perdonadoPorAdmin: false,
        rechazadoEn: Date.now(),
        ...(datos.motivoRechazo ? { motivoRechazo: datos.motivoRechazo } : {}),
        ...(datos.ptsDescontados != null ? { ptsDescontados: datos.ptsDescontados } : {})
      };
      if (d.usuarios[uid]) {
        d.usuarios[uid].intentosTrampa = (d.usuarios[uid].intentosTrampa || 0) + 1;
      }
      _save(d);
    },

    async marcarHistorialPerdonado(uid, pid, motivo = '') {
      const d = _db();
      if (!d.historial_predicciones) return;
      d.historial_predicciones.forEach(h => {
        if (h.uid === uid && h.pid === pid) {
          h.perdonadoPorAdmin = true;
          h.perdonadoEn = Date.now();
          if (motivo) h.motivoPerdon = motivo;
        }
      });
      _save(d);
    },

    async marcarHistorialRechazado(uid, pid, motivo = '') {
      const d = _db();
      if (!d.historial_predicciones) return;
      d.historial_predicciones.forEach(h => {
        if (h.uid === uid && h.pid === pid) {
          h.rechazadoPorAdmin = true;
          h.rechazadoEn = Date.now();
          h.perdonadoPorAdmin = false;
          if (motivo) h.motivoRechazo = motivo;
        }
      });
      _save(d);
    },

    async recalcularTardiosPartido(pids, resolverPartido) {
      if (!Array.isArray(pids) || !pids.length || typeof resolverPartido !== 'function') {
        return { corregidos: 0, siguenTarde: 0 };
      }
      const d = _db();
      let corregidos = 0, siguenTarde = 0;
      const todas = {};
      Object.values(d.predicciones || {}).forEach(p => {
        if (!p.uid) return;
        (todas[p.uid] = todas[p.uid] || {})[p.pid] = p;
      });

      for (const pid of pids) {
        const pe = resolverPartido(pid);
        if (!pe?.local) continue;
        for (const [uid, pMap] of Object.entries(todas)) {
          for (const id of pids) {
            const pr = pMap[id];
            if (!pr || pr.perdonadoPorAdmin) continue;
            const tardeAhora = U.fueraDeTiempo(pe, pr.t);
            const kick = U.inicioPartidoMs(pe);
            const guardadoAntesPitazo = !!(kick && pr.t && pr.t < kick);
            if (!tardeAhora && (pr.fueraDeTiempo || pr.pendienteAprobacion || pr.aprobado === null)) {
              Object.assign(pr, { fueraDeTiempo: false, pendienteAprobacion: false, aprobado: true });
              corregidos++;
            } else if (tardeAhora && !guardadoAntesPitazo && !pr.fueraDeTiempo && pr.aprobado !== false) {
              Object.assign(pr, { fueraDeTiempo: true, pendienteAprobacion: true, aprobado: null });
              siguenTarde++;
            } else if (guardadoAntesPitazo && (pr.pendienteAprobacion || pr.aprobado === null)) {
              Object.assign(pr, { fueraDeTiempo: false, pendienteAprobacion: false, aprobado: true });
              corregidos++;
            }
          }
        }
        (d.historial_predicciones || []).forEach(h => {
          if (!pids.includes(h.pid) || h.perdonadoPorAdmin) return;
          const tardeAhora = U.fueraDeTiempo(pe, h.t);
          if (h.fueraDeTiempo !== tardeAhora) h.fueraDeTiempo = tardeAhora;
        });
      }
      _save(d);
      return { corregidos, siguenTarde };
    },

    async registrarAccionAdmin(entrada) {
      const d = _db();
      if (!d.registro_admin) d.registro_admin = [];
      d.registro_admin.unshift({
        id: 'ra' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        t: Date.now(),
        ...entrada
      });
      if (d.registro_admin.length > 2000) d.registro_admin.length = 2000;
      _save(d);
    },

    async registroAdmin() {
      return (_db().registro_admin || []).slice().sort((a, b) => b.t - a.t);
    },

    async notificarUsuario(uid, aviso) {
      const d = _db();
      if (!d.avisos) d.avisos = [];
      d.avisos.push({
        id: 'av' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        uid,
        leido: false,
        t: Date.now(),
        ...aviso
      });
      _save(d);
    },

    async avisosUsuario(uid) {
      return (_db().avisos || []).filter(a => a.uid === uid && !a.leido).sort((a, b) => b.t - a.t);
    },

    async marcarAvisosLeidos(uid) {
      const d = _db();
      if (!d.avisos) return;
      d.avisos.forEach(a => { if (a.uid === uid) a.leido = true; });
      _save(d);
    },

    async prediccionesPendientes() {
      return Object.values(_db().predicciones).filter(p =>
        p.pendienteAprobacion === true || p.aprobado === null
      );
    },

    async eliminarPrediccion(uid, pid) {
      const d = _db();
      delete d.predicciones[`${uid}__${pid}`];
      _save(d);
    },

    async migrarPrediccionesSlot(origen, destino) {
      if (!origen || !destino || origen === destino) return { movidos: 0, preservados: 0 };
      const d = _db();
      const ajustes = d.ajustes || {};
      const resultados = d.resultados || {};
      const peDest = Puntos.conAjustes(FIXTURE.porId(destino) || {}, ajustes);
      const resDest = Puntos._resultadoCanonico(resultados, peDest, ajustes);
      let movidos = 0;
      let preservados = 0;
      Object.keys(d.predicciones || {}).forEach(key => {
        const pr = d.predicciones[key];
        if (!pr || pr.pid !== origen || pr.supersededBy) return;
        const uid = pr.uid;
        const destKey = `${uid}__${destino}`;
        const prev = d.predicciones[destKey];
        const elegir = Puntos.elegirPredMigracion(pr, prev, peDest, resDest, { preferOrigen: true });
        d.predicciones[destKey] = { ...elegir, pid: destino, pidCanon: destino };
        delete d.predicciones[key];
        movidos++;
        preservados++;
      });
      if (movidos) _save(d);
      return { movidos, preservados };
    },

    async migrarResultadoSlot(origen, destino) {
      if (!origen || !destino || origen === destino) return false;
      const d = _db();
      const src = d.resultados?.[origen];
      if (!src) return false;
      const dest = d.resultados?.[destino];
      if (dest?.estado === 'finalizado') return false;
      d.resultados[destino] = { ...src, t: Date.now() };
      delete d.resultados[origen];
      _save(d);
      return true;
    },

    _destPorClaveReparacion(ajustes) {
      const destPorClave = new Map();
      for (const p of FIXTURE.partidos) {
        const raw = { ...p, ...(ajustes[p.id] || {}) };
        if (!raw.local || !raw.visitante || raw.local === 'Por definir') continue;
        const clave = U.claveParejaKo(raw.local, raw.visitante);
        const oficial = U.idSlotKoOficial(raw.local, raw.visitante);
        if (U.esParejaFaseGrupos(raw.local, raw.visitante)) {
          if (p.fase === 'eliminatorias' && p.ronda !== '16avos' && !oficial) continue;
          const pg = U.partidoGruposPorPareja(raw.local, raw.visitante);
          if (pg) {
            destPorClave.set(clave, pg.id);
            continue;
          }
        }
        if (oficial) {
          destPorClave.set(clave, oficial);
          continue;
        }
        const prev = destPorClave.get(clave);
        if (!prev || (p.n || 999) < (FIXTURE.porId(prev)?.n || 999)) {
          destPorClave.set(clave, p.id);
        }
      }
      return destPorClave;
    },

    _destinoMigracionPid(pid, ajustes, resultados, destPorClave) {
      const clave = U.clavePartidoDesdePid(pid, ajustes);
      if (!clave.startsWith('id:')) {
        const dest = destPorClave.get(clave);
        return dest && dest !== pid ? dest : null;
      }
      const clOf = U.claveOficialPorSlotKo(pid);
      if (clOf) {
        const dest = destPorClave.get(clOf);
        if (dest && dest !== pid) return dest;
      }
      const resO = resultados?.[pid];
      if (!resO) return null;
      for (const [, dpid] of destPorClave) {
        if (dpid === pid) continue;
        const resD = resultados[dpid];
        if (!resD) continue;
        if (resO.gl === resD.gl && resO.gv === resD.gv
            && (resO.estado === resD.estado || resO.estado === 'finalizado')) {
          return dpid;
        }
      }
      return null;
    },

    async vaciarResultado(pid) {
      const d = _db();
      delete d.resultados[pid];
      _save(d);
    },

    async limpiarSlotsKoFantasma() {
      const ajustes = _db().ajustes || {};
      const resultados = _db().resultados || {};
      let limpiados = 0;
      for (const p of FIXTURE.partidos) {
        if (p.fase !== 'eliminatorias') continue;
        const raw = { ...p, ...(ajustes[p.id] || {}) };
        if (!raw.local || !raw.visitante || raw.local === 'Por definir') continue;

        const oficialId = U.idSlotKoOficial(raw.local, raw.visitante);
        if (oficialId === p.id) continue;
        if (oficialId && oficialId !== p.id) {
          const destRaw = { ...FIXTURE.porId(oficialId), ...(ajustes[oficialId] || {}) };
          await this.migrarPrediccionesSlot(p.id, oficialId);
          await this.migrarResultadoSlot(p.id, oficialId);
          const patch = U.patchMigracionKoOficial(p.id, raw, oficialId, destRaw);
          if (Object.keys(patch).length) {
            await this.guardarAjuste(oficialId, patch);
            ajustes[oficialId] = { ...(ajustes[oficialId] || {}), ...patch };
          }
          await this.guardarAjuste(p.id, { local: null, visitante: null, utc: null, horaOk: false });
          ajustes[p.id] = { ...(ajustes[p.id] || {}), local: null, visitante: null, utc: null, horaOk: false };
          if (resultados[p.id]) await this.vaciarResultado(p.id);
          limpiados++;
          continue;
        }

        if (!U.esParejaFaseGrupos(raw.local, raw.visitante)) continue;
        const pg = U.partidoGruposPorPareja(raw.local, raw.visitante);
        if (pg) {
          await this.migrarPrediccionesSlot(p.id, pg.id);
          await this.migrarResultadoSlot(p.id, pg.id);
        }
        await this.guardarAjuste(p.id, { local: null, visitante: null, utc: null, horaOk: false });
        ajustes[p.id] = { ...(ajustes[p.id] || {}), local: null, visitante: null, utc: null, horaOk: false };
        if (resultados[p.id]) await this.vaciarResultado(p.id);
        limpiados++;
      }
      if (limpiados && typeof Puntos !== 'undefined') Puntos.invalidarAjustes?.(ajustes);
      return { limpiados };
    },

    async repararPuntosTabla(ajustesIn = null) {
      const ajustes = ajustesIn || _db().ajustes || {};
      let restauradosHist = 0;
      try {
        const rh = await this.recuperarPrediccionesDesdeHistorial();
        restauradosHist = rh?.restaurados || 0;
      } catch (e) {
        console.warn('repararPuntosTabla recuperar historial:', e);
      }
      const resultados = _db().resultados || {};
      const destPorClave = this._destPorClaveReparacion(ajustes);

      const pidsOrigen = new Set();
      Object.values(_db().predicciones || {}).forEach(pr => {
        if (pr?.pid) pidsOrigen.add(pr.pid);
      });
      Object.keys(resultados).forEach(pid => pidsOrigen.add(pid));

      let migrados = 0;
      for (const pid of pidsOrigen) {
        const dest = this._destinoMigracionPid(pid, ajustes, resultados, destPorClave);
        if (!dest) continue;
        const r = await this.migrarPrediccionesSlot(pid, dest);
        migrados += r.movidos || 0;
        await this.migrarResultadoSlot(pid, dest);
      }

      let limpiados = 0;
      try {
        const fant = await this.limpiarSlotsKoFantasma();
        limpiados = fant?.limpiados || 0;
      } catch (e) {
        console.warn('limpiarSlotsKoFantasma:', e);
      }

      let rehabilitados = 0;
      const d = _db();
      Object.values(d.predicciones || {}).forEach(pr => {
        if (!pr?.uid || !pr?.pid) return;
        if (pr.aprobado === false || pr.perdonadoPorAdmin) return;
        if (pr.aprobado === true && !pr.pendienteAprobacion) return;
        const pe = Puntos.conAjustes(FIXTURE.porId(pr.pid) || {}, ajustes);
        if (!pe?.local || !pe?.visitante) return;
        if (pr.t && U.fueraDeTiempo(pe, pr.t)) return;
        pr.fueraDeTiempo = false;
        pr.pendienteAprobacion = false;
        pr.aprobado = true;
        rehabilitados++;
      });
      if (rehabilitados) _save(d);
      let archivadas = 0;
      try {
        const limp = await this.limpiarPrediccionesSuperseded();
        archivadas = limp?.eliminados || 0;
      } catch (e) {
        console.warn('limpiarPrediccionesSuperseded:', e);
      }
      return { migrados, rehabilitados, limpiados, huerfanos: 0, restauradosHist, archivadas };
    },

    async recuperarPrediccionesDesdeHistorial(uidFiltro = null) {
      const ajustes = _db().ajustes || {};
      const resultados = _db().resultados || {};
      const destPorClave = this._destPorClaveReparacion(ajustes);
      const todas = await this.todasPredicciones();
      const historial = (_db().historial_predicciones || [])
        .filter(h => !uidFiltro || h.uid === uidFiltro);
      const ultimoPorDest = new Map();
      historial.forEach(h => {
        if (h.accion === 'eliminar' || h.gl == null || h.gv == null) return;
        const dest = this._destinoMigracionPid(h.pid, ajustes, resultados, destPorClave) || h.pid;
        const key = `${h.uid}|${dest}`;
        const prev = ultimoPorDest.get(key);
        if (!prev || (h.t || 0) >= (prev.t || 0)) ultimoPorDest.set(key, { ...h, destPid: dest });
      });
      const d = _db();
      let restaurados = 0;
      for (const h of ultimoPorDest.values()) {
        const pe = Puntos.conAjustes(FIXTURE.porId(h.destPid) || {}, ajustes);
        const preds = todas[h.uid] || {};
        if (pe?.local && Puntos._predEnPartido(preds, pe, ajustes, null, resultados)) continue;
        const key = `${h.uid}__${h.destPid}`;
        if (d.predicciones[key]?.gl != null
            && Puntos._predEnPartido({ [h.destPid]: d.predicciones[key] }, pe, ajustes, null, resultados)) {
          continue;
        }
        d.predicciones[key] = {
          uid: h.uid,
          pid: h.destPid,
          gl: h.gl,
          gv: h.gv,
          t: h.t || Date.now(),
          aprobado: h.rechazadoPorAdmin ? false : true,
          pendienteAprobacion: false,
          fueraDeTiempo: !!(h.fueraDeTiempo && !h.perdonadoPorAdmin),
          perdonadoPorAdmin: !!h.perdonadoPorAdmin,
          recuperadoDesdeHistorial: true,
          recuperadoEn: Date.now()
        };
        restaurados++;
      }
      if (restaurados) _save(d);
      return { restaurados };
    },

    async restaurarTablaEmergencia(ajustesIn = null) {
      const rep = await this.repararPuntosTabla(ajustesIn);
      return rep;
    },

    async predicciones(uid) {
      const d = _db(), out = {};
      Object.values(d.predicciones).filter(p => p.uid === uid && !p.supersededBy).forEach(p => {
        const canon = p.pidCanon || p.pid;
        const prev = out[canon];
        if (!prev || (p.t || 0) >= (prev.t || 0)) out[canon] = { ...p, pid: canon };
      });
      return out;
    },

    async prediccionesPartido(pid) {
      return Object.values(_db().predicciones).filter(p => p.pid === pid && !p.supersededBy);
    },

    async todasPredicciones() {
      const out = {};
      Object.values(_db().predicciones).forEach(p => {
        if (!p.uid || !p.pid || p.supersededBy) return;
        const canon = p.pidCanon || p.pid;
        const prev = out[p.uid]?.[canon];
        if (!prev || (p.t || 0) >= (prev.t || 0)) {
          (out[p.uid] = out[p.uid] || {})[canon] = { ...p, pid: canon };
        }
      });
      return out;
    },

    async resultados() { return _db().resultados; },

    async guardarResultado(pid, res) {
      const d = _db();
      d.resultados[pid] = { ...d.resultados[pid], ...res, t: Date.now() }; _save(d);
    },

    async ajustes() { return _db().ajustes; },

    async guardarAjuste(pid, aj) {
      const d = _db();
      const prev = d.ajustes[pid] || {};
      const merged = { ...prev, ...aj };
      if (merged.utc || merged.fecha) {
        const cierre = U.calcCierreMs(merged);
        if (cierre != null) merged.cierreMs = cierre;
      }
      d.ajustes[pid] = merged;
      _save(d);
    },

    async tablaPublicada() { return _db().tabla; },
    async publicarTabla(tabla, meta = {}) {
      const d = _db();
      d.tabla = { filas: tabla, t: Date.now(), ajustesFp: meta.ajustesFp || '' };
      _save(d);
    },

    enCambios(cb) {
      window.addEventListener('storage', e => { if (e.key === LS) cb(); });
      return () => {};
    },

    enTablaPublicada(cb) {
      cb(_db().tabla);
      return () => {};
    },

    async reclamarSincronizacion() { return true; },

    async registrarIntentoTrampa(uid, nombre, pid, gl, gv, motivo) {
      const d = _db();
      if (!d.intentos_trampa) d.intentos_trampa = [];
      const id = 'tr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      d.intentos_trampa.push({ id, uid, nombre, pid, gl, gv, motivo, t: Date.now() });
      _save(d);
    },

    async intentosTrampa() {
      return (_db().intentos_trampa || []).slice().sort((a, b) => b.t - a.t);
    },

    async eliminarIntentoTrampa(id) {
      const d = _db();
      if (!d.intentos_trampa) return;
      d.intentos_trampa = d.intentos_trampa.filter(it => it.id !== id);
      _save(d);
    },

    async registrarHistorial(uid, nombre, pid, gl, gv, glPrev, gvPrev, extra = {}) {
      const d = _db();
      if (!d.historial_predicciones) d.historial_predicciones = [];
      const id = 'hp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const accion = extra.accion
        || (gl == null && gv == null && glPrev != null ? 'eliminar' : glPrev != null ? 'editar' : 'crear');
      d.historial_predicciones.push({
        id, uid, nombre, pid,
        gl: gl ?? null, gv: gv ?? null,
        glPrev: glPrev ?? null, gvPrev: gvPrev ?? null,
        accion,
        t: extra.t || Date.now(),
        ...extra
      });
      if (d.historial_predicciones.length > 5000) {
        d.historial_predicciones = d.historial_predicciones.slice(-5000);
      }
      _save(d);
      return id;
    },

    async historialPredicciones(limite = 5000) {
      return (_db().historial_predicciones || [])
        .slice()
        .sort((a, b) => b.t - a.t)
        .slice(0, limite);
    },

    async historialPrediccionesUsuario(uid, limite = 800) {
      if (!uid) return [];
      return (_db().historial_predicciones || [])
        .filter(h => h.uid === uid)
        .sort((a, b) => (b.t || 0) - (a.t || 0))
        .slice(0, limite);
    },

    async limpiarPrediccionesSuperseded() {
      const d = _db();
      let eliminados = 0;
      Object.keys(d.predicciones || {}).forEach(key => {
        if (d.predicciones[key]?.supersededBy) {
          delete d.predicciones[key];
          eliminados++;
        }
      });
      if (eliminados) _save(d);
      return { eliminados };
    },

    async eliminarEntradaHistorial(id) {
      /* Obsoleto: el historial es append-only. Marca eliminación con registrarHistorial. */
      console.warn('eliminarEntradaHistorial: no se borra historial (auditoría).');
    },

    async eliminarHistorialUsuarioPartido(uid, pid) {
      /* Obsoleto: conservar historial para auditoría. */
      console.warn('eliminarHistorialUsuarioPartido: no se borra historial (auditoría).');
    },

    async puntosManuales() {
      const d = _db();
      return d.puntos_manuales || [];
    },

    async guardarPuntoManual(uid, pid, pts, razon) {
      const d = _db();
      if (!d.puntos_manuales) d.puntos_manuales = [];
      const idx = d.puntos_manuales.findIndex(pm => pm.uid === uid && pm.pid === pid);
      const entrada = { uid, pid, pts: Number(pts), razon: razon || '', t: Date.now() };
      if (idx >= 0) d.puntos_manuales[idx] = entrada;
      else d.puntos_manuales.push(entrada);
      _save(d);
    },

    async quitarPuntoManual(uid, pid) {
      const d = _db();
      if (!d.puntos_manuales) return;
      d.puntos_manuales = d.puntos_manuales.filter(pm => !(pm.uid === uid && pm.pid === pid));
      _save(d);
    },

    async enviarMensajeChat(partidoId, mensaje) {
      const d = _db();
      if (!d.chats) d.chats = {};
      if (!d.chats[partidoId]) d.chats[partidoId] = [];
      const id = 'msg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      d.chats[partidoId].push({ id, ...mensaje, timestamp: Date.now() });
      _save(d);
    },

    escucharChat(partidoId, callback) {
      const runCallback = () => {
        const d = _db();
        const mensajes = (d.chats && d.chats[partidoId]) ? d.chats[partidoId] : [];
        const changes = mensajes.map(m => ({ type: 'added', doc: m }));
        callback(changes, true); // En modo demo, cada cambio es una recarga total
      };
      runCallback();
      
      const listener = (e) => {
        if (e.key === LS) {
          runCallback();
        }
      };
      window.addEventListener('storage', listener);
      return () => window.removeEventListener('storage', listener);
    },

    async toggleReaccionChat(partidoId, mensajeId, emoji) {
      const d = _db();
      const yo = await this.sesion();
      if (!yo || !d.chats || !d.chats[partidoId]) return;

      const msgIndex = d.chats[partidoId].findIndex(m => m.id === mensajeId);
      if (msgIndex === -1) return;

      const msg = d.chats[partidoId][msgIndex];
      if (!msg.reacciones) msg.reacciones = {};
      if (!msg.reacciones[emoji]) msg.reacciones[emoji] = [];

      const userIndex = msg.reacciones[emoji].indexOf(yo.uid);
      if (userIndex > -1) {
        msg.reacciones[emoji].splice(userIndex, 1);
        if (msg.reacciones[emoji].length === 0) delete msg.reacciones[emoji];
      } else {
        msg.reacciones[emoji].push(yo.uid);
      }
      
      d.chats[partidoId][msgIndex] = msg;
      _save(d);
    },

    async cargarEjemplo() {
      const d = _db();
      const gente = [
        ['Laura Méndez', 'Comercial', 'COP'], ['Carlos Pérez', 'Soporte IT', 'COP'],
        ['Ana Sofía Ruiz', 'Producto', 'MXN'], ['Jorge Castillo', 'Finanzas', 'COP'],
        ['Valentina Gómez', 'Marketing', 'CLP'], ['Tío Hernando', 'Invitado', 'COP'],
        ['Diego Martínez', 'Desarrollo', 'UYU'], ['Paola Sierra', 'Talento Humano', 'VES']
      ];
      for (const [nombre, area, moneda] of gente) {
        const correo = nombre.toLowerCase().replace(/[^a-z]+/g, '.') + (area === 'Invitado' ? '@gmail.com' : '@siigo.com');
        if (Object.values(d.usuarios).some(u => u.correo === correo)) continue;
        const uid = 'demo' + Math.random().toString(36).slice(2, 8);
        d.usuarios[uid] = {
          uid, correo, nombre, area, moneda,
          vinculo: area === 'Invitado' ? 'externo' : 'empleado',
          claveHash: 'x', rol: 'jugador', estado: 'activo',
          pagado: Math.random() > 0.4,
          campeon: ['ARG', 'BRA', 'ESP', 'FRA', 'COL', 'ENG'][Math.floor(Math.random() * 6)],
          creado: Date.now() - Math.floor(Math.random() * 864e5)
        };
        FIXTURE.partidos.filter(p => p.fase === 'grupos').forEach(p => {
          if (Math.random() < 0.85) {
            d.predicciones[`${uid}__${p.id}`] = {
              uid, pid: p.id,
              gl: Math.floor(Math.random() * 4), gv: Math.floor(Math.random() * 3), t: Date.now()
            };
          }
        });
      }
      _save(d);
    },

    /* ---- SALAS PRIVADAS (demo) - Funciones simplificadas ---- */
    async salaPorId(salaId) {
      if (!salaId || salaId === 'siigo') {
        return { salaId: 'siigo', nombre: 'Polla Siigo 2026', codigo: null, adminUid: null };
      }
      return null;
    },

    async usuariosSala(salaId) {
      if (!salaId || salaId === 'siigo') return this.usuarios();
      return [];
    },

    async guardarPrediccionSala(uid, pid, gl, gv) {
      await this.guardarPrediccion(uid, pid, gl, gv);
    },

    async prediccionesSala(uid) {
      return this.predicciones(uid);
    },

    async todasPrediccionesSala() {
      return this.todasPredicciones();
    },

    async cerrarPartidosVencidos(partidos, resultados = {}) {
      let cerrados = 0;
      const ahora = Date.now();
      const ventanaIniciando = 3 * 60 * 60 * 1000;
      for (const p of partidos) {
        if (!p.local || !p.visitante) continue;
        const res = resultados[p.id] || {};
        if (res.estado === 'en_juego' || res.estado === 'finalizado') continue;
        if (!U.fueraDeTiempo(p)) continue;
        const kickoff = U.inicioPartidoMs(p);
        if (kickoff && ahora > kickoff + ventanaIniciando) continue;
        if (res.estado !== 'iniciando') {
          await this.guardarResultado(p.id, { ...res, estado: 'iniciando' });
          cerrados++;
        }
      }
      return cerrados;
    },
  };

  /* =========================================================
     MOTOR FIREBASE (producción)
     ========================================================= */
  let fb = null, fdb = null, _perfilCache = null, _initPromise = null;
  let _cacheTodasPred = null, _cacheTodasPredTs = 0;
  let _cacheResultados = null, _cacheAjustes = null, _cacheAjustesTs = 0;
  let _cachePredUid = null, _cachePredData = null, _cachePredTs = 0;
  let _cachePub = null, _cachePubTs = 0;
  const CACHE_TODAS_PRED_MS = 90000;
  const CACHE_AJUSTES_MS = 600000;
  const CACHE_PRED_MS = 60000;
  const CACHE_PUB_MS = 20000;

  function _cargarScript(src) {
    return new Promise((ok, err) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = () => err(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  const firebaseStore = {
    async init() {
      if (_initPromise) return _initPromise;
      _initPromise = (async () => {
        const v = '10.12.2';
        await _cargarScript(`https://www.gstatic.com/firebasejs/${v}/firebase-app-compat.js`);
        await _cargarScript(`https://www.gstatic.com/firebasejs/${v}/firebase-auth-compat.js`);
        await _cargarScript(`https://www.gstatic.com/firebasejs/${v}/firebase-firestore-compat.js`);
        fb = window.firebase;
        if (!fb.apps?.length) fb.initializeApp(CONFIG.FIREBASE);
        fdb = fb.firestore();
        await new Promise(ok => { const off = fb.auth().onAuthStateChanged(() => { off(); ok(); }); });
      })();
      return _initPromise;
    },

    async _ensureFirebase() {
      if (fdb) return;
      await this.init();
      if (!fdb) throw new Error('Firebase no está listo. Recarga la página (Ctrl+F5).');
    },

    _invalidarCacheTodasPred() {
      _cacheTodasPred = null;
      _cacheTodasPredTs = 0;
    },

    _invalidarCachePred(uid) {
      if (!uid || _cachePredUid === uid) {
        _cachePredUid = null;
        _cachePredData = null;
        _cachePredTs = 0;
      }
    },

    async registrar(datos) {
      const correo = String(datos.correo || '').toLowerCase().trim();
      const clave = String(datos.clave || '');
      if (!correo) throw new Error('Introduce un correo válido para registrarte.');
      if (!clave) throw new Error('Introduce una contraseña para registrarte.');
      let cred;
      try {
        cred = await fb.auth().createUserWithEmailAndPassword(correo, clave);
      } catch (err) {
        if (err.code === 'auth/email-already-in-use') {
          throw new Error('Este correo ya está registrado. Usa Entrar o Iniciar sesión con Google si ya tenías cuenta.');
        }
        console.error("🔥 Error Firebase (Registro):", err);
        alert("Fallo en Firebase: " + err.message);
        throw err;
      }
      try { await cred.user.sendEmailVerification(); } catch (e) { /* opcional */ }
      const esEmpleado = U.esCorreoEmpresa(correo);
      const perfil = {
        uid: cred.user.uid, correo,
        nombre: datos.nombre.trim(), area: datos.area.trim(),
        vinculo: esEmpleado ? 'empleado' : 'externo',
        moneda: datos.moneda,
        rol: U.esAdmin(correo) ? 'admin' : 'jugador',
        estado: (esEmpleado || CONFIG.APROBAR_EXTERNOS_AUTO || U.esAdmin(correo)) ? 'activo' : 'pendiente',
        pagado: false, campeon: null, creado: Date.now()
      };
      try {
        await fdb.collection('usuarios').doc(perfil.uid).set(perfil);
      } catch (err) {
        console.error("🔥 Error al guardar perfil de registro:", err);
        alert("Tu cuenta se creó pero la base de datos rechazó tu perfil: " + err.message);
        throw err;
      }
      _perfilCache = perfil;
      return { ...perfil };
    },

    async login(correo, clave) {
      correo = String(correo || '').toLowerCase().trim();
      clave = String(clave || '');
      if (!correo) throw new Error('Introduce un correo válido para iniciar sesión.');
      if (!clave) throw new Error('Introduce tu contraseña para iniciar sesión.');
      try {
        const cred = await fb.auth().signInWithEmailAndPassword(correo, clave);
        const doc = await fdb.collection('usuarios').doc(cred.user.uid).get();
        if (!doc.exists) throw new Error('Tu cuenta no tiene perfil. Contacta al administrador.');
        _perfilCache = doc.data();
        return { ..._perfilCache };
      } catch (err) {
        console.error("🔥 Error Firebase (Login):", err);
        alert("Fallo en Firebase: " + err.message);
        throw err;
      }
    },

    async loginGoogle() {
      const provider = new fb.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      let cred;
      try {
        cred = await fb.auth().signInWithPopup(provider);
      } catch (err) {
        if (err.code === 'auth/account-exists-with-different-credential') {
          throw new Error('Ya existe una cuenta con este correo. Usa tu contraseña o contacta a Soporte IT.');
        }
        if (err.code === 'auth/operation-not-allowed') {
          throw new Error('El inicio de sesión con Google no está habilitado en la consola de Firebase.');
        }
        if (err.code === 'auth/popup-closed-by-user') {
          throw new Error('Cancelaste el inicio de sesión con Google (ventana cerrada).');
        }
        console.error("🔥 Error Firebase (Google):", err);
        alert("Fallo en Firebase: " + err.message);
        throw err;
      }
      const correo = String(cred?.user?.email || '').toLowerCase().trim();
      if (!correo) throw new Error('No se pudo obtener el correo desde Google. Intenta con otro método.');
      const docRef = fdb.collection('usuarios').doc(cred.user.uid);
      const perfilSnap = await docRef.get();
      if (perfilSnap.exists) {
        _perfilCache = perfilSnap.data();
        return { ..._perfilCache };
      }
      const nombre = cred.user.displayName || correo.split('@')[0];
      const esEmpleado = U.esCorreoEmpresa(correo);
      const perfil = {
        uid: cred.user.uid, correo, nombre, area: 'Google',
        vinculo: esEmpleado ? 'empleado' : 'externo',
        moneda: 'COP', rol: U.esAdmin(correo) ? 'admin' : 'jugador',
        estado: (esEmpleado || CONFIG.APROBAR_EXTERNOS_AUTO || U.esAdmin(correo)) ? 'activo' : 'pendiente',
        pagado: false, campeon: null, creado: Date.now()
      };
      try { await docRef.set(perfil); } catch (err) {
        console.error("🔥 Error al guardar perfil de Google:", err);
        alert("Google te dejó entrar, pero Firestore rechazó guardar tu perfil.\n\nError: " + err.message);
        throw err;
      }
      _perfilCache = perfil;
      return { ...perfil };
    },

    async _syncAdminRol(perfil) {
      if (!perfil?.uid || !U.esAdmin(perfil.correo) || perfil.rol === 'admin') return perfil;
      try {
        await fdb.collection('usuarios').doc(perfil.uid).update({ rol: 'admin' });
        perfil.rol = 'admin';
      } catch (e) {
        console.warn('No se pudo sincronizar rol admin:', e);
      }
      return perfil;
    },

    async logout() { _perfilCache = null; await fb.auth().signOut(); },

    async sesion() {
      return new Promise((resolve) => {
        const unsubscribe = fb.auth().onAuthStateChanged(async (u) => {
          unsubscribe();
          if (!u) return resolve(null);
          if (_perfilCache && _perfilCache.uid === u.uid) {
            await this._syncAdminRol(_perfilCache);
            return resolve({ ..._perfilCache });
          }
          try {
            const doc = await fdb.collection('usuarios').doc(u.uid).get();
            _perfilCache = doc.exists ? doc.data() : null;
            if (_perfilCache) await this._syncAdminRol(_perfilCache);
            resolve(_perfilCache ? { ..._perfilCache } : null);
          } catch (err) {
            console.error("🔥 Error Firebase (sesion):", err);
            alert("La base de datos bloqueó tu sesión al cambiar de pestaña.\n\nFalta publicar las Reglas de Seguridad en la consola de Firebase.");
            resolve(null);
          }
        });
      });
    },

    async usuarios() {
      try {
        const snap = await fdb.collection('usuarios').get();
        return snap.docs.map(d => d.data());
      } catch (err) {
        console.error("🔥 Error Firebase (Cargar Usuarios):", err);
        if (err.code === 'permission-denied') {
          alert("Acceso denegado por la base de datos.\n\nFalta crear el documento 'admins' en Firestore o las reglas de seguridad no están publicadas.");
        } else { alert("Error al cargar la lista: " + err.message); }
        throw err;
      }
    },

    async actualizarUsuario(uid, cambios) {
      try {
        await fdb.collection('usuarios').doc(uid).update(cambios);
        if (_perfilCache && _perfilCache.uid === uid) Object.assign(_perfilCache, cambios);
      } catch (err) {
        console.error("🔥 Error Firebase (actualizarUsuario):", err);
        alert("La base de datos bloqueó la acción. Si estás eligiendo a tu campeón, revisa que la fecha límite no haya pasado o contacta al administrador.\n\nError: " + err.message);
        throw err;
      }
    },

    async eliminarUsuario(uid) {
      await fdb.collection('usuarios').doc(uid).delete();
      const preds = await fdb.collection('predicciones').where('uid', '==', uid).get();
      const lote = fdb.batch(); preds.docs.forEach(d => lote.delete(d.ref)); await lote.commit();
    },

    async guardarPrediccion(uid, pid, gl, gv, extra = {}) {
      try {
        const pe = Puntos.conAjustes(FIXTURE.porId(pid) || {}, (await this.ajustes()));
        const tarde = U.fueraDeTiempo(pe);
        const doc = {
          uid, pid, gl, gv, t: Date.now(),
          aprobado: extra.aprobado ?? (tarde ? null : true),
          pendienteAprobacion: extra.pendienteAprobacion ?? (tarde ? true : false),
          fueraDeTiempo: tarde,
          ...extra
        };
        await fdb.collection('predicciones').doc(`${uid}__${pid}`).set(doc);
        this._invalidarCacheTodasPred();
        this._invalidarCachePred(uid);
        return doc;
      } catch (err) {
        console.error("🔥 Error Firebase (guardarPrediccion):", err);
        throw new Error("No se pudo guardar. El partido ya cerró o no tienes permiso.");
      }
    },

    async guardarPrediccionAdmin(uid, pid, gl, gv, extra = {}) {
      const doc = {
        uid, pid, gl, gv, t: Date.now(),
        aprobado: extra.aprobado ?? true,
        pendienteAprobacion: false,
        editadoPorAdmin: true,
        fueraDeTiempo: extra.fueraDeTiempo ?? false,
        ...extra
      };
      await fdb.collection('predicciones').doc(`${uid}__${pid}`).set(doc, { merge: true });
      return doc;
    },

    async aprobarPrediccion(uid, pid, aprobar, opts = {}) {
      const predRef = fdb.collection('predicciones').doc(`${uid}__${pid}`);
      const snap = await predRef.get();
      if (!snap.exists) {
        if (!aprobar) return false;
        throw new Error(`No existe el pronóstico (${pid}).`);
      }
      const patch = {
        aprobado: !!aprobar,
        pendienteAprobacion: false,
        revisadoEn: Date.now(),
        ...(!aprobar ? {
          perdonadoPorAdmin: false,
          fueraDeTiempo: true,
          rechazadoEn: Date.now(),
          ...(opts.motivoRechazo ? {
            motivoRechazo: opts.motivoRechazo,
            ...(opts.ptsDescontados != null ? { ptsDescontados: opts.ptsDescontados } : {})
          } : {})
        } : {})
      };
      await predRef.update(patch);

      if (!aprobar) {
        const userRef = fdb.collection('usuarios').doc(uid);
        const FieldValue = fb.firestore.FieldValue;
        try {
          await userRef.update({ intentosTrampa: FieldValue.increment(1) });
        } catch (e) {
          console.warn(`No se pudo incrementar el contador de trampas para el usuario ${uid}`, e);
        }
      }
      return true;
    },

    async perdonarPrediccion(uid, pid, datos = {}) {
      const predRef = fdb.collection('predicciones').doc(`${uid}__${pid}`);
      const snap = await predRef.get();
      const prev = snap.exists ? snap.data() : {};
      await predRef.set({
        uid, pid,
        gl: datos.gl ?? prev.gl ?? 0,
        gv: datos.gv ?? prev.gv ?? 0,
        t: datos.t ?? prev.t ?? Date.now(),
        aprobado: true,
        fueraDeTiempo: false,
        pendienteAprobacion: false,
        perdonadoPorAdmin: true,
        perdonadoEn: Date.now(),
        ...(datos.motivoPerdon ? { motivoPerdon: datos.motivoPerdon } : {})
      }, { merge: true });
    },

    async rechazarPrediccion(uid, pid, datos = {}) {
      const predRef = fdb.collection('predicciones').doc(`${uid}__${pid}`);
      const snap = await predRef.get();
      const prev = snap.exists ? snap.data() : {};
      await predRef.set({
        uid, pid,
        gl: datos.gl ?? prev.gl ?? 0,
        gv: datos.gv ?? prev.gv ?? 0,
        t: datos.t ?? prev.t ?? Date.now(),
        aprobado: false,
        fueraDeTiempo: true,
        pendienteAprobacion: false,
        perdonadoPorAdmin: false,
        rechazadoEn: Date.now(),
        ...(datos.motivoRechazo ? { motivoRechazo: datos.motivoRechazo } : {}),
        ...(datos.ptsDescontados != null ? { ptsDescontados: datos.ptsDescontados } : {})
      }, { merge: true });
      const userRef = fdb.collection('usuarios').doc(uid);
      const FieldValue = fb.firestore.FieldValue;
      try {
        await userRef.update({ intentosTrampa: FieldValue.increment(1) });
      } catch (e) {
        console.warn(`No se pudo incrementar el contador de trampas para el usuario ${uid}`, e);
      }
    },

    async marcarHistorialPerdonado(uid, pid, motivo = '') {
      const snap = await fdb.collection('historial_predicciones').where('uid', '==', uid).get();
      const lote = fdb.batch();
      let n = 0;
      const patch = { perdonadoPorAdmin: true, perdonadoEn: Date.now() };
      if (motivo) patch.motivoPerdon = motivo;
      snap.docs.forEach(d => {
        if (d.data().pid === pid) {
          lote.update(d.ref, patch);
          n++;
        }
      });
      if (n) await lote.commit();
    },

    async marcarHistorialRechazado(uid, pid, motivo = '') {
      const snap = await fdb.collection('historial_predicciones').where('uid', '==', uid).get();
      const lote = fdb.batch();
      let n = 0;
      const patch = {
        rechazadoPorAdmin: true,
        rechazadoEn: Date.now(),
        perdonadoPorAdmin: false
      };
      if (motivo) patch.motivoRechazo = motivo;
      snap.docs.forEach(d => {
        if (d.data().pid === pid) {
          lote.update(d.ref, patch);
          n++;
        }
      });
      if (n) await lote.commit();
    },

    async recalcularTardiosPartido(pids, resolverPartido) {
      if (!Array.isArray(pids) || !pids.length || typeof resolverPartido !== 'function') {
        return { corregidos: 0, siguenTarde: 0 };
      }
      let corregidos = 0, siguenTarde = 0;
      const todas = await this.todasPredicciones();
      const lotePred = fdb.batch();
      let nPred = 0;

      for (const pid of pids) {
        const pe = resolverPartido(pid);
        if (!pe?.local) continue;

        for (const [uid, pMap] of Object.entries(todas)) {
          for (const id of pids) {
            const pr = pMap[id];
            if (!pr || pr.perdonadoPorAdmin) continue;
            const tardeAhora = U.fueraDeTiempo(pe, pr.t);
            const kick = U.inicioPartidoMs(pe);
            const guardadoAntesPitazo = !!(kick && pr.t && pr.t < kick);
            const ref = fdb.collection('predicciones').doc(`${uid}__${id}`);
            if (!tardeAhora && (pr.fueraDeTiempo || pr.pendienteAprobacion || pr.aprobado === null)) {
              lotePred.update(ref, { fueraDeTiempo: false, pendienteAprobacion: false, aprobado: true });
              nPred++; corregidos++;
            } else if (tardeAhora && !guardadoAntesPitazo && !pr.fueraDeTiempo && pr.aprobado !== false) {
              lotePred.update(ref, { fueraDeTiempo: true, pendienteAprobacion: true, aprobado: null });
              nPred++; siguenTarde++;
            } else if (guardadoAntesPitazo && (pr.pendienteAprobacion || pr.aprobado === null)) {
              lotePred.update(ref, { fueraDeTiempo: false, pendienteAprobacion: false, aprobado: true });
              nPred++; corregidos++;
            }
          }
        }

        const histSnap = await fdb.collection('historial_predicciones').where('pid', '==', pid).get();
        const loteHist = fdb.batch();
        let nHist = 0;
        histSnap.docs.forEach(d => {
          const h = d.data();
          if (h.perdonadoPorAdmin) return;
          const tardeAhora = U.fueraDeTiempo(pe, h.t);
          if (h.fueraDeTiempo !== tardeAhora) {
            loteHist.update(d.ref, { fueraDeTiempo: tardeAhora });
            nHist++;
          }
        });
        if (nHist) await loteHist.commit();
      }
      if (nPred) await lotePred.commit();
      return { corregidos, siguenTarde };
    },

    async registrarAccionAdmin(entrada) {
      await fdb.collection('registro_admin').add({ t: Date.now(), ...entrada });
    },

    async registroAdmin() {
      try {
        const snap = await fdb.collection('registro_admin').orderBy('t', 'desc').limit(1000).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {
        console.warn('registroAdmin:', e);
        return [];
      }
    },

    async notificarUsuario(uid, aviso) {
      await fdb.collection('avisos').add({
        uid, leido: false, t: Date.now(), ...aviso
      });
    },

    async avisosUsuario(uid) {
      try {
        const snap = await fdb.collection('avisos').where('uid', '==', uid).limit(50).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(a => !a.leido)
          .sort((a, b) => b.t - a.t);
      } catch (e) {
        console.warn('avisosUsuario:', e);
        return [];
      }
    },

    async marcarAvisosLeidos(uid) {
      const snap = await fdb.collection('avisos').where('uid', '==', uid).limit(50).get();
      const lote = fdb.batch();
      let n = 0;
      snap.docs.forEach(d => {
        if (!d.data().leido) { lote.update(d.ref, { leido: true }); n++; }
      });
      if (n) await lote.commit();
    },

    async prediccionesPendientes() {
      try {
        const snap = await fdb.collection('predicciones')
          .where('pendienteAprobacion', '==', true).get();
        return snap.docs.map(d => d.data());
      } catch (e) {
        console.warn('prediccionesPendientes:', e);
        return [];
      }
    },

    async eliminarPrediccion(uid, pid) {
      await fdb.collection('predicciones').doc(`${uid}__${pid}`).delete();
      this._invalidarCacheTodasPred();
    },

    async migrarPrediccionesSlot(origen, destino) {
      if (!origen || !destino || origen === destino) return { movidos: 0, preservados: 0 };
      const snap = await fdb.collection('predicciones').where('pid', '==', origen).get();
      if (snap.empty) return { movidos: 0, preservados: 0 };
      const ajustes = await this.ajustes();
      const resultados = await this.resultados();
      const peDest = Puntos.conAjustes(FIXTURE.porId(destino) || {}, ajustes);
      const resDest = Puntos._resultadoCanonico(resultados, peDest, ajustes);
      let movidos = 0;
      let preservados = 0;
      for (const doc of snap.docs) {
        const pr = doc.data();
        const uid = pr.uid;
        if (!uid || pr.supersededBy) continue;
        const destRef = fdb.collection('predicciones').doc(`${uid}__${destino}`);
        const destSnap = await destRef.get();
        const prev = destSnap.exists ? destSnap.data() : null;
        const elegir = Puntos.elegirPredMigracion(pr, prev, peDest, resDest, { preferOrigen: true });
        if (pr.gl != null && pr.gv != null) {
          await this.registrarHistorial(uid, pr.nombre || '', origen, pr.gl, pr.gv, null, null, {
            accion: 'migrar_slot',
            destino,
            t: pr.t || Date.now()
          });
        }
        const batch = fdb.batch();
        batch.set(destRef, { ...elegir, pid: destino, pidCanon: destino }, { merge: true });
        batch.delete(doc.ref);
        await batch.commit();
        movidos++;
        preservados++;
      }
      if (movidos) this._invalidarCacheTodasPred();
      return { movidos, preservados };
    },

    async limpiarPrediccionesSuperseded() {
      await this._ensureFirebase();
      const snap = await fdb.collection('predicciones').get();
      let eliminados = 0;
      let batch = fdb.batch();
      let n = 0;
      for (const doc of snap.docs) {
        if (!doc.data()?.supersededBy) continue;
        batch.delete(doc.ref);
        eliminados++;
        n++;
        if (n >= 400) {
          await batch.commit();
          batch = fdb.batch();
          n = 0;
        }
      }
      if (n) await batch.commit();
      if (eliminados) this._invalidarCacheTodasPred();
      return { eliminados };
    },

    async migrarResultadoSlot(origen, destino) {
      if (!origen || !destino || origen === destino) return false;
      const srcRef = fdb.collection('resultados').doc(origen);
      const destRef = fdb.collection('resultados').doc(destino);
      const [srcSnap, destSnap] = await Promise.all([srcRef.get(), destRef.get()]);
      if (!srcSnap.exists) return false;
      const dest = destSnap.data();
      if (dest?.estado === 'finalizado') return false;
      await destRef.set({ ...srcSnap.data(), t: Date.now() }, { merge: true });
      await srcRef.delete();
      _cacheResultados = null;
      return true;
    },

    _destPorClaveReparacion(ajustes) {
      const destPorClave = new Map();
      for (const p of FIXTURE.partidos) {
        const raw = { ...p, ...(ajustes[p.id] || {}) };
        if (!raw.local || !raw.visitante || raw.local === 'Por definir') continue;
        const clave = U.claveParejaKo(raw.local, raw.visitante);
        const oficial = U.idSlotKoOficial(raw.local, raw.visitante);
        if (U.esParejaFaseGrupos(raw.local, raw.visitante)) {
          if (p.fase === 'eliminatorias' && p.ronda !== '16avos' && !oficial) continue;
          const pg = U.partidoGruposPorPareja(raw.local, raw.visitante);
          if (pg) {
            destPorClave.set(clave, pg.id);
            continue;
          }
        }
        if (oficial) {
          destPorClave.set(clave, oficial);
          continue;
        }
        const prev = destPorClave.get(clave);
        if (!prev || (p.n || 999) < (FIXTURE.porId(prev)?.n || 999)) {
          destPorClave.set(clave, p.id);
        }
      }
      return destPorClave;
    },

    _destinoMigracionPid(pid, ajustes, resultados, destPorClave) {
      const clave = U.clavePartidoDesdePid(pid, ajustes);
      if (!clave.startsWith('id:')) {
        const dest = destPorClave.get(clave);
        return dest && dest !== pid ? dest : null;
      }
      const clOf = U.claveOficialPorSlotKo(pid);
      if (clOf) {
        const dest = destPorClave.get(clOf);
        if (dest && dest !== pid) return dest;
      }
      const resO = resultados?.[pid];
      if (!resO) return null;
      for (const [, dpid] of destPorClave) {
        if (dpid === pid) continue;
        const resD = resultados[dpid];
        if (!resD) continue;
        if (resO.gl === resD.gl && resO.gv === resD.gv
            && (resO.estado === resD.estado || resO.estado === 'finalizado')) {
          return dpid;
        }
      }
      return null;
    },

    async vaciarResultado(pid) {
      try {
        await fdb.collection('resultados').doc(pid).delete();
        _cacheResultados = null;
      } catch (err) {
        console.error('vaciarResultado:', err);
        throw err;
      }
    },

    async limpiarSlotsKoFantasma() {
      const ajustes = await this.ajustes(true);
      const resultados = await this.resultados();
      let limpiados = 0;
      for (const p of FIXTURE.partidos) {
        if (p.fase !== 'eliminatorias') continue;
        const raw = { ...p, ...(ajustes[p.id] || {}) };
        if (!raw.local || !raw.visitante || raw.local === 'Por definir') continue;

        const oficialId = U.idSlotKoOficial(raw.local, raw.visitante);
        if (oficialId === p.id) continue;
        if (oficialId && oficialId !== p.id) {
          const destRaw = { ...FIXTURE.porId(oficialId), ...(ajustes[oficialId] || {}) };
          await this.migrarPrediccionesSlot(p.id, oficialId);
          await this.migrarResultadoSlot(p.id, oficialId);
          const patch = U.patchMigracionKoOficial(p.id, raw, oficialId, destRaw);
          if (Object.keys(patch).length) {
            await this.guardarAjuste(oficialId, patch);
            ajustes[oficialId] = { ...(ajustes[oficialId] || {}), ...patch };
          }
          await this.guardarAjuste(p.id, { local: null, visitante: null, utc: null, horaOk: false });
          ajustes[p.id] = { ...(ajustes[p.id] || {}), local: null, visitante: null, utc: null, horaOk: false };
          if (resultados[p.id]) await this.vaciarResultado(p.id);
          limpiados++;
          continue;
        }

        if (!U.esParejaFaseGrupos(raw.local, raw.visitante)) continue;
        const pg = U.partidoGruposPorPareja(raw.local, raw.visitante);
        if (pg) {
          await this.migrarPrediccionesSlot(p.id, pg.id);
          await this.migrarResultadoSlot(p.id, pg.id);
        }
        await this.guardarAjuste(p.id, { local: null, visitante: null, utc: null, horaOk: false });
        ajustes[p.id] = { ...(ajustes[p.id] || {}), local: null, visitante: null, utc: null, horaOk: false };
        if (resultados[p.id]) await this.vaciarResultado(p.id);
        limpiados++;
      }
      if (limpiados && typeof Puntos !== 'undefined') Puntos.invalidarAjustes?.(ajustes);
      return { limpiados };
    },

    async reubicarPrediccionesKoHuerfanas(ajustesIn = null) {
      const ajustes = ajustesIn || await this.ajustes();
      const resultados = await this.resultados();
      let movidos = 0;
      const slots = FIXTURE.partidos.filter(p => p.fase === 'eliminatorias' && p.ronda !== '16avos');
      for (const slot of slots) {
        const snap = await fdb.collection('predicciones').where('pid', '==', slot.id).get();
        if (snap.empty) continue;
        const slotRaw = { ...slot, ...(ajustes[slot.id] || {}) };
        let local = slotRaw.local;
        let visitante = slotRaw.visitante;
        if (!local || local === 'Por definir') {
          const pr0 = snap.docs[0]?.data();
          if (pr0) {
            const pe = Puntos._resolverPartidoPred(slot.id, pr0, ajustes, resultados);
            local = pe?.local;
            visitante = pe?.visitante;
          }
        }
        const oficialId = U.idSlotKoOficial(local, visitante);
        if (oficialId && oficialId !== slot.id) {
          const r = await this.migrarPrediccionesSlot(slot.id, oficialId);
          movidos += r.movidos || 0;
          continue;
        }
        if (oficialId) continue;
        const preds = snap.docs.map(d => d.data()).filter(p => !p.supersededBy);
        let mejorPg = null;
        let mejorScore = -1;
        for (const pg of FIXTURE.partidos.filter(p => p.fase === 'grupos')) {
          const pe = Puntos.conAjustes(pg, ajustes);
          const res = Puntos._resultadoCanonico(resultados, pe, ajustes);
          if (!res || res.estado !== 'finalizado') continue;
          let score = 0;
          for (const pr of preds) {
            if (!U.pronosticoCuenta(pr, pe)) continue;
            score += Puntos.calificar(pr, res, pe.fase, pe).pts;
          }
          if (score > mejorScore) {
            mejorScore = score;
            mejorPg = pg;
          }
        }
        if (!mejorPg || mejorScore < 0) continue;
        const r = await this.migrarPrediccionesSlot(slot.id, mejorPg.id);
        movidos += r.movidos || 0;
      }
      return { movidos };
    },

    async repararPuntosTabla(ajustesIn = null) {
      const ajustes = ajustesIn || await this.ajustes();
      let restauradosHist = 0;
      try {
        const rh = await this.recuperarPrediccionesDesdeHistorial();
        restauradosHist = rh?.restaurados || 0;
      } catch (e) {
        console.warn('repararPuntosTabla recuperar historial:', e);
      }
      const resultados = await this.resultados();
      const destPorClave = this._destPorClaveReparacion(ajustes);

      const pidsOrigen = new Set();
      try {
        const todas = await this.todasPredicciones();
        Object.values(todas).forEach(pMap => Object.keys(pMap).forEach(pid => pidsOrigen.add(pid)));
      } catch (e) {
        console.warn('repararPuntosTabla preds:', e);
      }
      Object.keys(resultados).forEach(pid => pidsOrigen.add(pid));

      let migrados = 0;
      for (const pid of pidsOrigen) {
        const dest = this._destinoMigracionPid(pid, ajustes, resultados, destPorClave);
        if (!dest) continue;
        const r = await this.migrarPrediccionesSlot(pid, dest);
        migrados += r.movidos || 0;
        await this.migrarResultadoSlot(pid, dest);
      }

      let huerfanos = 0;
      try {
        const hu = await this.reubicarPrediccionesKoHuerfanas(ajustes);
        huerfanos = hu?.movidos || 0;
        migrados += huerfanos;
      } catch (e) {
        console.warn('reubicarPrediccionesKoHuerfanas:', e);
      }

      let limpiados = 0;
      try {
        const fant = await this.limpiarSlotsKoFantasma();
        limpiados = fant?.limpiados || 0;
      } catch (e) {
        console.warn('limpiarSlotsKoFantasma:', e);
      }

      let rehabilitados = 0;
      try {
        const snap = await fdb.collection('predicciones').get();
        let nBatch = 0;
        let batch = fdb.batch();
        for (const doc of snap.docs) {
          const pr = doc.data();
          if (pr.aprobado === false || pr.perdonadoPorAdmin) continue;
          if (pr.aprobado === true && !pr.pendienteAprobacion) continue;
          const pe = Puntos.conAjustes(FIXTURE.porId(pr.pid) || {}, ajustes);
          if (!pe?.local || !pe?.visitante) continue;
          if (pr.t && U.fueraDeTiempo(pe, pr.t)) continue;
          batch.update(doc.ref, {
            fueraDeTiempo: false,
            pendienteAprobacion: false,
            aprobado: true
          });
          nBatch++;
          rehabilitados++;
          if (nBatch >= 400) {
            await batch.commit();
            batch = fdb.batch();
            nBatch = 0;
          }
        }
        if (nBatch) await batch.commit();
      } catch (e) {
        console.warn('repararPuntosTabla rehabilitar:', e);
      }
      let archivadas = 0;
      try {
        const limp = await this.limpiarPrediccionesSuperseded();
        archivadas = limp?.eliminados || 0;
      } catch (e) {
        console.warn('limpiarPrediccionesSuperseded:', e);
      }
      return { migrados, rehabilitados, limpiados, huerfanos, restauradosHist, archivadas };
    },

    async recuperarPrediccionesDesdeHistorial(uidFiltro = null) {
      await this._ensureFirebase();
      const ajustes = await this.ajustes();
      const resultados = await this.resultados();
      const destPorClave = this._destPorClaveReparacion(ajustes);
      const todas = await this.todasPredicciones();
      let historial = [];
      try {
        if (uidFiltro) {
          const snap = await fdb.collection('historial_predicciones').where('uid', '==', uidFiltro).get();
          historial = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } else {
          historial = await this.historialPredicciones(5000);
        }
      } catch (e) {
        console.warn('recuperarPrediccionesDesdeHistorial historial:', e);
        return { restaurados: 0 };
      }
      const ultimoPorDest = new Map();
      historial.forEach(h => {
        if (h.accion === 'eliminar' || h.gl == null || h.gv == null) return;
        const dest = this._destinoHistorialSeguro(h, ajustes, resultados, destPorClave);
        if (!dest) return;
        const key = `${h.uid}|${dest}`;
        const prev = ultimoPorDest.get(key);
        if (!prev || (h.t || 0) >= (prev.t || 0)) ultimoPorDest.set(key, { ...h, destPid: dest });
      });
      let restaurados = 0;
      const usuarios = await this.usuarios();
      const mapNom = Object.fromEntries(usuarios.map(u => [u.uid, u.nombre]));
      for (const h of ultimoPorDest.values()) {
        const pe = Puntos.conAjustes(FIXTURE.porId(h.destPid) || {}, ajustes);
        const preds = todas[h.uid] || {};
        if (pe?.local && Puntos._predEnPartido(preds, pe, ajustes, null, resultados)) continue;
        const eq = U.equiposOficialSlotKo(h.destPid) || (pe.local ? [pe.local, pe.visitante] : null);
        const invertir = eq ? U.invertirPredDesdeSlotHistorial(h.pid, h.destPid, eq) : false;
        const goles = U.invertirGolesPred(h.gl, h.gv, invertir);
        const ref = fdb.collection('predicciones').doc(`${h.uid}__${h.destPid}`);
        const snap = await ref.get();
        if (snap.exists && snap.data()?.gl != null
            && Puntos._predEnPartido({ [h.destPid]: snap.data() }, pe, ajustes, null, resultados)) {
          continue;
        }
        await ref.set({
          uid: h.uid,
          pid: h.destPid,
          pidCanon: h.destPid,
          gl: goles.gl,
          gv: goles.gv,
          nombre: h.nombre || mapNom[h.uid] || '',
          t: h.t || Date.now(),
          aprobado: h.rechazadoPorAdmin ? false : true,
          pendienteAprobacion: false,
          fueraDeTiempo: !!(h.fueraDeTiempo && !h.perdonadoPorAdmin),
          perdonadoPorAdmin: !!h.perdonadoPorAdmin,
          recuperadoDesdeHistorial: true,
          recuperadoEn: Date.now(),
          recuperadoDesdeSlot: h.pid,
          orientacionCorregida: invertir || undefined
        }, { merge: true });
        restaurados++;
      }
      return { restaurados };
    },

    _peCanonPartido(p, ajustes) {
      let pe = Puntos.conAjustes(p, ajustes);
      if (!pe.local || pe.local === 'Por definir') {
        const eq = U.equiposOficialSlotKo(p.id);
        if (eq) pe = { ...pe, local: eq[0], visitante: eq[1] };
        else return null;
      }
      const pidCanon = U.idSlotKoOficial(pe.local, pe.visitante) || pe.id;
      const peCanon = Puntos.conAjustes(FIXTURE.porId(pidCanon) || pe, ajustes);
      if (!peCanon.local || peCanon.local === 'Por definir') {
        return { ...peCanon, local: pe.local, visitante: pe.visitante, id: pidCanon };
      }
      return { ...peCanon, id: pidCanon };
    },

    _partidosCanonUnicos(ajustes) {
      const vistos = new Set();
      const out = [];
      for (const p of FIXTURE.partidos) {
        const peCanon = this._peCanonPartido(p, ajustes);
        if (!peCanon?.local) continue;
        const cl = U.clavePartidoDuplicado(peCanon);
        if (vistos.has(cl)) continue;
        vistos.add(cl);
        out.push({ pidCanon: peCanon.id, pe: peCanon, cl });
      }
      return out;
    },

    _historialRelacionadoConPartido(h, pidCanon, peCanon, ajustes, resultados, destPorClave) {
      if (!h?.pid || !pidCanon) return false;
      if (h.pid === pidCanon) return true;
      const dest = this._destinoMigracionPid(h.pid, ajustes, resultados, destPorClave);
      if (dest === pidCanon) return true;
      const eq = U.equiposOficialSlotKo(pidCanon)
        || (peCanon?.local ? [peCanon.local, peCanon.visitante] : null);
      if (eq && this._historialCruzadoValido(h.pid, pidCanon, eq)) return true;
      if (peCanon?.fase === 'grupos') {
        const peH = Puntos.conAjustes(FIXTURE.porId(h.pid) || {}, ajustes);
        if (peH.local && U.clavePartidoDuplicado(peH) === U.clavePartidoDuplicado(peCanon)) return true;
      }
      return false;
    },

    _destinoHistorialSeguro(h, ajustes, resultados, destPorClave) {
      const dest = this._destinoMigracionPid(h.pid, ajustes, resultados, destPorClave) || h.pid;
      const peDest = Puntos.conAjustes(FIXTURE.porId(dest) || {}, ajustes);
      const eqOfHist = U.equiposOficialSlotKo(h.pid);
      if (!eqOfHist || !peDest?.local || peDest.local === 'Por definir') return dest;
      const clSlot = U.claveParejaKo(eqOfHist[0], eqOfHist[1]);
      const clDest = U.claveParejaKo(peDest.local, peDest.visitante);
      if (clSlot !== clDest) return null;
      return dest;
    },

    /* ¿Historial de slotId puede restaurarse en pidCanon (cruce desplazado)? */
    _historialCruzadoValido(slotId, pidCanon, eq) {
      if (!slotId || !pidCanon || slotId === pidCanon || !eq?.length) return true;
      const oficial = U.idSlotKoOficial(eq[0], eq[1]);
      if (oficial !== pidCanon) return false;
      const eqSlot = U.equiposOficialSlotKo(slotId);
      if (!eqSlot) return false;
      return U.claveParejaKo(eqSlot[0], eqSlot[1]) !== U.claveParejaKo(eq[0], eq[1]);
    },

    _ultimoHistorialPorUidPid(historial) {
      const ultimo = new Map();
      historial.forEach(h => {
        if (h.accion === 'eliminar' || h.gl == null || h.gv == null) return;
        const k = `${h.uid}|${h.pid}`;
        const p = ultimo.get(k);
        if (!p || (h.t || 0) >= (p.t || 0)) ultimo.set(k, h);
      });
      return ultimo;
    },

    _slotsHistorialCruzados(pidCanon, eq, ajustes, resultados, todas, ultimoHist) {
      const clCanon = U.claveParejaKo(eq[0], eq[1]);
      const oficial = U.idSlotKoOficial(eq[0], eq[1]);
      if (oficial !== pidCanon) return [];
      const peCanon = { ...Puntos.conAjustes(FIXTURE.porId(pidCanon) || {}, ajustes), local: eq[0], visitante: eq[1], id: pidCanon };
      const slots = new Set();
      for (const h of ultimoHist.values()) {
        if (h.pid === pidCanon) continue;
        const eqH = U.equiposOficialSlotKo(h.pid);
        if (!eqH || U.claveParejaKo(eqH[0], eqH[1]) === clCanon) continue;
        const preds = todas[h.uid] || {};
        if (Puntos._predEnPartido(preds, peCanon, ajustes, null, resultados)) continue;
        const peH = Puntos.conAjustes(FIXTURE.porId(h.pid) || {}, ajustes);
        if (Puntos._predEnPartido(preds, peH, ajustes, null, resultados)) continue;
        if (this._historialCruzadoValido(h.pid, pidCanon, eq)) slots.add(h.pid);
      }
      return [...slots];
    },

    async slotsHistorialExtraPartido(pidCanon) {
      await this._ensureFirebase();
      const eq = U.equiposOficialSlotKo(pidCanon);
      if (!eq) return [];
      const [ajustes, resultados, todas, historial] = await Promise.all([
        this.ajustes(), this.resultados(), this.todasPredicciones(), this.historialPredicciones(12000)
      ]);
      const ultimo = this._ultimoHistorialPorUidPid(historial);
      return this._slotsHistorialCruzados(pidCanon, eq, ajustes, resultados, todas, ultimo);
    },

    async diagnosticarPredsPerdidosProfundo() {
      await this._ensureFirebase();
      const [ajustes, resultados, todas, historial, usuarios] = await Promise.all([
        this.ajustes(), this.resultados(), this.todasPredicciones(),
        this.historialPredicciones(12000), this.usuarios()
      ]);
      const destPorClave = this._destPorClaveReparacion(ajustes);
      const activos = usuarios.filter(u => u.estado === 'activo');
      const mapNom = Object.fromEntries(usuarios.map(u => [u.uid, u.nombre]));
      const ultimo = this._ultimoHistorialPorUidPid(historial);
      const casos = [];
      const filas = [];

      for (const { pidCanon, pe: peCanon } of this._partidosCanonUnicos(ajustes)) {
        const eq = U.equiposOficialSlotKo(pidCanon) || [peCanon.local, peCanon.visitante];
        const extras = eq.length === 2
          ? this._slotsHistorialCruzados(pidCanon, eq, ajustes, resultados, todas, ultimo)
          : [];
        const slotsScope = new Set([pidCanon, ...extras]);
        const uidsPerdidos = new Set();
        let predsOrfanos = 0;

        activos.forEach(u => {
          const preds = todas[u.uid] || {};
          const pr = Puntos._predEnPartido(preds, peCanon, ajustes, null, resultados);
          if (pr?.gl != null) return;
          for (const h of ultimo.values()) {
            if (h.uid !== u.uid) continue;
            if (!this._historialRelacionadoConPartido(h, pidCanon, peCanon, ajustes, resultados, destPorClave)) {
              continue;
            }
            uidsPerdidos.add(u.uid);
            casos.push({
              uid: u.uid,
              nombre: mapNom[u.uid] || h.nombre || u.uid,
              partido: `${FIXTURE.equipo(peCanon.local).n} vs ${FIXTURE.equipo(peCanon.visitante).n}`,
              pidCanon,
              pidHistorial: h.pid,
              pred: `${h.gl}–${h.gv}`,
              finalizado: resultados[pidCanon]?.estado === 'finalizado'
            });
            break;
          }
        });

        FIXTURE.partidos.forEach(slot => {
          if (slot.id === pidCanon) return;
          const px = Puntos.conAjustes(slot, ajustes);
          if (!px.local || U.claveParejaKo(px.local, px.visitante) !== U.claveParejaKo(peCanon.local, peCanon.visitante)) return;
          activos.forEach(u => {
            const pr = (todas[u.uid] || {})[slot.id];
            if (pr?.gl != null && !pr.supersededBy) predsOrfanos++;
          });
        });

        if (!uidsPerdidos.size && !predsOrfanos && !extras.length) continue;
        filas.push({
          pidCanon,
          partido: `${FIXTURE.equipo(peCanon.local).n} vs ${FIXTURE.equipo(peCanon.visitante).n}`,
          perdidosHistorial: uidsPerdidos.size,
          predsOrfanos,
          slotsHistorial: [...slotsScope],
          slotsExtra: extras
        });
      }
      return {
        filas: filas.sort((a, b) => (b.perdidosHistorial + b.predsOrfanos) - (a.perdidosHistorial + a.predsOrfanos)),
        casos
      };
    },

    async diagnosticarPredsPerdidos() {
      const r = await this.diagnosticarPredsPerdidosProfundo();
      return r.filas;
    },

    async recuperarPrediccionesPartidosAfectados() {
      await this._ensureFirebase();
      let desdeHistorial = 0;
      try {
        const rh = await this.recuperarPrediccionesDesdeHistorial();
        desdeHistorial = rh?.restaurados || 0;
      } catch (e) {
        console.warn('recuperarPrediccionesDesdeHistorial:', e);
      }
      const ajustes = await this.ajustes();
      const partidos = this._partidosCanonUnicos(ajustes);
      const detalle = [];
      let migrados = 0;
      let restaurados = 0;
      let orientados = 0;
      let nombres = 0;
      for (const { pidCanon } of partidos) {
        try {
          const extra = await this.slotsHistorialExtraPartido(pidCanon);
          const r = await this.recuperarPrediccionesPartido(pidCanon, extra);
          migrados += r.migrados || 0;
          restaurados += r.restaurados || 0;
          for (const slot of extra) {
            const o = await this.corregirOrientacionPredsPartido(pidCanon, { slotOrigen: slot, soloSinCorregir: true });
            orientados += o.corregidos || 0;
          }
          const n = await this.enriquecerNombresPredsPartido(pidCanon);
          nombres += n.actualizados || 0;
          if ((r.migrados || 0) + (r.restaurados || 0) > 0) {
            const pe = this._peCanonPartido(FIXTURE.porId(pidCanon), ajustes);
            detalle.push({
              pidCanon,
              partido: pe ? `${FIXTURE.equipo(pe.local).n} vs ${FIXTURE.equipo(pe.visitante).n}` : pidCanon,
              migrados: r.migrados,
              restaurados: r.restaurados
            });
          }
        } catch (e) {
          /* slot sin equipos aún */
        }
      }
      this._invalidarCacheTodasPred();
      return { partidos: detalle.length, migrados, restaurados, orientados, nombres, desdeHistorial, detalle };
    },

    /* Restaura preds de un cruce concreto (ej. ko-78 CIV–NOR) desde slots viejos e historial. */
    async recuperarPrediccionesPartido(pidCanon, slotsHistorialExtra = []) {
      await this._ensureFirebase();
      const ajustes = await this.ajustes();
      const resultados = await this.resultados();
      const peCanon = Puntos.conAjustes(FIXTURE.porId(pidCanon) || {}, ajustes);
      const eq = U.equiposOficialSlotKo(pidCanon)
        || (peCanon.local && peCanon.visitante && peCanon.local !== 'Por definir'
          ? [peCanon.local, peCanon.visitante] : null);
      if (!eq) throw new Error('Este partido aún no tiene equipos definidos.');
      const clOf = U.claveParejaKo(eq[0], eq[1]);

      const slotsMigrar = new Set([pidCanon]);
      FIXTURE.partidos.forEach(p => {
        const raw = { ...p, ...(ajustes[p.id] || {}) };
        if (!raw.local || !raw.visitante || raw.local === 'Por definir') return;
        if (U.claveParejaKo(raw.local, raw.visitante) === clOf) slotsMigrar.add(p.id);
      });

      const slotsHist = new Set([pidCanon, ...slotsHistorialExtra]);
      slotsMigrar.forEach(id => slotsHist.add(id));

      const usuarios = await this.usuarios();
      const mapNom = Object.fromEntries(usuarios.map(u => [u.uid, u.nombre]));

      let migrados = 0;
      for (const origen of slotsMigrar) {
        if (origen === pidCanon) continue;
        const r = await this.migrarPrediccionesSlot(origen, pidCanon);
        migrados += r.movidos || 0;
      }

      const todas = await this.todasPredicciones();
      let restaurados = 0;
      for (const slotId of slotsHist) {
        const snap = await fdb.collection('historial_predicciones').where('pid', '==', slotId).get();
        const ultimo = new Map();
        snap.docs.forEach(d => {
          const h = d.data();
          if (h.accion === 'eliminar' || h.gl == null || h.gv == null) return;
          const prev = ultimo.get(h.uid);
          if (!prev || (h.t || 0) >= (prev.t || 0)) ultimo.set(h.uid, h);
        });
        for (const h of ultimo.values()) {
          const preds = todas[h.uid] || {};
          if (Puntos._predEnPartido(preds, peCanon, ajustes, null, resultados)) continue;
          if (slotId !== pidCanon && !this._historialCruzadoValido(slotId, pidCanon, eq)) continue;
          const ref = fdb.collection('predicciones').doc(`${h.uid}__${pidCanon}`);
          const exist = await ref.get();
          if (exist.exists && exist.data()?.gl != null
              && Puntos._predEnPartido({ [pidCanon]: exist.data() }, peCanon, ajustes, null, resultados)) {
            continue;
          }
          const invertir = U.invertirPredDesdeSlotHistorial(slotId, pidCanon, eq);
          const goles = U.invertirGolesPred(h.gl, h.gv, invertir);
          await ref.set({
            uid: h.uid,
            pid: pidCanon,
            pidCanon,
            gl: goles.gl,
            gv: goles.gv,
            nombre: h.nombre || mapNom[h.uid] || '',
            t: h.t || Date.now(),
            aprobado: h.rechazadoPorAdmin ? false : true,
            pendienteAprobacion: false,
            fueraDeTiempo: !!(h.fueraDeTiempo && !h.perdonadoPorAdmin),
            perdonadoPorAdmin: !!h.perdonadoPorAdmin,
            recuperadoDesdeHistorial: true,
            recuperadoEn: Date.now(),
            recuperadoDesdeSlot: slotId,
            orientacionCorregida: invertir || undefined
          }, { merge: true });
          restaurados++;
        }
      }
      this._invalidarCacheTodasPred();
      return { migrados, restaurados, pid: pidCanon };
    },

    async corregirOrientacionPredsPartido(pidCanon, opts = {}) {
      await this._ensureFirebase();
      const { slotOrigen = 'ko-76', soloSinCorregir = true } = opts;
      const snap = await fdb.collection('predicciones').where('pid', '==', pidCanon).get();
      let corregidos = 0;
      let batch = fdb.batch();
      let n = 0;
      for (const doc of snap.docs) {
        const pr = doc.data();
        if (pr.supersededBy || pr.gl == null || pr.gv == null) continue;
        if (soloSinCorregir && pr.orientacionCorregida) continue;
        const desdeSlot = !slotOrigen || pr.recuperadoDesdeSlot === slotOrigen;
        const recuperado = pr.recuperadoDesdeHistorial || pr.recuperadoDesdeSlot;
        if (slotOrigen && !desdeSlot && !opts.todosEnPartido) continue;
        if (!recuperado && !opts.todosEnPartido) continue;
        batch.update(doc.ref, {
          gl: pr.gv,
          gv: pr.gl,
          orientacionCorregida: true,
          orientacionCorregidaEn: Date.now()
        });
        corregidos++;
        n++;
        if (n >= 400) {
          await batch.commit();
          batch = fdb.batch();
          n = 0;
        }
      }
      if (n) await batch.commit();
      if (corregidos) this._invalidarCacheTodasPred();
      return { corregidos, pid: pidCanon };
    },

    async enriquecerNombresPredsPartido(pidCanon) {
      await this._ensureFirebase();
      const usuarios = await this.usuarios();
      const mapNom = Object.fromEntries(usuarios.map(u => [u.uid, u.nombre]));
      const snap = await fdb.collection('predicciones').where('pid', '==', pidCanon).get();
      let actualizados = 0;
      let batch = fdb.batch();
      let n = 0;
      for (const doc of snap.docs) {
        const pr = doc.data();
        if (pr.supersededBy) continue;
        const nombre = mapNom[pr.uid] || pr.nombre;
        if (!nombre || nombre === pr.nombre) continue;
        batch.update(doc.ref, { nombre });
        actualizados++;
        n++;
        if (n >= 400) {
          await batch.commit();
          batch = fdb.batch();
          n = 0;
        }
      }
      if (n) await batch.commit();
      if (actualizados) this._invalidarCacheTodasPred();
      return { actualizados, pid: pidCanon };
    },

    async restaurarTablaEmergencia(ajustesIn = null) {
      return this.repararPuntosTabla(ajustesIn);
    },

    async listarHistorialTabla() {
      await this._ensureFirebase();
      const snap = await fdb.collection('publico').get();
      return snap.docs
        .filter(d => d.id.startsWith('historial_'))
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.t || 0) - (a.t || 0));
    },

    async restaurarHistorialTabla(histId, opts = {}) {
      await this._ensureFirebase();
      const doc = await fdb.collection('publico').doc(histId).get();
      if (!doc.exists || !doc.data()?.filas?.length) {
        throw new Error('Respaldo de tabla no encontrado.');
      }
      const d = doc.data();
      const prev = await fdb.collection('publico').doc('tabla').get();
      if (prev.exists && prev.data()?.filas?.length) {
        const p = prev.data();
        await fdb.collection('publico').doc(`historial_${p.t || Date.now()}`).set({
          filas: p.filas,
          t: p.t || Date.now(),
          ajustesFp: p.ajustesFp || '',
          label: p.label || 'Auto antes de restaurar'
        });
      }
      await fdb.collection('publico').doc('tabla').set({
        filas: d.filas,
        t: Date.now(),
        ajustesFp: d.ajustesFp || '',
        congelada: opts.congelar !== false,
        label: `Restaurado desde ${histId}`,
        restauradoDe: histId
      });
      return { filas: d.filas.length, congelada: opts.congelar !== false };
    },

    async setTablaCongelada(congelada) {
      await this._ensureFirebase();
      const ref = fdb.collection('publico').doc('tabla');
      const doc = await ref.get();
      if (!doc.exists) throw new Error('No hay tabla publicada.');
      await ref.set({ ...doc.data(), congelada: !!congelada, t: doc.data().t || Date.now() }, { merge: true });
    },

    async predicciones(uid) {
      const now = Date.now();
      if (_cachePredUid === uid && _cachePredData && (now - _cachePredTs) < CACHE_PRED_MS) {
        return { ..._cachePredData };
      }
      const snap = await fdb.collection('predicciones').where('uid', '==', uid).get();
      const out = {};
      snap.docs.forEach(d => {
        const p = d.data();
        if (p.supersededBy) return;
        const canon = p.pidCanon || p.pid;
        const prev = out[canon];
        if (!prev || (p.t || 0) >= (prev.t || 0)) out[canon] = { ...p, pid: canon };
      });
      _cachePredUid = uid;
      _cachePredData = out;
      _cachePredTs = now;
      return out;
    },

    async prediccionesPartido(pid) {
      const snap = await fdb.collection('predicciones').where('pid', '==', pid).get();
      return snap.docs.map(d => d.data()).filter(p => !p.supersededBy);
    },

    async todasPredicciones(opts = {}) {
      const force = opts.force === true;
      const now = Date.now();
      if (!force && _cacheTodasPred && (now - _cacheTodasPredTs) < CACHE_TODAS_PRED_MS) {
        return _cacheTodasPred;
      }
      try {
        const snap = await fdb.collection('predicciones').get();
        const out = {};
        snap.docs.forEach(d => {
          const p = d.data();
          if (!p.uid || !p.pid || p.supersededBy) return;
          const canon = p.pidCanon || p.pid;
          const prev = out[p.uid]?.[canon];
          if (!prev || (p.t || 0) >= (prev.t || 0)) {
            (out[p.uid] = out[p.uid] || {})[canon] = { ...p, pid: canon };
          }
        });
        _cacheTodasPred = out;
        _cacheTodasPredTs = now;
        return out;
      } catch (err) {
        console.error("🔥 Error Firebase (todasPredicciones):", err);
        alert("Error de permisos al descargar predicciones: " + err.message);
        throw err;
      }
    },

    async resultados() {
      if (_cacheResultados) return { ..._cacheResultados };
      try {
        const snap = await fdb.collection('resultados').get();
        const out = {};
        snap.docs.forEach(d => { out[d.id] = d.data(); });
        _cacheResultados = out;
        return { ...out };
      } catch (err) {
        console.error("🔥 Error Firebase (resultados):", err);
        alert("Error de permisos al descargar resultados: " + err.message);
        throw err;
      }
    },

    async guardarResultado(pid, res) {
      try {
        await fdb.collection('resultados').doc(pid).set({ ...res, t: Date.now() }, { merge: true });
        _cacheResultados = null;
      } catch (err) {
        console.error("🔥 Error Firebase (guardarResultado):", err);
        alert("No tienes permiso para guardar marcadores. Revisa tu correo en la colección 'configuracion' de Firestore.\n\nError: " + err.message);
        throw err;
      }
    },

    async ajustes(force = false) {
      const now = Date.now();
      if (!force && _cacheAjustes && (now - _cacheAjustesTs) < CACHE_AJUSTES_MS) {
        return { ..._cacheAjustes };
      }
      try {
        await this._ensureFirebase();
        const snap = await fdb.collection('ajustes').get();
        const out = {};
        snap.docs.forEach(d => { out[d.id] = d.data(); });
        _cacheAjustes = out;
        _cacheAjustesTs = now;
        return { ...out };
      } catch (err) {
        console.error("🔥 Error Firebase (ajustes):", err);
        if (!String(err.message || '').includes('Firebase no está listo')) {
          alert("Error de permisos al descargar calendario: " + err.message);
        }
        throw err;
      }
    },

    async guardarAjuste(pid, aj) {
      try {
        await this._ensureFirebase();
        const prev = (await fdb.collection('ajustes').doc(pid).get()).data() || {};
        const merged = { ...prev, ...aj };
        const base = FIXTURE?.porId?.(pid) || {};
        const cierre = U.calcCierreMs({ ...base, ...merged });
        if (cierre != null) merged.cierreMs = cierre;
        if (merged.utc && aj.horaOk !== false) merged.horaOk = true;
        await fdb.collection('ajustes').doc(pid).set(merged, { merge: true });
        if (_cacheAjustes) _cacheAjustes[pid] = merged;
      } catch (err) {
        console.error("🔥 Error Firebase (guardarAjuste):", err);
        alert("Error de permisos al ajustar el partido: " + err.message);
        throw err;
      }
    },

    async tablaPublicada() {
      const ahora = Date.now();
      if (_cachePubTs && ahora - _cachePubTs < CACHE_PUB_MS) return _cachePub;
      try {
        const doc = await fdb.collection('publico').doc('tabla').get();
        _cachePub = doc.exists ? doc.data() : null;
        _cachePubTs = ahora;
        return _cachePub;
      } catch (err) {
        console.error("🔥 Error Firebase (tablaPublicada):", err);
        return null;
      }
    },

    async publicarTabla(tabla, meta = {}) {
      try {
        await this._ensureFirebase();
        const ref = fdb.collection('publico').doc('tabla');
        const prev = await ref.get();
        if (prev.exists && prev.data()?.filas?.length && meta.respaldo !== false) {
          const p = prev.data();
          await fdb.collection('publico').doc(`historial_${p.t || Date.now()}`).set({
            filas: p.filas,
            t: p.t || Date.now(),
            ajustesFp: p.ajustesFp || '',
            label: p.label || 'Auto-respaldo'
          });
        }
        const nueva = {
          filas: tabla,
          t: Date.now(),
          ajustesFp: meta.ajustesFp || '',
          congelada: meta.congelada === true,
          label: meta.label || ''
        };
        await ref.set(nueva);
        _cachePub = nueva;
        _cachePubTs = Date.now();
        if (meta.silencioso !== true) {
          alert("¡La tabla oficial se publicó correctamente para todos los jugadores!");
        }
      } catch (err) {
        console.error("🔥 Error Firebase (Publicar Tabla):", err);
        if (meta.silencioso !== true) {
          alert("Fallo al publicar la tabla en Firebase: " + err.message);
        }
      }
    },

    enCambios(cb) {
      return fdb.collection('resultados').onSnapshot(snap => {
        const out = {};
        snap.docs.forEach(d => { out[d.id] = d.data(); });
        _cacheResultados = out;
        cb(out);
      });
    },

    enTablaPublicada(cb) {
      return fdb.collection('publico').doc('tabla').onSnapshot(doc => {
        _cachePub = doc.exists ? doc.data() : null;
        _cachePubTs = Date.now();
        cb(_cachePub);
      });
    },

    async reclamarSincronizacion() {
      const ref = fdb.collection('sincronizacion').doc('live');
      const ahora = Date.now();
      try {
        const doc = await ref.get();
        if (doc.exists && ahora < (doc.data().hasta || 0)) return false;
        // Bloqueo corto para evitar sync duplicada entre pestañas (debe ser < intervalo en vivo).
        await ref.set({ at: ahora, hasta: ahora + 18000 });
        return true;
      } catch { return false; }
    },

    async cargarEjemplo() { throw new Error('Los datos de ejemplo solo existen en modo demo.'); },

    async registrarIntentoTrampa(uid, nombre, pid, gl, gv, motivo) {
      try { await fdb.collection('intentos_trampa').add({ uid, nombre, pid, gl, gv, motivo, t: Date.now() }); }
      catch (e) { console.warn('No se pudo registrar intento trampa:', e); }
    },

    async intentosTrampa() {
      try {
        const snap = await fdb.collection('intentos_trampa').orderBy('t', 'desc').limit(200).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) { console.warn('intentosTrampa:', e); return []; }
    },

    async eliminarIntentoTrampa(id) {
      await fdb.collection('intentos_trampa').doc(id).delete();
    },

    async registrarHistorial(uid, nombre, pid, gl, gv, glPrev, gvPrev, extra = {}) {
      try {
        const accion = extra.accion
          || (gl == null && gv == null && glPrev != null ? 'eliminar' : glPrev != null ? 'editar' : 'crear');
        await fdb.collection('historial_predicciones').add({
          uid, nombre, pid,
          gl: gl ?? null, gv: gv ?? null,
          glPrev: glPrev ?? null, gvPrev: gvPrev ?? null,
          accion,
          t: extra.t || Date.now(),
          ...extra
        });
      } catch (e) { console.warn('No se pudo registrar historial:', e); }
    },

    async historialPredicciones(limite = 12000) {
      try {
        const snap = await fdb.collection('historial_predicciones').orderBy('t', 'desc').limit(limite).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) { console.warn('historialPredicciones:', e); return []; }
    },

    async historialPrediccionesUsuario(uid, limite = 800) {
      if (!uid) return [];
      try {
        const snap = await fdb.collection('historial_predicciones')
          .where('uid', '==', uid)
          .orderBy('t', 'desc')
          .limit(limite)
          .get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {
        try {
          const snap = await fdb.collection('historial_predicciones').where('uid', '==', uid).limit(limite).get();
          return snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.t || 0) - (a.t || 0));
        } catch (e2) {
          console.warn('historialPrediccionesUsuario:', e2);
          return [];
        }
      }
    },

    async eliminarEntradaHistorial(id) {
      console.warn('eliminarEntradaHistorial: historial append-only — no se borra.');
    },

    async eliminarHistorialUsuarioPartido(uid, pid) {
      console.warn('eliminarHistorialUsuarioPartido: historial append-only — no se borra.');
    },

    /* Marca partidos vencidos como "iniciando" para bloquear pronósticos en Firestore. */
    async cerrarPartidosVencidos(partidos, resultados = {}) {
      let cerrados = 0;
      const ahora = Date.now();
      const ventanaIniciando = 3 * 60 * 60 * 1000;
      for (const p of partidos) {
        if (!p.local || !p.visitante) continue;
        const res = resultados[p.id] || {};
        if (res.estado === 'en_juego' || res.estado === 'finalizado' || res.estado === 'aplazado') continue;
        if (!U.fueraDeTiempo(p)) continue;
        const kickoff = U.inicioPartidoMs(p);
        if (kickoff && ahora > kickoff + ventanaIniciando) continue;
        if (res.estado === 'iniciando') continue;
        try {
          await this.guardarResultado(p.id, { ...res, estado: 'iniciando' });
          cerrados++;
        } catch (_) { /* solo admins o regla de iniciando */ }
      }
      return cerrados;
    },

    /* ---- Compatibilidad (sin salas privadas) ---- */
    async salaPorId() {
      return { salaId: 'siigo', nombre: 'Polla Siigo 2026', codigo: null, adminUid: null };
    },

    async usuariosSala() { return this.usuarios(); },

    async guardarPrediccionSala(uid, pid, gl, gv) {
      return this.guardarPrediccion(uid, pid, gl, gv);
    },

    async prediccionesSala(uid) { return this.predicciones(uid); },

    async todasPrediccionesSala() { return this.todasPredicciones(); },

    /* ---- PUNTOS MANUALES -------------------------------- */
    async puntosManuales() {
      try { const snap = await fdb.collection('puntos_manuales').get(); return snap.docs.map(d => d.data()); }
      catch (e) { console.warn('puntosManuales:', e); return []; }
    },

    async guardarPuntoManual(uid, pid, pts, razon) {
      await fdb.collection('puntos_manuales').doc(`${uid}__${pid}`).set({ uid, pid, pts: Number(pts), razon: razon || '', t: Date.now() });
    },

    async quitarPuntoManual(uid, pid) {
      await fdb.collection('puntos_manuales').doc(`${uid}__${pid}`).delete();
    },

    async enviarMensajeChat(partidoId, mensaje) {
      try {
        const mensajeConTs = {
          ...mensaje,
          timestamp: fb.firestore.FieldValue.serverTimestamp()
        };
        await fdb.collection('chats').doc(partidoId).collection('mensajes').add(mensajeConTs);
      } catch (err) {
        console.error("🔥 Error Firebase (enviarMensajeChat):", err);
        throw new Error("No se pudo enviar el mensaje.");
      }
    },

    escucharChat(partidoId, callback) {
      try {
        const q = fdb.collection('chats').doc(partidoId).collection('mensajes').orderBy('timestamp', 'asc').limitToLast(50);
        let isInitial = true;
        return q.onSnapshot(snapshot => {
          const changes = snapshot.docChanges().map(change => ({
            type: change.type,
            doc: { id: change.doc.id, ...change.doc.data() }
          }));
          callback(changes, isInitial);
          isInitial = false;
        });
      } catch (err) {
        console.error("🔥 Error Firebase (escucharChat):", err);
        return () => {};
      }
    },

    async toggleReaccionChat(partidoId, mensajeId, emoji) {
      const uid = fb.auth().currentUser?.uid;
      if (!uid) throw new Error("Usuario no autenticado.");
  
      const msgRef = fdb.collection('chats').doc(partidoId).collection('mensajes').doc(mensajeId);
  
      return fdb.runTransaction(async (transaction) => {
        const msgDoc = await transaction.get(msgRef);
        if (!msgDoc.exists) throw "El mensaje no existe.";
  
        const data = msgDoc.data();
        const newReacciones = data.reacciones || {};
        
        if (!newReacciones[emoji]) {
          newReacciones[emoji] = [];
        }
  
        const userIndex = newReacciones[emoji].indexOf(uid);
        if (userIndex > -1) {
          newReacciones[emoji].splice(userIndex, 1);
          if (newReacciones[emoji].length === 0) delete newReacciones[emoji];
        } else {
          newReacciones[emoji].push(uid);
        }
  
        transaction.update(msgRef, { reacciones: newReacciones });
      });
    },
  };

  /* ========================================================= */
  const motor = (CONFIG.MODO === 'firebase') ? firebaseStore : demo;
  motor.esDemo = CONFIG.MODO !== 'firebase';
  if (typeof motor.loginGoogle !== 'function') {
    motor.loginGoogle = async () => {
      throw new Error('El inicio de sesión con Google no está disponible. Cambia CONFIG.MODO a "firebase" o revisa la carga de Firebase.');
    };
  }
  return motor;
})();
window.Store = Store;