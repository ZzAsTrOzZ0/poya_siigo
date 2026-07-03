/* ============================================================
   POLLA SIIGO 2026 — FIXTURE OFICIAL DEL MUNDIAL
   Fuente: sorteo FIFA (5-dic-2025) y calendario oficial.
   Grupos verificados tras los repechajes de marzo de 2026.
   ------------------------------------------------------------
   Notas:
   • Los partidos con horaOk:false tienen la FECHA oficial pero
     la hora exacta aún no se cargó aquí; por seguridad cierran
     pronósticos a las 16:00 UTC (11:00 a. m. Colombia) de ese
     día. El admin puede ajustar la hora real desde el panel o
     con "Sincronizar con API".
   • Eliminatorias: los equipos se definen al cerrar grupos
     (admin o sincronización con API).
   ============================================================ */

const f = c => `<img src="https://flagcdn.com/24x18/${c}.png" style="width:20px;vertical-align:middle;border-radius:2px;margin:0 4px" alt="flag">`;
const EQUIPOS = {
  // Grupo A
  MEX:{n:'México',n_en:'Mexico',b:f('mx'),g:'A'}, RSA:{n:'Sudáfrica',n_en:'South Africa',b:f('za'),g:'A'}, KOR:{n:'Corea del Sur',n_en:'South Korea',b:f('kr'),g:'A'}, CZE:{n:'Chequia',n_en:'Czech Republic',b:f('cz'),g:'A'},
  // Grupo B
  CAN:{n:'Canadá',n_en:'Canada',b:f('ca'),g:'B'}, BIH:{n:'Bosnia y Herzegovina',n_en:'Bosnia and Herzegovina',b:f('ba'),g:'B'}, QAT:{n:'Catar',n_en:'Qatar',b:f('qa'),g:'B'}, SUI:{n:'Suiza',n_en:'Switzerland',b:f('ch'),g:'B'},
  // Grupo C
  BRA:{n:'Brasil',n_en:'Brazil',b:f('br'),g:'C'}, MAR:{n:'Marruecos',n_en:'Morocco',b:f('ma'),g:'C'}, HAI:{n:'Haití',n_en:'Haiti',b:f('ht'),g:'C'}, SCO:{n:'Escocia',n_en:'Scotland',b:f('gb-sct'),g:'C'},
  // Grupo D
  USA:{n:'Estados Unidos',n_en:'USA',b:f('us'),g:'D'}, PAR:{n:'Paraguay',n_en:'Paraguay',b:f('py'),g:'D'}, AUS:{n:'Australia',n_en:'Australia',b:f('au'),g:'D'}, TUR:{n:'Turquía',n_en:'Turkey',b:f('tr'),g:'D'},
  // Grupo E
  GER:{n:'Alemania',n_en:'Germany',b:f('de'),g:'E'}, CUW:{n:'Curazao',n_en:'Curacao',b:f('cw'),g:'E'}, CIV:{n:'Costa de Marfil',n_en:'Ivory Coast',b:f('ci'),g:'E'}, ECU:{n:'Ecuador',n_en:'Ecuador',b:f('ec'),g:'E'},
  // Grupo F
  NED:{n:'Países Bajos',n_en:'Netherlands',b:f('nl'),g:'F'}, JPN:{n:'Japón',n_en:'Japan',b:f('jp'),g:'F'}, SWE:{n:'Suecia',n_en:'Sweden',b:f('se'),g:'F'}, TUN:{n:'Túnez',n_en:'Tunisia',b:f('tn'),g:'F'},
  // Grupo G
  BEL:{n:'Bélgica',n_en:'Belgium',b:f('be'),g:'G'}, EGY:{n:'Egipto',n_en:'Egypt',b:f('eg'),g:'G'}, IRN:{n:'Irán',n_en:'Iran',b:f('ir'),g:'G'}, NZL:{n:'Nueva Zelanda',n_en:'New Zealand',b:f('nz'),g:'G'},
  // Grupo H
  ESP:{n:'España',n_en:'Spain',b:f('es'),g:'H'}, CPV:{n:'Cabo Verde',n_en:'Cape Verde',b:f('cv'),g:'H'}, KSA:{n:'Arabia Saudita',n_en:'Saudi Arabia',b:f('sa'),g:'H'}, URU:{n:'Uruguay',n_en:'Uruguay',b:f('uy'),g:'H'},
  // Grupo I
  FRA:{n:'Francia',n_en:'France',b:f('fr'),g:'I'}, SEN:{n:'Senegal',n_en:'Senegal',b:f('sn'),g:'I'}, IRQ:{n:'Irak',n_en:'Iraq',b:f('iq'),g:'I'}, NOR:{n:'Noruega',n_en:'Norway',b:f('no'),g:'I'},
  // Grupo J
  ARG:{n:'Argentina',n_en:'Argentina',b:f('ar'),g:'J'}, ALG:{n:'Argelia',n_en:'Algeria',b:f('dz'),g:'J'}, AUT:{n:'Austria',n_en:'Austria',b:f('at'),g:'J'}, JOR:{n:'Jordania',n_en:'Jordan',b:f('jo'),g:'J'},
  // Grupo K
  POR:{n:'Portugal',n_en:'Portugal',b:f('pt'),g:'K'}, COD:{n:'RD Congo',n_en:'DR Congo',b:f('cd'),g:'K'}, UZB:{n:'Uzbekistán',n_en:'Uzbekistan',b:f('uz'),g:'K'}, COL:{n:'Colombia',n_en:'Colombia',b:f('co'),g:'K'},
  // Grupo L
  ENG:{n:'Inglaterra',n_en:'England',b:f('gb-eng'),g:'L'}, CRO:{n:'Croacia',n_en:'Croatia',b:f('hr'),g:'L'}, GHA:{n:'Ghana',n_en:'Ghana',b:f('gh'),g:'L'}, PAN:{n:'Panamá',n_en:'Panama',b:f('pa'),g:'L'}
};

/* Posiciones de sorteo 1-2-3-4 por grupo (definen los cruces). */
const GRUPOS = {
  A:['MEX','RSA','KOR','CZE'], B:['CAN','BIH','QAT','SUI'], C:['BRA','MAR','HAI','SCO'],
  D:['USA','PAR','AUS','TUR'], E:['GER','CUW','CIV','ECU'], F:['NED','JPN','SWE','TUN'],
  G:['BEL','EGY','IRN','NZL'], H:['ESP','CPV','KSA','URU'], I:['FRA','SEN','IRQ','NOR'],
  J:['ARG','ALG','AUT','JOR'], K:['POR','COD','UZB','COL'], L:['ENG','CRO','GHA','PAN']
};

/* Día (de junio) de cada cruce por jornada — calendario oficial FIFA.
   J1 cruza 1v2 y 3v4 · J2 cruza 1v3 y 4v2 · J3 cruza 4v1 y 2v3 (simultáneos). */
const DIAS = {
  1: { A:[11,11], B:[12,13], C:[13,13], D:[12,13], E:[14,14], F:[14,14], G:[15,15], H:[15,15], I:[16,16], J:[16,16], K:[17,17], L:[17,17] },
  2: { A:[18,18], B:[18,18], C:[19,19], D:[19,19], E:[20,20], F:[20,20], G:[21,21], H:[21,21], I:[22,22], J:[22,22], K:[23,23], L:[23,23] },
  3: { A:[24,24], B:[24,24], C:[24,24], D:[25,25], E:[25,25], F:[25,25], G:[26,26], H:[26,26], I:[26,26], J:[27,27], K:[27,27], L:[27,27] }
};
const CRUCES = { 1: [[0,1],[2,3]], 2: [[0,2],[3,1]], 3: [[3,0],[1,2]] };

/* Horarios y sedes ya confirmados (UTC). Clave: 'LOCAL-VISITANTE'. */
const CONFIRMADOS = {
  'MEX-RSA': { utc:'2026-06-11T19:00:00Z', sede:'Ciudad de México', estadio:'Estadio Azteca' },
  'KOR-CZE': { utc:'2026-06-12T02:00:00Z', sede:'Guadalajara',      estadio:'Estadio Akron' },
  'CAN-BIH': { utc:'2026-06-12T19:00:00Z', sede:'Toronto',          estadio:'BMO Field' },
  'USA-PAR': { utc:'2026-06-13T01:00:00Z', sede:'Los Ángeles',      estadio:'SoFi Stadium' },
  'QAT-SUI': { utc:'2026-06-13T19:00:00Z', sede:'San Francisco (Santa Clara)', estadio:"Levi's Stadium" },
  'BRA-MAR': { utc:'2026-06-13T22:00:00Z', sede:'Nueva York / Nueva Jersey',   estadio:'MetLife Stadium' },
  'HAI-SCO': { utc:'2026-06-14T01:00:00Z', sede:'Boston (Foxborough)',         estadio:'Gillette Stadium' },
  'CZE-RSA': { utc:'2026-06-18T16:00:00Z', sede:'Atlanta',          estadio:'Mercedes-Benz Stadium' },
  'MEX-KOR': { utc:'2026-06-19T01:00:00Z', sede:'Guadalajara',      estadio:'Estadio Akron' },
  'CZE-MEX': { utc:'2026-06-25T01:00:00Z', sede:'Ciudad de México', estadio:'Estadio Azteca' },
  'RSA-KOR': { utc:'2026-06-25T02:00:00Z', sede:'Monterrey',        estadio:'Estadio BBVA' }
};

/* ---- Generación de los 72 partidos de fase de grupos ------- */
function _generarGrupos() {
  const lista = [];
  for (let j = 1; j <= 3; j++) {
    Object.keys(GRUPOS).forEach(g => {
      CRUCES[j].forEach((par, idx) => {
        const local = GRUPOS[g][par[0]], visitante = GRUPOS[g][par[1]];
        const dia = String(DIAS[j][g][idx]).padStart(2, '0');
        const fecha = `2026-06-${dia}`;
        const conf = CONFIRMADOS[`${local}-${visitante}`];
        lista.push({
          id: `g-${j}-${g}-${idx}`,
          fase: 'grupos', grupo: g, jornada: j,
          etapa: `Grupo ${g} · Jornada ${j}`,
          local, visitante,
          fecha,
          utc: conf ? conf.utc : `${fecha}T16:00:00Z`,
          horaOk: !!conf,
          sede: conf ? conf.sede : 'Sede por confirmar',
          estadio: conf ? conf.estadio : ''
        });
      });
    });
  }
  /* Orden cronológico y numeración */
  lista.sort((a, b) => a.utc.localeCompare(b.utc) || a.grupo.localeCompare(b.grupo));
  lista.forEach((p, i) => { p.n = i + 1; });
  return lista;
}

/* ---- Eliminatorias (equipos se definen al cerrar grupos) ---- */
const _ko = (n, ronda, etiqueta, l, v, ventana, sede) => ({
  id: `ko-${n}`, n, fase: 'eliminatorias', ronda, etapa: etiqueta,
  local: null, visitante: null, etiqL: l, etiqV: v,
  fecha: ventana[0], ventana: ventana[1], utc: null, horaOk: false,
  sede: sede || 'Sede por confirmar', estadio: ''
});

const ELIMINATORIAS = [
  /* Dieciseisavos (28 jun – 3 jul) — cruces oficiales FIFA */
  _ko(73,'16avos','Dieciseisavos · P73','2.º Grupo A','2.º Grupo B',['2026-06-28','28 jun – 3 jul']),
  _ko(74,'16avos','Dieciseisavos · P74','1.º Grupo E','3.º A/B/C/D/F',['2026-06-28','28 jun – 3 jul']),
  _ko(75,'16avos','Dieciseisavos · P75','1.º Grupo F','2.º Grupo C',['2026-06-28','28 jun – 3 jul']),
  _ko(76,'16avos','Dieciseisavos · P76','1.º Grupo C','2.º Grupo F',['2026-06-29','28 jun – 3 jul']),
  _ko(77,'16avos','Dieciseisavos · P77','1.º Grupo I','3.º C/D/F/G/H',['2026-06-29','28 jun – 3 jul']),
  _ko(78,'16avos','Dieciseisavos · P78','2.º Grupo E','2.º Grupo I',['2026-06-29','28 jun – 3 jul']),
  _ko(79,'16avos','Dieciseisavos · P79','1.º Grupo A','3.º C/E/F/H/I',['2026-06-30','28 jun – 3 jul']),
  _ko(80,'16avos','Dieciseisavos · P80','1.º Grupo L','3.º E/H/I/J/K',['2026-06-30','28 jun – 3 jul']),
  _ko(81,'16avos','Dieciseisavos · P81','1.º Grupo D','3.º B/E/F/I/J',['2026-06-30','28 jun – 3 jul']),
  _ko(82,'16avos','Dieciseisavos · P82','1.º Grupo G','3.º A/E/H/I/J',['2026-07-01','28 jun – 3 jul']),
  _ko(83,'16avos','Dieciseisavos · P83','2.º Grupo K','2.º Grupo L',['2026-07-01','28 jun – 3 jul']),
  _ko(84,'16avos','Dieciseisavos · P84','1.º Grupo H','2.º Grupo J',['2026-07-01','28 jun – 3 jul']),
  _ko(85,'16avos','Dieciseisavos · P85','1.º Grupo B','3.º E/F/G/I/J',['2026-07-02','28 jun – 3 jul']),
  _ko(86,'16avos','Dieciseisavos · P86','1.º Grupo J','2.º Grupo H',['2026-07-02','28 jun – 3 jul']),
  _ko(87,'16avos','Dieciseisavos · P87','1.º Grupo K','3.º D/E/I/J/L',['2026-07-02','28 jun – 3 jul']),
  _ko(88,'16avos','Dieciseisavos · P88','2.º Grupo D','2.º Grupo G',['2026-07-03','28 jun – 3 jul']),
  /* Octavos (4 – 7 jul) */
  ...[89,90,91,92,93,94,95,96].map((n,i)=>_ko(n,'8vos',`Octavos · P${n}`,'Por definir','Por definir',[`2026-07-0${4+Math.floor(i/2)}`,'4 – 7 jul'])),
  /* Cuartos (9 – 11 jul) */
  _ko(97,'4tos','Cuartos · P97','Por definir','Por definir',['2026-07-09','9 – 11 jul'],'Boston (Foxborough)'),
  _ko(98,'4tos','Cuartos · P98','Por definir','Por definir',['2026-07-10','9 – 11 jul'],'Los Ángeles'),
  _ko(99,'4tos','Cuartos · P99','Por definir','Por definir',['2026-07-11','9 – 11 jul'],'Kansas City'),
  _ko(100,'4tos','Cuartos · P100','Por definir','Por definir',['2026-07-11','9 – 11 jul'],'Miami'),
  /* Semifinales, tercer puesto y final */
  _ko(101,'semis','Semifinal · P101','Por definir','Por definir',['2026-07-14','14 jul'],'Dallas (Arlington)'),
  _ko(102,'semis','Semifinal · P102','Por definir','Por definir',['2026-07-15','15 jul'],'Atlanta'),
  _ko(103,'tercer','Tercer puesto','Por definir','Por definir',['2026-07-18','18 jul'],'Miami'),
  _ko(104,'final','GRAN FINAL','Por definir','Por definir',['2026-07-19','19 jul'],'Nueva York / Nueva Jersey')
];

/* Cruces reales dieciseisavos 2026 (P73–P88) — verificado vs calendario FIFA.
   Octavos = P89–P96 (ganadores de P73+P74, P77+P75, etc. — ver llaves.js FEEDERS).
   NO asignar cruces de equipos reales a P89+; solo dieciseisavos van en P73–P88. */
const KO_R32_OFICIAL = {
  'CAN|RSA': 'ko-73',  /* P73 · 28 jun */
  'GER|PAR': 'ko-74',  /* P74 · 29 jun */
  'MAR|NED': 'ko-75',  /* P75 · 29 jun */
  'BRA|JPN': 'ko-76',  /* P76 · 29 jun */
  'FRA|SWE': 'ko-77',  /* P77 · 30 jun */
  'CIV|NOR': 'ko-78',  /* P78 · 30 jun */
  'ECU|MEX': 'ko-79',  /* P79 · 30 jun */
  'COD|ENG': 'ko-80',  /* P80 · 1 jul */
  'BIH|USA': 'ko-81',  /* P81 · 1 jul */
  'BEL|SEN': 'ko-82',  /* P82 · 1 jul */
  'CRO|POR': 'ko-83',  /* P83 · 2 jul */
  'AUT|ESP': 'ko-84',  /* P84 · 2 jul */
  'ALG|SUI': 'ko-85',  /* P85 · 2 jul */
  'ARG|CPV': 'ko-86',  /* P86 · 3 jul */
  'COL|GHA': 'ko-87',  /* P87 · 3 jul */
  'AUS|EGY': 'ko-88'   /* P88 · 3 jul */
};

const FIXTURE = {
  equipos: EQUIPOS,
  grupos: GRUPOS,
  partidos: [..._generarGrupos(), ...ELIMINATORIAS],
  koR32Oficial: KO_R32_OFICIAL,
  idSlotKoPorPareja(l, v) {
    if (!l || !v || l === 'Por definir' || v === 'Por definir') return null;
    return KO_R32_OFICIAL[[l, v].sort().join('|')] || null;
  },
  equipo(c) { return EQUIPOS[c] || { n: c || 'Por definir', b: '⚽', g: '' }; },
  porId(id) { return this.partidos.find(p => p.id === id); }
};
window.FIXTURE = FIXTURE;
