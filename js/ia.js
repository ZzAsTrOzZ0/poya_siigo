/* ============================================================
   POLLA SIIGO 2026 — MÓDULO IA
   Llama al Cloudflare Worker proxy que habla con Claude.
   Requiere CONFIG.IA.proxyUrl configurado en config.js.
   ============================================================ */

const IA = {

  disponible() {
    return !!(window.CONFIG?.IA?.proxyUrl);
  },

  async analizar(prompt) {
    if (!this.disponible()) {
      throw new Error('Configura CONFIG.IA.proxyUrl en js/config.js con la URL del Worker de Cloudflare.');
    }
    let resp;
    try {
      resp = await fetch(CONFIG.IA.proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          sistema: 'Eres un analista deportivo experto en fútbol mundial y pronosticador profesional. Responde siempre en español con formato Markdown: usa tablas, encabezados ##, viñetas y negritas para que el reporte sea visual y fácil de leer.'
        })
      });
    } catch (_) {
      throw new Error('No se pudo conectar con el servicio de IA. Intenta más tarde.');
    }
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Error desconocido' }));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    return data.texto || '';
  },

  /* Convierte Markdown básico a HTML seguro para mostrar en el modal */
  mdAHtml(md) {
    if (!md) return '';
    let h = md
      // Tablas
      .replace(/^\|(.+)\|\s*$/gm, '<tr>$1</tr>')
      .replace(/<tr>(.+)<\/tr>/g, m =>
        '<tr>' + m.slice(4, -5).split('|').filter(Boolean).map(c =>
          c.trim().match(/^[-:]+$/) ? '' : `<td>${c.trim()}</td>`
        ).join('') + '</tr>')
      // Encabezados
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3 style="color:var(--dorado);margin:18px 0 8px">$1</h3>')
      .replace(/^# (.+)$/gm, '<h2 style="color:var(--dorado);margin:20px 0 10px">$1</h2>')
      // Negritas e itálicas
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.+?)\*/g, '<i>$1</i>')
      // Viñetas
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/^• (.+)$/gm, '<li>$1</li>')
      // Separadores
      .replace(/^---+$/gm, '<hr style="border-color:var(--linea);margin:12px 0">')
      // Párrafos
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br>');

    // Envolver listas
    h = h.replace(/(<li>.*?<\/li>)+/gs, m => `<ul style="margin:8px 0 8px 20px;line-height:1.8">${m}</ul>`);
    // Envolver filas de tabla
    h = h.replace(/(<tr>.*?<\/tr>)+/gs, m => `<div class="tabla-envoltura" style="margin:10px 0"><table class="tabla" style="margin:0">${m}</table></div>`);

    return `<p>${h}</p>`;
  },

  /* ---- Generadores de prompts ---- */

  promptEquipo(codigo) {
    const eq = FIXTURE.equipos[codigo];
    if (!eq) return null;
    const grupo = eq.g;
    const rivales = Object.entries(FIXTURE.equipos)
      .filter(([c, e]) => e.g === grupo && c !== codigo)
      .map(([c, e]) => e.n_en);
    const partidos = FIXTURE.partidos
      .filter(p => (p.local === codigo || p.visitante === codigo) && p.fase === 'grupos')
      .map(p => {
        const rival = p.local === codigo ? p.visitante : p.local;
        const r = FIXTURE.equipos[rival];
        return `- vs ${r?.n_en || rival} (${p.utc ? new Date(p.utc).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : 'fecha TBD'})`;
      }).join('\n');

    return `Rol: Actúa como un analista de datos deportivos experto y pronosticador profesional de fútbol.

Equipo a analizar: **${eq.n_en} (${codigo})**
Grupo ${grupo}: ${rivales.join(', ')} y ${eq.n_en}
Partidos de fase de grupos:
${partidos}

Realiza un análisis estructurado y profundo con obligatoriamente estas 5 secciones:

## 1. Métricas de Rendimiento Reciente
Incluye estilo de juego dominante, promedio de goles anotados/concedidos en clasificatorias o últimos 10 partidos, y efectividad en transiciones ofensivas. Presenta los datos clave en una tabla.

## 2. Fortalezas y Debilidades Clave
Factor táctico principal (presión alta, bloque bajo, etc.) y el talón de Aquiles del equipo (balón parado, falta de recambio en banca, etc.). Usa viñetas cortas.

## 3. Jugadores Clave — X-Factors
¿Quién es el motor del equipo? ¿Qué jugador subestimado puede cambiar un partido? Incluye posición, edad y estadística destacada.

## 4. Análisis de Contexto
Historial reciente contra rivales de nivel similar. Cómo les afecta el clima, la altitud o la localía en Estados Unidos/Canadá/México. Desafíos específicos de su grupo.

## 5. Pronóstico por Escenarios (probabilidades)
Presenta una tabla con:
| Escenario | Probabilidad | Condición táctica |
|---|---|---|
| Clasifica a octavos | X% | ... |
| Llega a cuartos | X% | ... |
| Llega a semis | X% | ... |
| Campeón | X% | ... |

Termina con una conclusión de 2-3 líneas con tu veredicto final como analista.`;
  },

  promptPartido(codigoLocal, codigoVisitante, fechaUtc) {
    const L = FIXTURE.equipos[codigoLocal];
    const V = FIXTURE.equipos[codigoVisitante];
    if (!L || !V) return null;
    const fecha = fechaUtc
      ? new Date(fechaUtc).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
      : 'fecha por confirmar';

    return `Rol: Actúa como un analista deportivo experto y pronosticador profesional de fútbol, especializado en el Mundial 2026.

Partido a analizar: **${L.n_en} vs ${V.n_en}**
Fecha: ${fecha} (hora Colombia)
Torneo: FIFA World Cup 2026

Proporciona un análisis comparativo profundo y un pronóstico estructurado con estas secciones obligatorias:

## 1. Comparativa de Equipos
Crea una tabla comparativa con estas métricas:
| Métrica | ${L.n_en} | ${V.n_en} |
|---|---|---|
| Estilo de juego | | |
| Fortaleza ofensiva | | |
| Solidez defensiva | | |
| Forma reciente | | |
| Jugador diferencial | | |

## 2. Claves Tácticas del Partido
- ¿Qué esquema usará cada equipo?
- ¿En qué zona del campo se decidirá el partido?
- ¿Qué hace bien cada equipo que puede explotar al rival?

## 3. Factor X — El Jugador Que Puede Decidirlo
Un jugador de cada equipo que puede cambiar el partido. Incluye por qué.

## 4. Historial y Contexto
- Enfrentamientos recientes entre ambos (últimos 5 si los hay).
- Cómo les favorece/perjudica la sede y condiciones climáticas.

## 5. Pronóstico con Probabilidades
| Resultado | Probabilidad |
|---|---|
| Victoria ${L.n_en} | X% |
| Empate | X% |
| Victoria ${V.n_en} | X% |

**Marcador más probable:** X – X
**Marcador alternativo:** X – X

Termina con tu análisis final: ¿quién tiene la ventaja y por qué tácticamente?`;
  }
};

window.IA = IA;
