/* ============================================================
   POLLA SIIGO 2026 — PROXY DE RESULTADOS EN VIVO
   Cloudflare Worker (plan gratuito: 100.000 peticiones/día)
   ------------------------------------------------------------
   ¿Para qué existe? La llave de API-Football NO puede ir en el
   código del navegador (cualquiera la vería y la gastaría).
   Este Worker la guarda como secreto, consulta la API y cachea
   la respuesta 30 segundos para que 200 empleados mirando la
   polla no quemen el plan gratuito (100 peticiones/día a la API).

   DESPLIEGUE (5 minutos, ver README sección 6):
     npm i -g wrangler
     wrangler login
     wrangler deploy proxy/cloudflare-worker.js --name polla-proxy
     wrangler secret put API_FOOTBALL_KEY        ← pega la llave
     (opcional) wrangler secret put ORIGEN_PERMITIDO
                ej: https://polla.siigo.com
   Luego copia la URL del Worker en CONFIG.API_FUTBOL.proxyUrl.
   ============================================================ */

const API_BASE = 'https://v3.football.api-sports.io';
const CACHE_SEGUNDOS = 30;

export default {
  async fetch(peticion, env, ctx) {
    const url = new URL(peticion.url);
    const origen = peticion.headers.get('Origin') || '';
    const permitido = (env.ORIGEN_PERMITIDO || ''); // No permitir '*' por defecto por seguridad
    const cors = {
      'Access-Control-Allow-Origin':
        (origen === permitido) ? origen : '', // Solo permitir el origen exacto
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };

    if (peticion.method === 'OPTIONS') return new Response(null, { headers: cors });

    if (peticion.method !== 'GET') {
      return new Response('Método no permitido', { status: 405, headers: cors });
    }

    if (!env.API_FOOTBALL_KEY) {
      return new Response(JSON.stringify({ error: 'Falta el secreto API_FOOTBALL_KEY en el Worker.' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Construir la URL de la API de forma dinámica
    const upstreamUrl = new URL(API_BASE + url.pathname);
    url.searchParams.forEach((value, key) => {
      upstreamUrl.searchParams.set(key, value);
    });

    // Lógica de caché genérica
    const cache = caches.default;
    const claveCache = new Request(upstreamUrl.toString(), { method: 'GET' });
    let respuesta = await cache.match(claveCache);

    if (!respuesta) {
      const r = await fetch(upstreamUrl.toString(), {
        headers: { 'x-apisports-key': env.API_FOOTBALL_KEY }
      });
      const cuerpo = await r.text();
      respuesta = new Response(cuerpo, {
        status: r.status,
        headers: {
          ...r.headers, // Pasar las cabeceras originales
          'Content-Type': r.headers.get('Content-Type') || 'application/json',
          'Cache-Control': `public, max-age=${CACHE_SEGUNDOS}`
        }
      });
      if (r.ok) ctx.waitUntil(cache.put(claveCache, respuesta.clone()));
    }

    const final = new Response(respuesta.body, respuesta);
    // Aplicar cabeceras CORS a la respuesta final (sea de caché o de red)
    Object.entries(cors).forEach(([k, v]) => final.headers.set(k, v));
    return final;
  }
};
