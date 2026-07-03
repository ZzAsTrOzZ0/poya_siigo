/* ============================================================
   POLLA SIIGO 2026 — MOTOR DE PUNTUACIÓN
   ------------------------------------------------------------
   Reglas (CONFIG.REGLAS):
     Fase de grupos      → exacto 3 pts · acertar 1X2 1 pt
     Eliminatorias       → exacto 5 pts · acertar 1X2 2 pts
     Bono campeón        → 10 pts (elegido antes del 1.er partido)
   Desempates: 1) puntos  2) exactos  3) aciertos de resultado
               4) quien se registró primero.
   ============================================================ */

const Puntos = {

  /* Cache por objeto de ajustes: koAjusteVisible recorre todo el fixture
     por cada slot KO vacío y se llama miles de veces por repintado. */
  _memoConAjustes: new WeakMap(),

  /* Memos por objeto de ajustes para las rutas calientes de la tabla.
     Se invalidan solos al refetchear ajustes (objeto nuevo) o con
     invalidarAjustes() cuando se muta el objeto en sitio. */
  _memoRoot: new WeakMap(),
  _memoPidsConPred: new WeakMap(),

  _memo(ajustes) {
    if (!ajustes || typeof ajustes !== 'object') return null;
    let m = this._memoRoot.get(ajustes);
    if (!m) {
      m = {
        clavePorSlot: new Map(),
        clavePorPid: new Map(),
        resCanon: new WeakMap(),
        predsPorClave: new WeakMap(),
        partidosUnicos: null
      };
      this._memoRoot.set(ajustes, m);
    }
    return m;
  },

  invalidarAjustes(ajustes) {
    if (!ajustes || typeof ajustes !== 'object') return;
    this._memoRoot.delete(ajustes);
    this._memoConAjustes.delete(ajustes);
  },

  _pidsConPredDe(todasPred) {
    if (!todasPred || typeof todasPred !== 'object') return new Set();
    let s = this._memoPidsConPred.get(todasPred);
    if (!s) {
      s = new Set();
      Object.values(todasPred).forEach(pm => Object.keys(pm || {}).forEach(pid => s.add(pid)));
      this._memoPidsConPred.set(todasPred, s);
    }
    return s;
  },

  /* Aplica los ajustes del admin (hora real, sede, equipos de
     eliminatorias) sobre un partido del fixture. */
  conAjustes(p, ajustes) {
    if (p?.id && ajustes && typeof ajustes === 'object') {
      let porId = this._memoConAjustes.get(ajustes);
      if (!porId) { porId = new Map(); this._memoConAjustes.set(ajustes, porId); }
      if (porId.has(p.id)) return porId.get(p.id);
      const out = this._conAjustesCalc(p, ajustes);
      porId.set(p.id, out);
      return out;
    }
    return this._conAjustesCalc(p, ajustes);
  },

  _conAjustesCalc(p, ajustes) {
    const a = (ajustes || {})[p.id];
    if (!a) {
      if (p?.fase === 'eliminatorias' && p?.id) return U.koAjusteVisible(p.id, ajustes);
      return p;
    }
    // La lógica es: si el ajuste contiene una nueva hora UTC, el partido
    // se considera confirmado (`horaOk: true`). Esto tiene prioridad sobre
    // un posible valor `horaOk: false` que se haya arrastrado en el formulario
    // del panel de admin. Si no se ajusta la hora, se respeta el `horaOk`
    // que venga en el ajuste, o se hereda el del fixture original.
    const newHoraOk = a.utc ? true : (typeof a.horaOk === 'boolean' ? a.horaOk : p.horaOk);
    const merged = { ...p, ...a, horaOk: newHoraOk };
    const cierre = U.calcCierreMs(merged);
    if (cierre != null) merged.cierreMs = cierre;
    if (merged.fase === 'eliminatorias' && (!merged.local || merged.local === 'Por definir')) {
      return U.koAjusteVisible(p.id, ajustes);
    }
    if (merged.local && merged.visitante && merged.local !== 'Por definir') {
      const ofId = U.idSlotKoOficial(merged.local, merged.visitante);
      if (ofId && ofId !== p.id) {
        const ofPart = FIXTURE.porId(ofId);
        if (ofPart) {
          merged.etapa = ofPart.etapa;
          merged.ronda = ofPart.ronda;
          merged.slotCanon = ofId;
        }
      }
    }
    return merged;
  },

  /* Resultado guardado en otro slot duplicado (ej. ko-78 vs ko-76). */
  _claveCruce(pe, ajustes) {
    return U.clavePartidoDuplicado(pe);
  },

  _claveDesdeSlot(p, ajustes) {
    const m = this._memo(ajustes);
    if (m && m.clavePorSlot.has(p.id)) return m.clavePorSlot.get(p.id);
    const px = this.conAjustes(p, ajustes);
    let clave = U.clavePartidoDuplicado(px);
    if (clave.startsWith('id:')) clave = U.claveOficialPorSlotKo(p.id) || clave;
    if (m) m.clavePorSlot.set(p.id, clave);
    return clave;
  },

  _resultadoCanonico(resultados, pe, ajustes) {
    const clave = this._claveCruce(pe, ajustes);
    const m = resultados && typeof resultados === 'object' ? this._memo(ajustes) : null;
    if (m) {
      let porClave = m.resCanon.get(resultados);
      if (!porClave) {
        porClave = new Map();
        FIXTURE.partidos.forEach(p => {
          const res = resultados[p.id];
          if (!res) return;
          const cl = this._claveDesdeSlot(p, ajustes);
          let s = 0;
          if (res.estado === 'finalizado') s += 1000;
          else if (res.estado === 'en_juego') s += 100;
          if (res.gl != null && res.gv != null) s += 10;
          s -= (p.n || 999) * 0.001;
          const prev = porClave.get(cl);
          if (!prev || s > prev.s) porClave.set(cl, { s, res });
        });
        m.resCanon.set(resultados, porClave);
      }
      return porClave.get(clave)?.res || null;
    }
    let mejor = null;
    let score = -1;
    FIXTURE.partidos.forEach(p => {
      if (this._claveDesdeSlot(p, ajustes) !== clave) return;
      const res = resultados[p.id];
      if (!res) return;
      let s = 0;
      if (res.estado === 'finalizado') s += 1000;
      else if (res.estado === 'en_juego') s += 100;
      if (res.gl != null && res.gv != null) s += 10;
      s -= (p.n || 999) * 0.001;
      if (s > score) { score = s; mejor = res; }
    });
    return mejor;
  },

  _manualCanonico(manualPorPid, pe, ajustes) {
    const clave = this._claveCruce(pe, ajustes);
    let total = 0;
    let razon = '';
    FIXTURE.partidos.forEach(p => {
      if (this._claveDesdeSlot(p, ajustes) !== clave) return;
      const m = manualPorPid[p.id];
      if (m) {
        total += Number(m.pts) || 0;
        if (m.razon) razon = m.razon;
      }
    });
    return total ? { pts: total, razon } : null;
  },

  _partidosUnicos(ajustes, ctx = {}) {
    const { resultados = {}, pidsConPred = null } = ctx;
    const m = !ctx.misPred ? this._memo(ajustes) : null;
    if (m && m.partidosUnicos
        && m.partidosUnicos.res === resultados
        && m.partidosUnicos.pids === pidsConPred) {
      return m.partidosUnicos.lista;
    }
    const lista = [];
    for (const p of FIXTURE.partidos) {
      let px = this.conAjustes(p, ajustes);
      if (px.local && px.visitante && px.local !== 'Por definir') {
        lista.push(px);
        continue;
      }
      const eq = U.equiposOficialSlotKo(p.id);
      if (!eq) continue;
      const res = resultados[p.id];
      const resFin = res?.estado === 'finalizado';
      const alguienPredijo = pidsConPred ? pidsConPred.has(p.id) : false;
      if (!resFin && !alguienPredijo) continue;
      px = {
        ...px,
        local: eq[0],
        visitante: eq[1],
        horaOk: px.horaOk !== false
      };
      const cierre = U.calcCierreMs(px);
      if (cierre != null) px.cierreMs = cierre;
      lista.push(px);
    }
    const out = U.dedupePartidos(lista, ctx);
    if (m) m.partidosUnicos = { res: resultados, pids: pidsConPred, lista: out };
    return out;
  },

  /* Recupera partidos con pronóstico+resultado que no entraron al listado principal. */
  _partidosExtraUsuario(preds, partidosUnicos, resultados, ajustes) {
    const vistos = new Set(partidosUnicos.map(pe => this._claveCruce(pe, ajustes)));
    const extras = [];
    for (const [pid, pr] of Object.entries(preds || {})) {
      if (!pr || pr.gl == null || pr.gv == null) continue;
      let pe = this._resolverPartidoPred(pid, pr, ajustes, resultados);
      if (!pe?.local || !pe.visitante || pe.local === 'Por definir') {
        const raw = FIXTURE.porId(pid);
        if (raw) pe = this.conAjustes(raw, ajustes);
      }
      if (!pe?.local || !pe.visitante || pe.local === 'Por definir') continue;
      const clave = this._claveCruce(pe, ajustes);
      if (vistos.has(clave)) continue;
      const res = this._resultadoCanonico(resultados, pe, ajustes);
      if (res?.estado !== 'finalizado') continue;
      extras.push(pe);
      vistos.add(clave);
    }
    return extras;
  },

  _partidosParaUsuario(preds, ajustes, resultados, pidsConPred) {
    const base = this._partidosUnicos(ajustes, { resultados, pidsConPred });
    return base.concat(this._partidosExtraUsuario(preds, base, resultados, ajustes));
  },

  /* Índice rápido: clave de cruce → mejor pronóstico del usuario. */
  _predsPorClave(preds, ajustes, resultados = {}) {
    const byClave = new Map();
    const destPorClave = new Map();
    for (const p of FIXTURE.partidos) {
      const raw = { ...p, ...((ajustes || {})[p.id] || {}) };
      if (!raw.local || !raw.visitante || raw.local === 'Por definir') continue;
      const clave = U.claveParejaKo(raw.local, raw.visitante);
      destPorClave.set(clave, U.idSlotKoOficial(raw.local, raw.visitante) || p.id);
    }
    const registrar = (pid, pr) => {
      let clave = U.clavePartidoDesdePid(pid, ajustes);
      if (clave.startsWith('id:')) {
        const clOf = U.claveOficialPorSlotKo(pid);
        if (clOf) clave = clOf;
        else {
          const resO = resultados[pid];
          if (resO) {
            for (const [cl, dpid] of destPorClave) {
              if (dpid === pid) continue;
              const resD = resultados[dpid];
              if (resD && resO.gl === resD.gl && resO.gv === resD.gv
                  && (resO.estado === resD.estado || resO.estado === 'finalizado')) {
                clave = cl;
                break;
              }
            }
          }
        }
      }
      if (clave.startsWith('id:')) return;
      const prev = byClave.get(clave);
      if (!prev || (pr.t || 0) >= (prev.t || 0)) byClave.set(clave, pr);
    };
    Object.entries(preds || {}).forEach(([pid, pr]) => {
      const pe = this._resolverPartidoPred(pid, pr, ajustes, resultados);
      if (pe?.local && pe.visitante && pe.local !== 'Por definir') {
        const clave = pe.fase === 'eliminatorias'
          ? U.claveParejaKo(pe.local, pe.visitante)
          : U.clavePartidoDuplicado(pe);
        if (!clave.startsWith('id:')) {
          const prev = byClave.get(clave);
          if (!prev || (pr.t || 0) >= (prev.t || 0)) byClave.set(clave, pr);
        }
      }
      registrar(pid, pr);
    });
    return byClave;
  },

  /* byClave memoizado por (preds, ajustes, resultados): construir
     _predsPorClave es costoso y antes se rehacía por cada partido. */
  _byClaveDe(preds, ajustes, resultados = {}) {
    const m = preds && typeof preds === 'object' ? this._memo(ajustes) : null;
    if (m) {
      const hit = m.predsPorClave.get(preds);
      if (hit && hit.res === resultados) return hit.map;
      const map = this._predsPorClave(preds, ajustes, resultados);
      m.predsPorClave.set(preds, { res: resultados, map });
      return map;
    }
    return this._predsPorClave(preds, ajustes, resultados);
  },

  /* Clave resuelta de un pid (con fallback al slot KO oficial), memoizada. */
  _clavePidResuelta(pid, ajustes) {
    const m = this._memo(ajustes);
    if (m && m.clavePorPid.has(pid)) return m.clavePorPid.get(pid);
    let cl = U.clavePartidoDesdePid(pid, ajustes);
    if (cl.startsWith('id:')) cl = U.claveOficialPorSlotKo(pid) || cl;
    if (m) m.clavePorPid.set(pid, cl);
    return cl;
  },

  _predEnPartido(preds, pe, ajustes, byClave = null, resultados = {}) {
    const map = byClave || this._byClaveDe(preds, ajustes, resultados);
    const clave = this._claveCruce(pe, ajustes);
    const vistos = new Set();
    const candidatos = [];
    const agregar = (pr) => {
      if (!pr || vistos.has(pr)) return;
      vistos.add(pr);
      candidatos.push(pr);
    };
    agregar(preds[pe.id]);
    agregar(map.get(clave));
    Object.entries(preds || {}).forEach(([pid, pr]) => {
      let cl = this._clavePidResuelta(pid, ajustes);
      if (cl.startsWith('id:')) {
        const resO = resultados[pid];
        if (resO) {
          for (const p of FIXTURE.partidos) {
            const px = { ...p, ...((ajustes || {})[p.id] || {}) };
            if (!px.local || !px.visitante) continue;
            const clPx = U.claveParejaKo(px.local, px.visitante);
            if (clPx !== clave) continue;
            const resD = resultados[p.id];
            if (resD && resO.gl === resD.gl && resO.gv === resD.gv) {
              cl = clave;
              break;
            }
          }
        }
      }
      if (cl === clave) agregar(pr);
    });
    candidatos.sort((a, b) => (b.t || 0) - (a.t || 0));
    for (const pr of candidatos) {
      if (U.pronosticoCuenta(pr, pe)) return pr;
    }
    return candidatos[0] || null;
  },

  etiquetaRegla(fase, tipo) {
    const r = CONFIG.REGLAS[fase === 'eliminatorias' ? 'eliminatorias' : 'grupos'];
    if (tipo === 'exacto') return `+${r.exacto} exacto`;
    if (tipo === 'resultado') return `+${r.resultado} resultado`;
    return '0 pts';
  },

  motivoSinPuntos(pr, res, pe, cal) {
    if (!pr) return 'Sin pronóstico';
    if (!res) return 'Sin resultado cargado';
    if (res.estado !== 'finalizado') return `Partido ${res.estado || 'sin estado'} (solo cuenta finalizado)`;
    if (cal.tipo === 'pendiente') {
      if (pr.aprobado === false) return 'Rechazado por admin';
      if (pr.pendienteAprobacion || pr.aprobado === null) return 'Pendiente de aprobación';
      if (pe && U.fueraDeTiempo(pe, pr.t)) return 'Fuera de hora';
      return 'No cuenta (pendiente)';
    }
    if (cal.tipo === 'fallo') return 'Marcador y resultado distintos';
    return '';
  },

  _predCanonicaConSlot(preds, pe, ajustes, resultados = {}) {
    const pr = this._predEnPartido(preds, pe, ajustes, null, resultados);
    let pidOrigen = pe.id;
    if (!pr) return { pr: null, pidOrigen };
    if (preds[pe.id] === pr) return { pr, pidOrigen: pe.id };
    for (const [pid, p] of Object.entries(preds || {})) {
      if (p === pr) {
        pidOrigen = pid;
        break;
      }
    }
    if (pidOrigen === pe.id) {
      const clPe = this._claveCruce(pe, ajustes);
      for (const [pid, p] of Object.entries(preds || {})) {
        if (p !== pr) continue;
        const rpe = this._resolverPartidoPred(pid, p, ajustes, resultados);
        if (!rpe?.local || !rpe.visitante) continue;
        const clR = this._claveCruce(rpe, ajustes);
        if (clR === clPe || !clR.startsWith('id:') && !clPe.startsWith('id:') && clR === clPe) {
          pidOrigen = pid;
          break;
        }
        if ((rpe.local === pe.local && rpe.visitante === pe.visitante)
            || (rpe.local === pe.visitante && rpe.visitante === pe.local)) {
          pidOrigen = pid;
          break;
        }
      }
    }
    return { pr, pidOrigen };
  },

  _ptsSiValido(pr, res, fase) {
    if (!pr || !res || res.estado !== 'finalizado') return 0;
    const limpio = { ...pr, aprobado: true, pendienteAprobacion: false, perdonadoPorAdmin: true };
    return this.calificar(limpio, res, fase).pts;
  },

  /* Texto corto para admin: por qué está tarde y qué pasa con los puntos. */
  diagnosticoTarde(pe, pr, resultados, ajustes, opts = {}) {
    if (!pr) return null;
    if (pr.aprobado === false && !opts.forzar) return null;
    const tardeReal = !!(pr.t && U.fueraDeTiempo(pe, pr.t));
    const pendiente = !!(pr.pendienteAprobacion || pr.aprobado === null);
    if (!tardeReal && !pendiente && !opts.forzar) return null;

    const det = tardeReal && pr.t ? U.detalleTarde(pe, pr.t) : null;
    const cierre = U.cierreMsEfectivo(pe);
    const fmtMs = ms => ms ? new Date(ms).toLocaleString('es-CO', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: U.TZ_COLOMBIA
    }) : null;
    const horaCierre = det?.horaCierre || fmtMs(cierre) || 'sin cierre configurado';
    const horaGuardado = det?.horaGuardado || fmtMs(pr.t) || 'sin hora registrada';

    const res = this._resultadoCanonico(resultados, pe, ajustes);
    const cal = this.calificar(pr, res, pe.fase, pe);
    const ptsDebidos = this._ptsSiValido(pr, res, pe.fase);
    const seg = det?.segTarde || (cierre && pr.t && pr.t >= cierre ? Math.max(1, Math.ceil((pr.t - cierre) / 1000)) : 0);
    const min = det?.minTarde || (seg ? Math.max(1, Math.round(seg / 60)) : 0);
    let retraso = seg > 0 && seg < 60 ? `+${seg} seg`
      : min > 0 && min < 1440 ? `+${min} min`
      : min >= 1440 ? `+${Math.round(min / 1440)} días` : '';
    let aviso = '';
    if (opts.falsoPositivoHora) aviso = 'Con la hora actual ya NO sería tarde — revisa Calendario.';
    else if (min >= 1440) aviso = 'Retraso muy alto — probable hora API incorrecta.';
    else if (!pr.t) aviso = 'Falta la hora en que guardó — usa el pronóstico actual del participante.';
    else if (pendiente && !tardeReal) aviso = 'Quedó pendiente de aprobación al guardar.';

    const linea1 = `Cierre ${horaCierre} → guardó ${horaGuardado}`;
    let linea2 = retraso ? `${retraso} tarde.` : (pendiente ? 'Pendiente de tu aprobación.' : 'Revisa hora del partido en Calendario.');
    if (aviso) linea2 += ` ${aviso}`;

    let ptsLabel = 'Espera resultado del partido';
    let ptsAccion = '';
    if (opts.perdonado && cal.pts) {
      ptsLabel = `Sumando +${cal.pts}`;
      ptsAccion = `Rechazar quita ${cal.pts} pts`;
    } else if (res?.estado === 'finalizado') {
      if (ptsDebidos) {
        ptsLabel = cal.pts ? `+${cal.pts} en tabla` : `0 ahora · debía +${ptsDebidos}`;
        ptsAccion = cal.pts ? `Rechazar quita ${cal.pts} pts` : `Aprobar sumaría +${ptsDebidos} pts`;
      } else {
        ptsLabel = '0 pts · no acertó';
        ptsAccion = 'Aprobar no cambia puntos';
      }
    } else if (ptsDebidos) {
      ptsAccion = `Si acertó, aprobar sumaría +${ptsDebidos} pts`;
    }
    return {
      linea1, linea2, retraso, aviso, segTarde: seg, minTarde: min,
      ptsDebidos, ptsActuales: cal.pts, ptsLabel, ptsAccion, detalle: det?.texto
    };
  },

  evaluarAuditoria(pr, res, pe, cal, manual, usuario, pidOrigen) {
    const perdonado = !!(pr?.perdonadoPorAdmin);
    const tardeRecalc = !!(pr && !perdonado && U.esTardeRecalculado(pe, pr.t, pr));
    const pendiente = !!(pr && (pr.pendienteAprobacion || pr.aprobado === null));
    const rechazado = !!(pr && pr.aprobado === false);
    const cuenta = !!(pr && U.pronosticoCuenta(pr, pe));
    const ptsDebidos = this._ptsSiValido(pr, res, pe.fase);
    const sospechas = [];

    if (usuario?.intentosTrampa > 0 && cal.pts > 0) {
      sospechas.push(`${usuario.intentosTrampa} intento(s) de trampa registrado(s)`);
    }
    if (usuario?.marcaTrampa) sospechas.push(`Marca admin: ${usuario.marcaTrampa}`);
    if (perdonado && (pr?.fueraDeTiempo || tardeRecalc) && cal.pts > 0) {
      sospechas.push('Sumó tras perdonar pronóstico tarde');
    }
    if (pidOrigen && pidOrigen !== pe.id) sospechas.push(`Pred en slot ${pidOrigen} (canónico ${pe.id})`);
    if (manual?.pts && !cal.pts) sospechas.push('Puntos manuales sin acierto automático');

    let estado = 'neutral';
    let etiqueta = '—';
    let revisar = false;

    if (manual?.pts) {
      estado = 'manual';
      etiqueta = `Ajuste manual (+${manual.pts})`;
      revisar = true;
    } else if (!pr) {
      estado = res?.estado === 'finalizado' ? 'sin_pred' : 'neutral';
      etiqueta = res?.estado === 'finalizado' ? 'Sin pronóstico' : '—';
    } else if (rechazado) {
      estado = 'rechazado';
      etiqueta = ptsDebidos ? `Rechazado (debía +${ptsDebidos})` : 'Rechazado';
      revisar = true;
    } else if (pendiente) {
      estado = 'pendiente';
      etiqueta = ptsDebidos ? `Pendiente aprobación (debía +${ptsDebidos})` : 'Pendiente aprobación';
      revisar = true;
    } else if (tardeRecalc && !cuenta) {
      estado = 'tarde';
      etiqueta = ptsDebidos ? `Fuera de hora — debía +${ptsDebidos}` : 'Fuera de hora';
      revisar = true;
    } else if (perdonado && tardeRecalc && cal.pts > 0) {
      estado = 'perdonado';
      etiqueta = `Tarde perdonado · suma +${cal.pts}`;
      revisar = true;
    } else if (cal.pts > 0) {
      estado = sospechas.length ? 'ok_revisar' : 'ok';
      etiqueta = cal.tipo === 'exacto' ? `Correcto +${cal.pts}` : `Resultado +${cal.pts}`;
      revisar = sospechas.length > 0;
    } else if (res?.estado === 'finalizado') {
      estado = 'fallo';
      etiqueta = 'Falló · 0 pts';
    } else if (res) {
      estado = 'espera';
      etiqueta = `Partido ${res.estado || 'abierto'}`;
    }

    return {
      estado, etiqueta, revisar, sospechas, ptsDebidos,
      perdonado, tardeRecalc, pendiente, rechazado, cuenta
    };
  },

  desgloseCompleto(uid, usuario, todasPred, resultados, ajustes, puntosManuales) {
    const preds = (todasPred || {})[uid] || {};
    const manualPorPid = {};
    let ptsManualTotal = 0;
    (puntosManuales || []).filter(pm => pm.uid === uid).forEach(pm => {
      manualPorPid[pm.pid] = pm;
      ptsManualTotal += Number(pm.pts) || 0;
    });
    const campeonReal = this.campeon(resultados, ajustes);
    let pts = 0, exactos = 0, aciertos = 0;
    const ctx = { misPred: preds, resultados, pidsConPred: this._pidsConPredDe(todasPred) };
    const filas = this._partidosParaUsuario(preds, ajustes, resultados, ctx.pidsConPred).map(pe => {
      const canon = this._predCanonicaConSlot(preds, pe, ajustes, resultados);
      const pr = canon.pr;
      const pidOrigen = canon.pidOrigen || pe.id;
      const res = this._resultadoCanonico(resultados, pe, ajustes);
      const cal = this.calificar(pr, res, pe.fase, pe);
      const manual = this._manualCanonico(manualPorPid, pe, ajustes);
      const ptsFila = cal.pts + (manual ? manual.pts : 0);
      pts += cal.pts;
      if (cal.tipo === 'exacto') exactos++;
      if (cal.tipo === 'resultado') aciertos++;
      const L = FIXTURE.equipo(pe.local), V = FIXTURE.equipo(pe.visitante);
      const detalleTarde = pr && U.fueraDeTiempo(pe, pr.t) ? U.detalleTarde(pe, pr.t) : null;
      const auditoria = this.evaluarAuditoria(pr, res, pe, cal, manual, usuario, pidOrigen);
      return {
        pid: pe.id, pidOrigen, etapa: pe.etapa,
        partido: `${L.n} vs ${V.n}`,
        horaPartido: pe.utc ? `${U.diaLocal(pe.utc)} · ${U.horaLocal(pe.utc)}` : (pe.fecha || '—'),
        horaPred: pr?.t ? `${U.diaLocal(pr.t)} · ${U.horaLocal(pr.t)}` : null,
        detalleTarde: detalleTarde?.texto || null,
        minTarde: detalleTarde?.minTarde || null,
        pred: pr ? `${pr.gl}–${pr.gv}` : null,
        real: res?.estado === 'finalizado' ? `${res.gl}–${res.gv}` : null,
        ptsAuto: cal.pts,
        ptsManual: manual ? manual.pts : 0,
        pts: pr || res?.estado === 'finalizado' ? ptsFila : null,
        regla: cal.pts ? this.etiquetaRegla(pe.fase, cal.tipo) : '0',
        motivo: cal.pts ? '' : this.motivoSinPuntos(pr, res, pe, cal),
        tipo: cal.tipo,
        finalizado: res?.estado === 'finalizado',
        fueraDeTiempo: pr && U.fueraDeTiempo(pe, pr.t),
        pendiente: pr && (pr.pendienteAprobacion || pr.aprobado === null),
        rechazado: pr && pr.aprobado === false,
        perdonado: !!(pr?.perdonadoPorAdmin),
        razonManual: manual?.razon || '',
        auditoria
      };
    }).filter(f => f && (f.pred || f.finalizado));
    pts += ptsManualTotal;
    let bono = 0;
    if (campeonReal && usuario?.campeon === campeonReal) {
      bono = CONFIG.REGLAS.bonusCampeon;
      pts += bono;
    }
    const resumenAuditoria = this.resumenFilasAuditoria(filas);
    resumenAuditoria.revisar = filas.filter(f => f.auditoria.revisar).length;
    resumenAuditoria.tarde = filas.filter(f => f.auditoria.estado === 'tarde').length;
    resumenAuditoria.pendientes = filas.filter(f => f.auditoria.estado === 'pendiente').length;
    resumenAuditoria.sospechosos = filas.filter(f => f.auditoria.sospechas.length).length;
    return { filas, pts, exactos, aciertos, bono, ptsManualTotal, campeonReal, resumenAuditoria };
  },

  filtrarFilasAuditoria(filas, filtro) {
    if (!filtro) return filas;
    if (filtro === 'puntos') return filas.filter(f => f.ptsAuto > 0 || f.ptsManual > 0);
    if (filtro === 'exacto') return filas.filter(f => f.tipo === 'exacto' && f.ptsAuto > 0);
    if (filtro === 'resultado') return filas.filter(f => f.tipo === 'resultado' && f.ptsAuto > 0);
    if (filtro === 'revisar') return filas.filter(f => f.auditoria.revisar);
    if (filtro === 'tarde') return filas.filter(f => f.auditoria.estado === 'tarde' || f.auditoria.estado === 'perdonado');
    if (filtro === 'pendiente') return filas.filter(f => f.auditoria.estado === 'pendiente' || f.auditoria.estado === 'rechazado');
    if (filtro === 'fallo') return filas.filter(f => f.auditoria.estado === 'fallo');
    if (filtro === 'sin_pred') return filas.filter(f => f.auditoria.estado === 'sin_pred');
    return filas;
  },

  resumenFilasAuditoria(filas) {
    const sumaronFilas = filas.filter(f => f.ptsAuto > 0 || f.ptsManual > 0);
    const exactosFilas = filas.filter(f => f.tipo === 'exacto' && f.ptsAuto > 0);
    const resultadosFilas = filas.filter(f => f.tipo === 'resultado' && f.ptsAuto > 0);
    const fallosFilas = filas.filter(f => f.auditoria.estado === 'fallo');
    const sinPredFilas = filas.filter(f => f.auditoria.estado === 'sin_pred');
    const manualFilas = filas.filter(f => f.ptsManual > 0);
    return {
      conPuntos: sumaronFilas.length,
      ptsAutoTotal: filas.reduce((s, f) => s + (f.ptsAuto || 0), 0),
      sumaron: sumaronFilas.length,
      ptsSumaron: sumaronFilas.reduce((s, f) => s + ((f.ptsAuto || 0) + (f.ptsManual || 0)), 0),
      exactos: exactosFilas.length,
      ptsExactos: exactosFilas.reduce((s, f) => s + (f.ptsAuto || 0), 0),
      resultados: resultadosFilas.length,
      ptsResultados: resultadosFilas.reduce((s, f) => s + (f.ptsAuto || 0), 0),
      fallos: fallosFilas.length,
      sinPred: sinPredFilas.length,
      manual: manualFilas.length,
      ptsManual: manualFilas.reduce((s, f) => s + (f.ptsManual || 0), 0)
    };
  },

  textoInformeAuditoria(d, nombre) {
    const ra = d.resumenAuditoria || this.resumenFilasAuditoria(d.filas || []);
    const bloque = (titulo, filas) => {
      if (!filas.length) return [`${titulo}: (ninguno)`, ''];
      return [
        `${titulo} (${filas.length}):`,
        ...filas.map(f =>
          `  · ${f.partido} · pred ${f.pred || '—'} · real ${f.real || '—'} · ${f.pts != null ? f.pts + ' pts' : '0 pts'} · ${f.auditoria?.etiqueta || f.regla || '—'}`
        ),
        ''
      ];
    };
    const filas = d.filas || [];
    return [
      `AUDITORÍA DE PUNTOS — ${nombre || 'Participante'}`,
      `Total tabla: ${d.pts} pts · Auto: ${ra.ptsAutoTotal} · Manual: ${ra.ptsManual || d.ptsManualTotal || 0}${d.bono ? ` · Bono campeón: +${d.bono}` : ''}`,
      `Sumaron: ${ra.sumaron} (${ra.ptsSumaron} pts) · Exactos: ${ra.exactos} · Resultado: ${ra.resultados} · Fallos: ${ra.fallos} · Sin pronóstico: ${ra.sinPred}`,
      '',
      ...bloque('SUMARON PUNTOS', this.filtrarFilasAuditoria(filas, 'puntos')),
      ...bloque('MARCADOR EXACTO', this.filtrarFilasAuditoria(filas, 'exacto')),
      ...bloque('SOLO RESULTADO', this.filtrarFilasAuditoria(filas, 'resultado')),
      ...bloque('FALLÓ (con pronóstico)', this.filtrarFilasAuditoria(filas, 'fallo')),
      ...bloque('SIN PRONÓSTICO (partido finalizado)', this.filtrarFilasAuditoria(filas, 'sin_pred')),
      `TOTAL: ${d.pts} pts`
    ].join('\n');
  },

  /* Partidos finalizados donde el historial muestra pronóstico pero ya no está vinculado. */
  detectarPredsPerdidas(uid, preds, historial, ajustes, resultados) {
    const casos = [];
    const vistos = new Set();
    const ultimo = new Map();
    (historial || []).forEach(h => {
      if (h.uid !== uid || h.accion === 'eliminar' || h.gl == null || h.gv == null) return;
      const key = `${h.pid}|${h.gl}|${h.gv}|${h.t || 0}`;
      ultimo.set(key, h);
    });
    for (const h of ultimo.values()) {
      const prHist = { gl: h.gl, gv: h.gv, t: h.t, aprobado: h.rechazadoPorAdmin ? false : true };
      let pe = this._resolverPartidoPred(h.pid, prHist, ajustes, resultados);
      if (!pe?.local || !pe.visitante) {
        pe = this.conAjustes(FIXTURE.porId(h.pid) || {}, ajustes);
      }
      if (!pe?.local || !pe.visitante || pe.local === 'Por definir') continue;
      const clave = this._claveCruce(pe, ajustes);
      const dedupeKey = `${clave}|${h.gl}|${h.gv}`;
      if (vistos.has(dedupeKey)) continue;
      vistos.add(dedupeKey);
      const res = this._resultadoCanonico(resultados, pe, ajustes);
      if (res?.estado !== 'finalizado') continue;
      const pr = this._predEnPartido(preds, pe, ajustes, null, resultados);
      if (pr) continue;
      const L = FIXTURE.equipo(pe.local), V = FIXTURE.equipo(pe.visitante);
      casos.push({
        uid,
        pid: h.pid,
        pidCanonico: pe.id,
        partido: `${L.n} vs ${V.n}`,
        pred: `${h.gl}–${h.gv}`,
        t: h.t,
        historialId: h.id
      });
    }
    return casos;
  },

  signo(gl, gv) { return gl > gv ? 'L' : gl < gv ? 'V' : 'E'; },

  /* Si el pronóstico quedó en un slot duplicado (ko-78), buscar el del mismo cruce real. */
  _predCanonica(preds, pe, ajustes) {
    const clave = U.clavePartidoDuplicado(pe);
    let mejor = null;
    FIXTURE.partidos.forEach(p => {
      const px = this.conAjustes(p, ajustes);
      if (U.clavePartidoDuplicado(px) !== clave) return;
      const pr = preds[p.id];
      if (!pr) return;
      if (!mejor || (pr.t || 0) >= (mejor.t || 0)) mejor = pr;
    });
    return mejor;
  },

  /* Califica un pronóstico contra un resultado FINALIZADO. */
  calificar(pred, res, fase, pe) {
    if (!pred || !res || res.estado !== 'finalizado') return { pts: 0, tipo: null };
    if (pe && !U.pronosticoCuenta(pred, pe)) return { pts: 0, tipo: 'pendiente' };
    if (!pe && (pred.pendienteAprobacion || pred.aprobado === false || pred.aprobado === null)) {
      return { pts: 0, tipo: 'pendiente' };
    }
    const r = CONFIG.REGLAS[fase === 'eliminatorias' ? 'eliminatorias' : 'grupos'];
    if (pred.gl === res.gl && pred.gv === res.gv) return { pts: r.exacto, tipo: 'exacto' };
    if (this.signo(pred.gl, pred.gv) === this.signo(res.gl, res.gv)) return { pts: r.resultado, tipo: 'resultado' };
    return { pts: 0, tipo: 'fallo' };
  },

  /* Al mover pronóstico entre slots: nunca descartar el del usuario por uno más reciente en destino. */
  elegirPredMigracion(pr, prev, peDest, resDest, opts = {}) {
    const valido = p => p && p.gl != null && p.gv != null;
    if (!valido(prev)) return pr;
    if (!valido(pr)) return prev;
    if (peDest) {
      const prCuenta = U.pronosticoCuenta(pr, peDest);
      const prevCuenta = U.pronosticoCuenta(prev, peDest);
      if (prCuenta && !prevCuenta) return pr;
      if (prevCuenta && !prCuenta) return prev;
    }
    if (resDest?.estado === 'finalizado' && peDest?.local) {
      const calPr = this.calificar(pr, resDest, peDest.fase, peDest);
      const calPrev = this.calificar(prev, resDest, peDest.fase, peDest);
      if (calPrev.pts > calPr.pts) return prev;
      if (calPr.pts > calPrev.pts) return pr;
    }
    if (opts.preferOrigen !== false) return pr;
    return (prev.t || 0) >= (pr.t || 0) ? prev : pr;
  },

  /* Campeón del Mundial (si la final ya terminó). */
  campeon(resultados, ajustes) {
    const final = this.conAjustes(FIXTURE.porId('ko-104'), ajustes);
    const res = resultados['ko-104'];
    if (!res || res.estado !== 'finalizado' || !final.local || !final.visitante) return null;
    if (res.gl === res.gv) return res.ganadorPenales || null;   // definido por el admin si hubo penales
    return res.gl > res.gv ? final.local : final.visitante;
  },

  /* Tabla de posiciones de la polla.
     puntosManuales: array de { uid, pid, pts, razon } que se suman al total. */
  /* Cola de casos que requieren decisión del admin (tarde, pendiente, perdonado sumando). */
  colaRevisionPendiente(usuarios, todasPred, resultados, ajustes) {
    const items = [];
    const prio = { tarde_bloqueado: 0, pendiente: 1, tarde_perdonado: 2 };

    usuarios.filter(u => u.estado === 'activo').forEach(u => {
      const preds = (todasPred || {})[u.uid] || {};
      const ctx = { misPred: preds, resultados };
      this._partidosUnicos(ajustes, ctx).forEach(pe => {
        const canon = this._predCanonicaConSlot(preds, pe, ajustes, resultados);
        const pr = canon.pr;
        if (!pr || pr.aprobado === false) return;
        const pidOrigen = canon.pidOrigen || pe.id;
        const res = this._resultadoCanonico(resultados, pe, ajustes);
        const cal = this.calificar(pr, res, pe.fase, pe);
        const auditoria = this.evaluarAuditoria(pr, res, pe, cal, null, u, pidOrigen);
        const cierre = U.cierreMsEfectivo(pe);
        const tarde = !!(pr.t && cierre && pr.t >= cierre);
        const detalle = tarde ? U.detalleTarde(pe, pr.t) : null;

        let tipoCola = null;
        if (pr.pendienteAprobacion || pr.aprobado === null) {
          tipoCola = 'pendiente';
        } else if (tarde && pr.perdonadoPorAdmin && cal.pts > 0) {
          tipoCola = 'tarde_perdonado';
        } else if (tarde && !pr.perdonadoPorAdmin && !U.pronosticoCuenta(pr, pe)) {
          tipoCola = 'tarde_bloqueado';
        } else if (U.esTardeRecalculado(pe, pr.t, pr) && !pr.perdonadoPorAdmin) {
          tipoCola = 'tarde_bloqueado';
        } else {
          return;
        }

        const L = FIXTURE.equipo(pe.local), V = FIXTURE.equipo(pe.visitante);
        items.push({
          uid: u.uid, nombre: u.nombre, pid: pidOrigen,
          partido: `${L.n} vs ${V.n}`, etapa: pe.etapa,
          predGl: pr.gl, predGv: pr.gv, t: pr.t || 0,
          horaPartido: pe.utc ? `${U.diaLocal(pe.utc)} · ${U.horaLocal(pe.utc)}` : (pe.fecha || '—'),
          horaPred: pr.t ? `${U.diaLocal(pr.t)} · ${U.horaLocal(pr.t)}` : '—',
          horaCierre: detalle?.horaCierre || (cierre ? U.horaLocal(new Date(cierre).toISOString()) : '—'),
          segTarde: detalle?.segTarde || 0,
          detalleTarde: detalle?.texto || '',
          real: res?.estado === 'finalizado' ? `${res.gl}–${res.gv}` : null,
          finalizado: res?.estado === 'finalizado',
          ptsActuales: cal.pts,
          ptsDebidos: auditoria.ptsDebidos,
          ptsEnRiesgo: cal.pts > 0 ? cal.pts : (auditoria.ptsDebidos || 0),
          tipoCola,
          perdonado: !!pr.perdonadoPorAdmin,
          regla: cal.pts ? this.etiquetaRegla(pe.fase, cal.tipo) : (auditoria.ptsDebidos ? `debía +${auditoria.ptsDebidos}` : '—')
        });
      });
    });

    items.sort((a, b) =>
      (prio[a.tipoCola] ?? 9) - (prio[b.tipoCola] ?? 9)
      || b.ptsEnRiesgo - a.ptsEnRiesgo
      || b.segTarde - a.segTarde
    );
    return items;
  },

  auditoriaGlobal(usuarios, todasPred, resultados, ajustes, puntosManuales) {
    const problemas = [];
    const sinFinalizar = [];
    const participantes = [];

    this._partidosUnicos(ajustes, { resultados }).forEach(pe => {
      const resCanon = this._resultadoCanonico(resultados, pe, ajustes);
      if (!resCanon && Object.keys(resultados).some(pid => {
        const p = FIXTURE.porId(pid);
        if (!p) return false;
        const px = this.conAjustes(p, ajustes);
        return U.clavePartidoDuplicado(px) === U.clavePartidoDuplicado(pe) && resultados[pid]?.gl != null;
      })) {
        problemas.push({
          tipo: 'resultado_slot', severidad: 'alta',
          partido: `${FIXTURE.equipo(pe.local).n} vs ${FIXTURE.equipo(pe.visitante).n}`,
          detalle: 'Marcador en slot duplicado — revisar en Resultados'
        });
      }
      if (resCanon && resCanon.estado !== 'finalizado' && resCanon.gl != null) {
        sinFinalizar.push(`${FIXTURE.equipo(pe.local).n} vs ${FIXTURE.equipo(pe.visitante).n} (${resCanon.estado})`);
      }
    });

    usuarios.filter(u => u.estado === 'activo').forEach(u => {
      const d = this.desgloseCompleto(u.uid, u, todasPred, resultados, ajustes, puntosManuales);
      const alertas = d.filas.filter(f => f.auditoria.revisar);
      if (alertas.length || u.intentosTrampa || u.marcaTrampa) {
        participantes.push({
          uid: u.uid,
          nombre: u.nombre,
          pts: d.pts,
          conPuntos: d.resumenAuditoria.conPuntos,
          revisar: d.resumenAuditoria.revisar,
          tarde: d.resumenAuditoria.tarde,
          pendientes: d.resumenAuditoria.pendientes,
          intentosTrampa: u.intentosTrampa || 0,
          marcaTrampa: u.marcaTrampa || ''
        });
      }
      alertas.forEach(f => {
        problemas.push({
          tipo: f.auditoria.estado,
          severidad: f.auditoria.estado === 'tarde' || f.auditoria.estado === 'pendiente' ? 'alta' : 'media',
          usuario: u.nombre,
          partido: f.partido,
          detalle: f.auditoria.etiqueta + (f.auditoria.sospechas.length ? ' · ' + f.auditoria.sospechas.join('; ') : '')
        });
      });
    });

    participantes.sort((a, b) => b.revisar - a.revisar || b.tarde - a.tarde);
    return {
      problemas,
      sinFinalizar,
      participantes,
      resumen: `${participantes.length} participante(s) con algo que revisar · ${problemas.length} caso(s) · ${sinFinalizar.length} partido(s) sin finalizar`
    };
  },

  _resolverPartidoPred(pid, pr, ajustes, resultados) {
    const base = FIXTURE.porId(pid);
    if (!base) return null;
    if (base.fase === 'grupos') {
      const pe = this.conAjustes(base, ajustes);
      return pe.local && pe.visitante && pe.local !== 'Por definir' ? pe : null;
    }

    let pe = this.conAjustes(base, ajustes);
    if (pe.local && pe.visitante && pe.local !== 'Por definir') {
      if (U.esParejaFaseGrupos(pe.local, pe.visitante) && base.ronda !== '16avos') {
        return U.partidoGruposPorPareja(pe.local, pe.visitante);
      }
      return pe;
    }

    /* Pronóstico en slot KO vacío (p. ej. ko-90): inferir partido de grupos por marcador real. */
    if (base.fase === 'eliminatorias' && base.ronda !== '16avos') {
      let mejor = null;
      let mejorPts = -1;
      for (const p of FIXTURE.partidos) {
        if (p.fase !== 'grupos') continue;
        const px = this.conAjustes(p, ajustes);
        const res = this._resultadoCanonico(resultados, px, ajustes);
        if (!res || res.estado !== 'finalizado') continue;
        if (!U.pronosticoCuenta(pr, px)) continue;
        const cal = this.calificar(pr, res, px.fase, px);
        if (cal.pts > mejorPts) {
          mejorPts = cal.pts;
          mejor = px;
        }
      }
      if (mejor) return mejor;
    }

    const eq = U.equiposOficialSlotKo(pid);
    if (eq) {
      pe = { ...pe, local: eq[0], visitante: eq[1] };
      const cierre = U.calcCierreMs(pe);
      if (cierre != null) pe.cierreMs = cierre;
      return pe;
    }

    const resPid = resultados?.[pid];
    if (resPid?.estado === 'finalizado') {
      for (const p of FIXTURE.partidos) {
        if (p.fase === 'grupos') continue;
        const px = this.conAjustes(p, ajustes);
        if (!px.local || !px.visitante || px.local === 'Por definir') continue;
        if (U.esParejaFaseGrupos(px.local, px.visitante)) continue;
        const res = this._resultadoCanonico(resultados, px, ajustes);
        if (!res || res.estado !== 'finalizado') continue;
        if (res.gl !== resPid.gl || res.gv !== resPid.gv) continue;
        return px;
      }
    }

    let mejor = null;
    let mejorPts = -1;
    for (const p of FIXTURE.partidos) {
      if (p.fase === 'grupos') continue;
      const px = this.conAjustes(p, ajustes);
      if (!px.local || !px.visitante || px.local === 'Por definir') continue;
      if (U.esParejaFaseGrupos(px.local, px.visitante)) continue;
      const res = this._resultadoCanonico(resultados, px, ajustes);
      if (!res || res.estado !== 'finalizado') continue;
      if (!U.pronosticoCuenta(pr, px)) continue;
      const cal = this.calificar(pr, res, px.fase, px);
      if (cal.pts > mejorPts) {
        mejorPts = cal.pts;
        mejor = px;
      }
    }
    return mejor;
  },

  _clavePartidoEfectivo(pe) {
    if (!pe?.local || !pe?.visitante || pe.local === 'Por definir') return '';
    return pe.fase === 'eliminatorias'
      ? U.claveParejaKo(pe.local, pe.visitante)
      : U.clavePartidoDuplicado(pe);
  },

  /* Suma puntos recorriendo PRONÓSTICOS (mapa para racha y comparación). */
  _puntosDesdePredicciones(preds, resultados, ajustes) {
    const mejorPorClave = new Map();
    for (const [pid, pr] of Object.entries(preds || {})) {
      const pe = this._resolverPartidoPred(pid, pr, ajustes, resultados);
      if (!pe?.local || !pe?.visitante || pe.local === 'Por definir') continue;
      const clave = this._clavePartidoEfectivo(pe);
      if (!clave || clave.startsWith('id:')) continue;
      const res = this._resultadoCanonico(resultados, pe, ajustes);
      if (!res || res.estado !== 'finalizado') continue;
      if (!U.pronosticoCuenta(pr, pe)) continue;
      const cal = this.calificar(pr, res, pe.fase, pe);
      const prev = mejorPorClave.get(clave);
      if (!prev || cal.pts > prev.cal.pts || (cal.pts === prev.cal.pts && (pr.t || 0) > (prev.pr.t || 0))) {
        mejorPorClave.set(clave, { cal, pr, pe });
      }
    }
    let pts = 0, exactos = 0, aciertos = 0, jugadas = 0;
    for (const { cal, pr } of mejorPorClave.values()) {
      pts += cal.pts;
      if (cal.tipo === 'exacto') exactos++;
      if (cal.tipo === 'resultado') aciertos++;
      if (pr) jugadas++;
    }
    return { pts, exactos, aciertos, jugadas, mejorPorClave };
  },

  tabla(usuarios, todasPred, resultados, ajustes, puntosManuales, opts = {}) {
    const pidsConPred = this._pidsConPredDe(todasPred);
    const partidosBase = this._partidosUnicos(ajustes, { resultados, pidsConPred });
    const resPorPartido = new Map();
    for (const pe of partidosBase) {
      resPorPartido.set(pe.id, this._resultadoCanonico(resultados, pe, ajustes));
    }
    const finalizadosOrd = opts.sinRacha ? [] : partidosBase
      .filter(pe => resPorPartido.get(pe.id)?.estado === 'finalizado')
      .sort((a, b) => (b.utc || b.fecha + 'Z').localeCompare(a.utc || a.fecha + 'Z'));
    const filas = usuarios
      .filter(u => u.estado === 'activo')
      .map(u => {
        const preds = todasPred[u.uid] || {};
        const d = this.desgloseCompleto(u.uid, u, todasPred, resultados, ajustes, puntosManuales);
        const sum = this._puntosDesdePredicciones(preds, resultados, ajustes);
        const pts = d.pts;
        const exactos = d.exactos;
        const aciertos = d.aciertos;
        const jugadas = d.resumenAuditoria.conPuntos;
        const bono = d.bono || 0;

        let racha = 0;
        if (!opts.sinRacha && finalizadosOrd.length) {
          const vistosRacha = new Set();
          for (const pe of finalizadosOrd) {
            const clave = U.clavePartidoDuplicado(pe);
            if (vistosRacha.has(clave)) continue;
            vistosRacha.add(clave);
            const hit = sum.mejorPorClave.get(
              pe.fase === 'eliminatorias'
                ? U.claveParejaKo(pe.local, pe.visitante)
                : clave
            );
            if (!hit) break;
            if (hit.cal.pts > 0) racha++; else break;
          }
        }

        return {
          uid: u.uid, nombre: u.nombre, area: u.area, vinculo: u.vinculo,
          moneda: u.moneda, pagado: !!u.pagado, campeon: u.campeon,
          pts, exactos, aciertos, jugadas, bono, racha, creado: u.creado || 0,
          intentosTrampa: u.intentosTrampa || 0,
          marcaTrampa: u.marcaTrampa || ''
        };
      })
      .sort((a, b) =>
        b.pts - a.pts || b.exactos - a.exactos || b.aciertos - a.aciertos || a.creado - b.creado
      );
    filas.forEach((f, i) => { f.pos = i + 1; });
    return filas;
  },

  /* Tablas de los 12 grupos del Mundial con los partidos finalizados. */
  gruposMundial(resultados) {
    const tablas = {};
    Object.entries(FIXTURE.grupos).forEach(([g, codes]) => {
      const f = {};
      codes.forEach(c => f[c] = { code: c, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0 });
      FIXTURE.partidos.filter(p => p.fase === 'grupos' && p.grupo === g).forEach(p => {
        const r = resultados[p.id];
        if (!r || r.estado !== 'finalizado') return;
        const L = f[p.local], V = f[p.visitante];
        L.pj++; V.pj++; L.gf += r.gl; L.gc += r.gv; V.gf += r.gv; V.gc += r.gl;
        if (r.gl > r.gv) { L.pg++; V.pp++; }
        else if (r.gl < r.gv) { V.pg++; L.pp++; }
        else { L.pe++; V.pe++; }
      });
      tablas[g] = Object.values(f)
        .map(t => ({ ...t, dg: t.gf - t.gc, pts: t.pg * 3 + t.pe }))
        .sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.code.localeCompare(b.code));
    });
    return tablas;
  },

  /* Bote y reparto por moneda (para la página de cuentas). */
  bote(usuarios, salaConfig) {
    const porMoneda = {};
    if (salaConfig && salaConfig.cuota > 0) {
      // Sala privada con cuota específica
      const m = porMoneda[salaConfig.moneda] = { total: 0, pagado: 0, personas: 0, alDia: 0 };
      const cuota = salaConfig.cuota;
      usuarios.filter(u => u.estado === 'activo').forEach(u => {
        m.personas++;
        m.total += cuota;
        if (u.pagado) {
          m.pagado += cuota;
          m.alDia++;
        }
      });
    } else {
      // Sala principal, usa cuotas globales por moneda de usuario
      usuarios.filter(u => u.estado === 'activo').forEach(u => {
        const m = porMoneda[u.moneda] = porMoneda[u.moneda] || { total: 0, pagado: 0, personas: 0, alDia: 0 };
        const cuota = (CONFIG.CUOTAS[u.moneda] || { valor: 0 }).valor;
        m.personas++; m.total += cuota;
        if (u.pagado) { m.pagado += cuota; m.alDia++; }
      });
    }
    return porMoneda;
  },

  /* Últimos N partidos finalizados de un equipo (V=Victoria, E=Empate, D=Derrota). */
  formaEquipo(codigo, resultados, limite = 5) {
    if (!codigo) return [];
    return FIXTURE.partidos
      .filter(p => (p.local === codigo || p.visitante === codigo) && resultados[p.id]?.estado === 'finalizado')
      .sort((a, b) => (b.utc || b.fecha + 'Z').localeCompare(a.utc || a.fecha + 'Z'))
      .slice(0, limite)
      .map(p => {
        const r = resultados[p.id];
        const esLocal = p.local === codigo;
        const gf = esLocal ? r.gl : r.gv;
        const gc = esLocal ? r.gv : r.gl;
        if (gf > gc) return 'V';
        if (gf < gc) return 'D';
        return 'E';
      });
  },

  /* % de la comunidad que acertó el ganador en la jornada anterior (misma fase/grupo). */
  historialComunidad(p, predsByPartido, resultados) {
    const candidatos = FIXTURE.partidos
      .filter(x => x.fase === p.fase && x.id !== p.id && resultados[x.id]?.estado === 'finalizado')
      .filter(x => p.fase === 'grupos' ? x.grupo === p.grupo && x.jornada < p.jornada : true)
      .sort((a, b) => (b.utc || b.fecha + 'Z').localeCompare(a.utc || a.fecha + 'Z'));

    const jornadaRef = p.fase === 'grupos' ? p.jornada - 1 : null;
    const partidosJornada = jornadaRef
      ? candidatos.filter(x => x.jornada === jornadaRef)
      : candidatos.slice(0, 4);

    if (!partidosJornada.length) return null;

    let totalPreds = 0, aciertos = 0;
    partidosJornada.forEach(part => {
      const res = resultados[part.id];
      const signoReal = this.signo(res.gl, res.gv);
      (predsByPartido[part.id] || []).forEach(pr => {
        totalPreds++;
        if (this.signo(pr.gl, pr.gv) === signoReal) aciertos++;
      });
    });

    if (!totalPreds) return null;
    const pct = Math.round((aciertos / totalPreds) * 100);
    const label = p.fase === 'grupos' && jornadaRef
      ? `Jornada ${jornadaRef}`
      : 'últimos partidos';
    return { pct, label, partidos: partidosJornada.length };
  }
};
window.Puntos = Puntos;
