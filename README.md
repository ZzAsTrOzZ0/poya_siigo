# ⚽ Polla Mundialista Siigo 2026

Aplicación web de polla futbolera para el Mundial FIFA 2026, hecha 100 % con
**HTML + CSS + JavaScript** (sin frameworks ni compiladores).

> Creada por **Nicolás Nieto Daza** y **Juan Rodríguez** — Área de Soporte IT, Siigo.

---

## 🚀 Probarla YA (modo demo, 0 minutos de configuración)

1. Abre `index.html` en el navegador (doble clic, o `npx serve .` si prefieres un servidor local).
2. Crea una cuenta con cualquier correo `@siigo.com` de los listados como admin en
   `js/config.js` (por defecto `nicolas.nieto@siigo.com`) para ver también el panel admin.
3. En **Admin → Cargar datos de ejemplo** tendrás 8 participantes ficticios con pronósticos,
   y con **▶ Simular** puedes ver un partido "en vivo" minuto a minuto.

En modo demo todo se guarda en el `localStorage` de **ese** navegador: perfecto para
probar, inútil para competir. Para que toda la empresa juegue, sigue la guía de
producción (≈ 30 minutos).

---

## 🗂 Estructura del proyecto

```
polla-siigo/
├─ index.html          Portada: registro e inicio de sesión + cuenta regresiva
├─ app.html            Partidos, pronósticos, marcadores en vivo, grupos, campeón
├─ tabla.html          Tabla de posiciones de la polla (con podio)
├─ cuentas.html        Bote por moneda, pagos y "quién le debe a quién"
├─ reglas.html         Reglas del juego
├─ admin.html          Panel de Soporte IT (resultados, gente, calendario, correos)
├─ css/estilos.css     Tema visual (variables ajustables al manual de marca)
├─ js/
│  ├─ config.js        ⭐ ÚNICO archivo a editar para producción
│  ├─ fixture.js       Los 104 partidos del Mundial 2026 (grupos verificados)
│  ├─ utils.js         Utilidades (fechas, seguridad, toasts)
│  ├─ store.js         Capa de datos: motor demo (localStorage) o Firebase
│  ├─ puntos.js        Motor de puntuación, tabla, grupos y bote
│  ├─ api-futbol.js    Marcadores en vivo vía proxy + simulador demo
│  └─ email.js         Correos con EmailJS (bienvenida, recordatorio, resumen)
├─ firebase/
│  ├─ firestore.rules  Reglas de seguridad (copiar/pegar en la consola)
│  └─ firebase.json    Configuración de Firebase Hosting
├─ proxy/cloudflare-worker.js   Proxy que protege la llave de la API de fútbol
└─ docs/               Documentación Word/PDF con diagramas
```

---

## 🏭 Puesta en producción (multiusuario real) — ~30 minutos

La app usa **Firebase** (gratis en estos volúmenes) para cuentas y datos compartidos,
**EmailJS** para correos y un **Cloudflare Worker** para los marcadores en vivo.
Todo tiene plan gratuito suficiente para cientos de participantes.

### 1) Crear el proyecto Firebase (10 min)

1. Entra a <https://console.firebase.google.com> → **Agregar proyecto** → nombre
   `polla-siigo` (la analítica es opcional).
2. **Authentication → Comenzar → Correo electrónico/contraseña → Habilitar**.
3. **Firestore Database → Crear base de datos → Producción** (ubicación
   `southamerica-east1` o la más cercana).
4. **Reglas** de Firestore: pega el contenido completo de `firebase/firestore.rules`
   y **Publica**.
5. En Firestore crea a mano la colección/documento de administradores:
   - Colección: `configuracion` → Documento: `admins`
   - Campo `correos` (tipo *array*): `nicolas.nieto@siigo.com`, `juan.rodriguez@siigo.com`
   - ⚠ En **minúsculas** y idénticos a `CONFIG.ADMINS` de `js/config.js`.
6. **Configuración del proyecto → Tus apps → Web (`</>`)** → registra la app y copia el
   bloque `firebaseConfig`.

### 2) Conectar la app (2 min)

En `js/config.js`:

```js
MODO: 'firebase',
FIREBASE: { apiKey: '...', authDomain: '...', projectId: '...', ... } // lo copiado
```

> La `apiKey` de Firebase **no es secreta**: identifica el proyecto; la seguridad
> real la dan las reglas de Firestore y Authentication.

### 3) Publicar el sitio con Firebase Hosting (5 min)

```bash
npm i -g firebase-tools
firebase login
cd polla-siigo
cp firebase/firebase.json .       # el archivo de hosting va en la raíz
firebase init hosting             # elegir proyecto existente, public: . , NO single-page
firebase deploy
```

Quedará en `https://polla-siigo.web.app`. Para el dominio corporativo:
**Hosting → Agregar dominio personalizado** → `polla.siigo.com` → crear el registro
CNAME que indica Firebase en el DNS de la empresa (lo gestiona el equipo de
infraestructura). El certificado HTTPS se emite solo. Actualiza `URL_PUBLICA` en
`js/config.js` y vuelve a desplegar.

### 4) Correos con EmailJS (8 min)

1. Cuenta gratis en <https://www.emailjs.com> (200 correos/mes).
2. **Email Services → Add New Service** → conecta el Gmail/Outlook que enviará
   (puede ser un buzón tipo `polla@siigo.com`).
3. **Email Templates** → crea 3 plantillas con estos campos (To Email = `{{correo}}`):

   | Plantilla     | Variables disponibles                                            |
   |---------------|------------------------------------------------------------------|
   | bienvenida    | `{{nombre}}`, `{{correo}}`, `{{url}}`                              |
   | recordatorio  | `{{nombre}}`, `{{correo}}`, `{{partidos}}`, `{{url}}`              |
   | resumen       | `{{nombre}}`, `{{correo}}`, `{{resultados}}`, `{{posicion}}`, `{{puntos}}`, `{{url}}` |

4. Copia en `js/config.js → EMAILJS`: la **Public Key** (Account → API Keys), el
   **Service ID** y los 3 **Template IDs**.
5. En EmailJS → Account → Security, restringe el uso a tu dominio (`polla.siigo.com`).

> ¿Más de 200 correos/mes? Alternativa gratuita: Brevo (300/día) vía su API, o enviar
> recordatorios solo a quienes tienen pronósticos pendientes (el panel ya genera la lista).

### 5) Marcadores en vivo (5 min)

1. Cuenta gratis en <https://www.api-football.com> (plan free: **100 peticiones/día**)
   → copia tu **API Key**.
2. Despliega el proxy (protege la llave y cachea 30 s):

```bash
npm i -g wrangler
wrangler login
wrangler deploy proxy/cloudflare-worker.js --name polla-proxy
wrangler secret put API_FOOTBALL_KEY      # pega aquí la llave
wrangler secret put ORIGEN_PERMITIDO      # ej: https://polla.siigo.com
```

3. Copia la URL del Worker (p. ej. `https://polla-proxy.TUCUENTA.workers.dev`) en
   `js/config.js → API_FUTBOL.proxyUrl`.

**Cómo se usa la cuota de 100 peticiones/día:** los espectadores **no** consultan la
API; solo el **admin** con el panel abierto y "📡 Marcador automático" encendido
sincroniza cada 60 s y escribe en Firestore, y todos los demás reciben los cambios en
tiempo real. Con `intervaloSegundos: 60` y ~90 min de partido, una jornada de 4–6
partidos cabe en la cuota. Si un día hay muchos partidos, sube el intervalo a 120 s
o sincroniza manualmente al medio tiempo y al final.

### 6) Lista de verificación de seguridad

- [x] Contraseñas gestionadas por **Firebase Authentication** (verificación de correo incluida).
- [x] **Reglas de Firestore**: cada quien edita solo su perfil y sus pronósticos; los
      pronósticos se bloquean en el servidor apenas el partido tiene marcador; el bono
      de campeón se cierra el 11-jun a las 19:00 UTC; resultados/calendario solo admins.
- [x] Llave de la API de fútbol **solo** en el Worker (secreto), nunca en el navegador.
- [x] Todo texto de usuario se escapa con `U.esc()` antes de pintarse (anti-XSS).
- [x] Cabeceras de seguridad en Hosting (`nosniff`, `DENY frames`, referrer policy).
- [x] Externos entran en estado **pendiente** hasta aprobación del admin.
- [ ] Restringir la API key de Firebase por dominio (Google Cloud → Credenciales) — opcional.
- [ ] Habilitar **App Check** si se quiere blindaje extra — opcional.

---

## 🛠 Operación durante el Mundial (guía rápida del admin)

| Cuándo | Qué hacer |
|---|---|
| Hoy | Cargar la app, registrar admins, enviar el enlace por Slack/Teams. |
| Al confirmar FIFA horarios | **Admin → Calendario** → "🔄 Sincronizar con API" (o editar a mano). |
| Antes de cada jornada | **Admin → Comunicaciones → Enviar recordatorio**. |
| Durante los partidos | Dejar abierto el panel con **📡 Marcador automático ON** (o cargar marcadores a mano). |
| Al cerrar grupos | **Admin → Calendario → Eliminatorias**: asignar los clasificados (o sincronizar). |
| Tras cada jornada | **Publicar tabla oficial** y, si quieres, enviar el resumen. |
| Pagos | **Admin → Participantes**: marcar ✅ cuando alguien entregue su cuota. |

## ⚠ Límites conocidos

- **Modo demo** = un solo navegador (es para probar, no para competir).
- EmailJS gratis: 200 correos/mes → priorizar recordatorios de jornadas clave.
- API-Football gratis: 100 peticiones/día → patrón "solo el admin sincroniza" ya implementado.
- Los marcadores de la API se emparejan por pareja de equipos y fecha; si FIFA cambia un
  cruce a última hora, el panel permite corregirlo a mano en segundos.
- La hora de los partidos aún no confirmados cierra pronósticos a las 11:00 a. m. de
  Colombia de ese día (criterio conservador, ajustable al confirmar la hora real).

¡Que gane el que más sepa (o el que más suerte tenga)! 🏆
