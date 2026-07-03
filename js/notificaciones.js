/* ============================================================
   POLLA SIIGO 2026 — SISTEMA DE NOTIFICACIONES EN VIVO
   Detecta cambios en partidos y envía notificaciones:
   - Goles
   - Tarjetas rojas
   - Expulsiones
   - Partidos finalizados
   - Partidos que se abren para pronosticar
   ============================================================ */

const Notifica = {
  estadoAnterior: null,
  
  iniciar() {
    console.log('🔔 Sistema de notificaciones iniciado');
    // Solicitar permiso para notificaciones del navegador
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  },
  
  limpiarEstado(resultados) {
    // Guardar estado inicial para detectar cambios futuros
    this.estadoAnterior = JSON.parse(JSON.stringify(resultados));
  },
  
  detectarCambios(resultadosActuales, usuario, partidos, prediccionesUsuario) {
    if (!this.estadoAnterior) {
      return { goles: [], rojas: [], finalizados: [], abiertos: [] };
    }
    
    const cambios = {
      goles: [],
      rojas: [],
      finalizados: [],
      abiertos: []
    };
    
    // Detectar cambios en cada partido
    for (const pid in resultadosActuales) {
      const resActual = resultadosActuales[pid];
      const resAnterior = this.estadoAnterior[pid] || {};
      
      // Detectar nuevos goles
      if (resActual.gl !== resAnterior.gl || resActual.gv !== resAnterior.gv) {
        const partido = partidos.find(p => p.id === pid);
        if (partido && resActual.estado === 'en_juego') {
          const diffLocal = (resActual.gl || 0) - (resAnterior.gl || 0);
          const diffVisitante = (resActual.gv || 0) - (resAnterior.gv || 0);
          
          if (diffLocal > 0) {
            cambios.goles.push({
              partido, equipo: partido.local,
              marcadorActual: `${resActual.gl} - ${resActual.gv}`
            });
          }
          if (diffVisitante > 0) {
            cambios.goles.push({
              partido, equipo: partido.visitante,
              marcadorActual: `${resActual.gl} - ${resActual.gv}`
            });
          }
        }
      }
      
      // Detectar tarjetas rojas (en eventos)
      if (resActual.eventos) {
        const eventosAnteriores = resAnterior.eventos || [];
        const eventosNuevos = resActual.eventos.filter(e =>
          !eventosAnteriores.some(ae => ae.j === e.j && ae.m === e.m && ae.t === e.t)
        );
        
        eventosNuevos.forEach(ev => {
          if (ev.t === 'roja') {
            const partido = partidos.find(p => p.id === pid);
            if (partido) {
              cambios.rojas.push({
                partido,
                jugador: ev.j,
                equipo: ev.eq,
                minuto: ev.m
              });
            }
          }
        });
      }
      
      // Detectar partidos finalizados
      if (resActual.estado === 'finalizado' && resAnterior.estado !== 'finalizado') {
        const partido = partidos.find(p => p.id === pid);
        if (partido) {
          cambios.finalizados.push({
            partido,
            marcador: `${resActual.gl} - ${resActual.gv}`
          });
        }
      }
    }
    
    // Detectar partidos que se abren (de cerrado a programado)
    // Nota: partidos aplazados NO se consideran abiertos para pronósticos
    for (const partido of partidos) {
      const resActual = resultadosActuales[partido.id];
      const resAnterior = this.estadoAnterior[partido.id];
      
      const estadoActual = U.estadoPartido(partido, resActual);
      const estadoAnterior = U.estadoPartido(partido, resAnterior);
      
      // Si estaba cerrado y ahora está programado (no aplazado)
      if ((estadoAnterior === 'cerrado' || !estadoAnterior) && 
          estadoActual === 'programado') {
        cambios.abiertos.push({
          partido,
          estado: estadoActual
        });
      }
    }
    
    return cambios;
  },
  
  notificarCambios(cambios, usuario, prediccionesUsuario) {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      console.log('🔔 Notificaciones no disponibles o no autorizadas');
      return;
    }
    
    // Notificar goles
    cambios.goles.forEach(c => {
      const L = window.FIXTURE.equipo(c.partido.local);
      const V = window.FIXTURE.equipo(c.partido.visitante);
      const nombreEquipoGol = window.FIXTURE.equipo(c.equipo)?.n || c.equipo;
      
      const titulo = `⚽ ¡GOL de ${nombreEquipoGol}!`;
      const cuerpo = `Marcador: ${L.n} vs ${V.n} ahora está ${c.marcadorActual}`;
      
      new Notification(titulo, {
        body: cuerpo,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: `gol-${c.partido.id}-${c.marcadorActual}`
      });

      // Reproducir sonido de gol
      const audio = document.getElementById('sonido-gol');
      if (audio) {
        audio.play().catch(error => {
          // La reproducción automática puede ser bloqueada por el navegador
          console.warn("No se pudo reproducir el sonido de gol:", error);
        });
      }
    });
    
    // Notificar tarjetas rojas
    cambios.rojas.forEach(c => {
      const nombreEquipo = window.FIXTURE.equipo(c.equipo)?.n || c.equipo;
      const titulo = `🟥 Tarjeta roja para ${nombreEquipo}`;
      const cuerpo = `Expulsado: ${c.jugador} (${c.minuto}')`;
      
      new Notification(titulo, {
        body: cuerpo,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: `roja-${c.partido.id}-${c.jugador}`
      });
    });
    
    // Notificar partidos finalizados
    cambios.finalizados.forEach(c => {
      const L = window.FIXTURE.equipo(c.partido.local);
      const V = window.FIXTURE.equipo(c.partido.visitante);
      const titulo = `🏁 Partido finalizado`;
      const cuerpo = `${L.n} ${c.marcador} ${V.n}`;
      
      new Notification(titulo, {
        body: cuerpo,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: `finalizado-${c.partido.id}`,
        requireInteraction: true
      });
    });
    
    // Notificar partidos que se abren
    cambios.abiertos.forEach(c => {
      const L = window.FIXTURE.equipo(c.partido.local);
      const V = window.FIXTURE.equipo(c.partido.visitante);
      const titulo = `🔓 Partido disponible`;
      const cuerpo = `${L.n} vs ${V.n} - ¡Pronostica ahora!`;
      
      new Notification(titulo, {
        body: cuerpo,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: `abierto-${c.partido.id}`
      });
    });
  },
  
  iniciarRecordatorios(usuario, getPartidos, getResultados, getPredicciones) {
    const claveEmail = uid => `email_rec_${uid}`;
    const enviadosEmail = JSON.parse(localStorage.getItem(claveEmail(usuario.uid)) || '{}');

    const partidosPendientes = () => {
      const partidos = typeof getPartidos === 'function' ? getPartidos() : getPartidos;
      const resultados = typeof getResultados === 'function' ? getResultados() : getResultados;
      const prediccionesUsuario = typeof getPredicciones === 'function' ? getPredicciones() : getPredicciones;
      return (partidos || []).filter(p => {
        const res = resultados[p.id];
        if (U.abierto(p, res) !== true) return false;
        if (prediccionesUsuario[p.id]) return false;
        const cierre = U.cierrePronosticoMs(p);
        if (!cierre) return false;
        const restante = cierre - Date.now();
        return restante > 0 && restante < 2 * 60 * 60 * 1000;
      });
    };

    const notificar = async () => {
      const pendientes = partidosPendientes();
      if (!pendientes.length) return;

      /* Notificación del navegador */
      if (Notification.permission === 'granted') {
        const titulo = `⏰ ¡Te faltan ${pendientes.length} pronóstico(s)!`;
        const cuerpo = pendientes.slice(0, 2).map(p => {
          const L = window.FIXTURE.equipo(p.local), V = window.FIXTURE.equipo(p.visitante);
          return `${L.n} vs ${V.n}`;
        }).join(' · ') + (pendientes.length > 2 ? '…' : '');
        new Notification(titulo, {
          body: cuerpo,
          icon: 'icons/icon-192.png',
          badge: 'icons/icon-192.png',
          tag: 'recordatorio-pronosticos'
        });
      }

      /* Correo personalizado (máx. 1 por partido por usuario) */
      const porEnviar = pendientes.filter(p => !enviadosEmail[p.id]);
      if (porEnviar.length && usuario.correo && window.Email?.configurado()) {
        try {
          const r = await Email.recordatorioPersonalizado(usuario, porEnviar);
          if (r.enviado) {
            porEnviar.forEach(p => { enviadosEmail[p.id] = Date.now(); });
            localStorage.setItem(claveEmail(usuario.uid), JSON.stringify(enviadosEmail));
            console.log('✉ Recordatorio personalizado enviado a', usuario.correo);
          }
        } catch (e) {
          console.warn('No se pudo enviar recordatorio por correo:', e);
        }
      }
    };

    /* Primera comprobación a los 30 s, luego cada 5 min */
    setTimeout(notificar, 30000);
    setInterval(notificar, 5 * 60 * 1000);
  }
};

window.Notifica = Notifica;
