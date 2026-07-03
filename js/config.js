// js/config.js
export const CONFIG = {
    MODO: 'firebase', // 👈 Asegúrate de cambiarlo de 'demo' a 'firebase'
    URL_PUBLICA: 'https://polla-mundialista-siigo.web.app',
    DOMINIO_EMPRESA: 'siigo.com',
    APROBAR_EXTERNOS_AUTO: true,
    
    // 👇 Aquí quedan tus credenciales reales de Google
    FIREBASE: {
        apiKey: "AIzaSyCBuA2VZb8ipHhL5fQq8irP_yo2S093MMI",
        authDomain: "polla-mundialista-siigo.firebaseapp.com",
        projectId: "polla-mundialista-siigo",
        storageBucket: "polla-mundialista-siigo.firebasestorage.app",
        messagingSenderId: "484395395836",
        appId: "1:484395395836:web:13a9144604e6fe010f4579"
    },

    ADMINS: [
        'nicolas.nieto@siigo.com',
        'juan.rodriguez.pe@siigo.com' // Tu correo de administrador
    ],
    /* ----------------------------------------------------------
       4. CORREOS (EmailJS — https://www.emailjs.com)
       Plan gratuito: 200 correos/mes. Ver README para crear las
       3 plantillas. Si se deja vacío, la app simplemente no envía
       correos (no falla).
    ---------------------------------------------------------- */
  EMAILJS: {
    publicKey: 'xS4hfhsR687frj7Go',
    serviceId: 'service_xl4ducr',
    plantillas: {
      bienvenida: 'template_wb45nao',   // 👈 CAMBIA ESTO por el ID real de la plantilla de bienvenida
      recordatorio: 'template_co7pdcn', // 👈 CAMBIA ESTO por el ID real de la plantilla de recordatorio
      resumen: 'template_3456789'       // 👈 CAMBIA ESTO por el ID real de la plantilla de resumen
    }
  },

  /* ----------------------------------------------------------
     5. RESULTADOS EN VIVO
     La llave del proveedor de datos NUNCA va aquí (sería pública).
     Va en el proxy (proxy/cloudflare-worker.js). Aquí solo se
     pega la URL del Worker una vez desplegado.
     Proveedor recomendado: API-Football (api-sports.io).
     Plan Pro (~7.500 req/día): sync en vivo cada 15–30 s durante partidos.
  ---------------------------------------------------------- */
  API_FUTBOL: {
    // El proxy se usa para la sincronización de marcadores y datos.
    proxyUrl: 'https://poya-siigo.vercel.app', // 👈 URL del proxy en Vercel
    // La API Key ya no es necesaria aquí. El nuevo widget se autentica por dominio
    // y el proxy de Vercel tiene la llave guardada como secreto. ¡Más seguro!
    apiKey: '',
    planPro: true,                // Plan API-Sports Pro (~7.500 req/día) — permite sync más frecuente en vivo
    intervaloSegundos: 30,        // Refresco base con partido en vivo (admin). Mín. 15s en código.
    sincronizaCalendario: true    // permite al admin traer fechas/horas oficiales
  },

  /* ----------------------------------------------------------
     6. REGLAS DE PUNTUACIÓN (editable antes del primer partido)
  ---------------------------------------------------------- */
  REGLAS: {
    grupos:        { exacto: 3, resultado: 1 },  // marcador exacto / acertar ganador o empate
    eliminatorias: { exacto: 5, resultado: 2 },  // se califica el marcador a los 90' (+prórroga si la hay, sin penales)
    bonusCampeon: 10,                            // por acertar el campeón (se elige antes del primer partido)
    cierreCampeonUTC: '2026-06-19T23:59:59Z',     // Extendido al 19 de junio 2026 (23:59 Colombia)
    verPronosticosAntesDeCierre: false           // Permite ver pronósticos de otros antes del cierre. Poner en `true` para permitirlo.
  },

  /* Desempates, en orden: 1) puntos, 2) marcadores exactos,
     3) aciertos de resultado, 4) registro más antiguo. */

  /* ----------------------------------------------------------
     7. LA PLATA — solo registro, NO se hacen transacciones aquí.
     Cada quien elige su moneda al registrarse y paga la cuota
     equivalente por fuera de la app (Nequi, transferencia, etc.)
     al tesorero. Valores editables.
  ---------------------------------------------------------- */
  CUOTAS: {
    COP: { valor: 20000, simbolo: '$',   nombre: 'Peso colombiano' },
    MXN: { valor: 220,   simbolo: '$',   nombre: 'Peso mexicano' },
    CLP: { valor: 11000, simbolo: '$',   nombre: 'Peso chileno' },
    UYU: { valor: 500,   simbolo: '$U',  nombre: 'Peso uruguayo' },
    VES: { valor: 1300,  simbolo: 'Bs.', nombre: 'Bolívar venezolano' },
    ARS: { valor: 16000, simbolo: '$',   nombre: 'Peso argentino' },
    PEN: { valor: 45,    simbolo: 'S/',  nombre: 'Sol peruano' },
    USD: { valor: 12,    simbolo: 'US$', nombre: 'Dólar' },
    EUR: { valor: 11,    simbolo: '€',   nombre: 'Euro' }
  },
  TESORERO: 'Nicolás Nieto Daza (Soporte IT)',

  /* Reparto de la vaca (acumulado) en porcentajes (deben sumar 100). */
  PREMIOS: [
    { puesto: '🥇 1.er lugar', pct: 70 },
    { puesto: '🥈 2.º lugar', pct: 20 },
    { puesto: '🥉 3.er lugar', pct: 10 }
  ],

  /* ----------------------------------------------------------
     8. ANÁLISIS IA (vía Cloudflare Worker)
     Sigue las instrucciones en /proxy/ia-worker.js para desplegar
     el proxy que se conecta a un modelo como Claude de Anthropic.
  ---------------------------------------------------------- */
  IA: {
    proxyUrl: 'https://poya-siigo.vercel.app/api/ia', // 👈 URL del proxy de IA en Vercel
  },

  /* ----------------------------------------------------------
     9. VARIOS
  ---------------------------------------------------------- */
  MAX_GOLES: 15,                                // tope del marcador en un pronóstico
  APP_VERSION: '2026.07.03-premios-702010',     // bump al desplegar → invalida caché móvil
  VERSION: '1.0.0'
};

/* No editar debajo de esta línea -------------------------- */
Object.freeze(CONFIG.REGLAS);
window.CONFIG = CONFIG;
document.dispatchEvent(new Event('polla-config-ready'));
