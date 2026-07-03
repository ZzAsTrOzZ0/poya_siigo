/** Verificación local del fixture vs lista FIFA (sin tocar Firebase). */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureSrc = readFileSync(join(root, 'js', 'fixture.js'), 'utf8')
  .replace(/window\.FIXTURE\s*=\s*FIXTURE;?/, 'globalThis.FIXTURE = FIXTURE;');
eval(fixtureSrc);

const ALIAS = {
  'México':'MEX','Sudáfrica':'RSA','Corea del Sur':'KOR','República Checa':'CZE',
  'Canadá':'CAN','Bosnia y Herzegovina':'BIH','Catar':'QAT','Suiza':'SUI',
  'Brasil':'BRA','Marruecos':'MAR','Haití':'HAI','Escocia':'SCO',
  'EEUU':'USA','Paraguay':'PAR','Australia':'AUS','Turquía':'TUR',
  'Alemania':'GER','Curazao':'CUW','Costa de Marfil':'CIV','Ecuador':'ECU',
  'Holanda':'NED','Japón':'JPN','Suecia':'SWE','Túnez':'TUN',
  'Bélgica':'BEL','Egipto':'EGY','Irán':'IRN','Nueva Zelanda':'NZL',
  'España':'ESP','Cabo Verde':'CPV','Arabia Saudí':'KSA','Uruguay':'URU',
  'Francia':'FRA','Senegal':'SEN','Irak':'IRQ','Noruega':'NOR',
  'Argentina':'ARG','Argelia':'ALG','Austria':'AUT','Jordania':'JOR',
  'Portugal':'POR','Congo Democrático':'COD','Uzbekistán':'UZB','Colombia':'COL',
  'Inglaterra':'ENG','Croacia':'CRO','Ghana':'GHA','Panamá':'PAN'
};

const toCode = n => ALIAS[n.trim()] || null;

const PARTIDOS = [
  ['México','Sudáfrica',2,0,'grupo'], ['Corea del Sur','República Checa',2,1,'grupo'],
  ['Canadá','Bosnia y Herzegovina',1,1,'grupo'], ['EEUU','Paraguay',4,1,'grupo'],
  ['Catar','Suiza',1,1,'grupo'], ['Brasil','Marruecos',1,1,'grupo'], ['Haití','Escocia',0,1,'grupo'], ['Australia','Turquía',2,0,'grupo'],
  ['Alemania','Curazao',7,1,'grupo'], ['Holanda','Japón',2,2,'grupo'], ['Costa de Marfil','Ecuador',1,0,'grupo'], ['Suecia','Túnez',5,1,'grupo'],
  ['España','Cabo Verde',0,0,'grupo'], ['Bélgica','Egipto',1,1,'grupo'], ['Arabia Saudí','Uruguay',1,1,'grupo'], ['Irán','Nueva Zelanda',2,2,'grupo'],
  ['Francia','Senegal',3,1,'grupo'], ['Irak','Noruega',1,4,'grupo'], ['Argentina','Argelia',3,0,'grupo'], ['Austria','Jordania',3,1,'grupo'],
  ['Portugal','Congo Democrático',1,1,'grupo'], ['Inglaterra','Croacia',4,2,'grupo'], ['Ghana','Panamá',1,0,'grupo'], ['Uzbekistán','Colombia',1,3,'grupo'],
  ['República Checa','Sudáfrica',1,1,'grupo'], ['Suiza','Bosnia y Herzegovina',4,1,'grupo'], ['Canadá','Catar',6,0,'grupo'], ['México','Corea del Sur',1,0,'grupo'],
  ['EEUU','Australia',2,0,'grupo'], ['Escocia','Marruecos',0,1,'grupo'], ['Brasil','Haití',3,0,'grupo'], ['Turquía','Paraguay',0,1,'grupo'],
  ['Holanda','Suecia',5,1,'grupo'], ['Alemania','Costa de Marfil',2,1,'grupo'], ['Ecuador','Curazao',0,0,'grupo'], ['Túnez','Japón',0,4,'grupo'],
  ['España','Arabia Saudí',4,0,'grupo'], ['Bélgica','Irán',0,0,'grupo'], ['Uruguay','Cabo Verde',2,2,'grupo'], ['Nueva Zelanda','Egipto',1,3,'grupo'],
  ['Argentina','Austria',2,0,'grupo'], ['Francia','Irak',3,0,'grupo'], ['Noruega','Senegal',3,2,'grupo'], ['Jordania','Argelia',1,2,'grupo'],
  ['Portugal','Uzbekistán',5,0,'grupo'], ['Inglaterra','Ghana',0,0,'grupo'], ['Panamá','Croacia',0,1,'grupo'], ['Colombia','Congo Democrático',1,0,'grupo'],
  ['Bosnia y Herzegovina','Catar',3,1,'grupo'], ['Suiza','Canadá',2,1,'grupo'], ['Escocia','Brasil',0,3,'grupo'], ['Marruecos','Haití',4,2,'grupo'],
  ['República Checa','México',0,3,'grupo'], ['Sudáfrica','Corea del Sur',1,0,'grupo'],
  ['Curazao','Costa de Marfil',0,2,'grupo'], ['Ecuador','Alemania',2,1,'grupo'], ['Japón','Suecia',1,1,'grupo'], ['Túnez','Holanda',1,3,'grupo'],
  ['Turquía','EEUU',3,2,'grupo'], ['Paraguay','Australia',0,0,'grupo'],
  ['Noruega','Francia',1,4,'grupo'], ['Senegal','Irak',5,0,'grupo'], ['Uruguay','España',0,1,'grupo'], ['Cabo Verde','Arabia Saudí',0,0,'grupo'],
  ['Egipto','Irán',1,1,'grupo'], ['Nueva Zelanda','Bélgica',1,5,'grupo'],
  ['Panamá','Inglaterra',0,2,'grupo'], ['Croacia','Ghana',2,1,'grupo'], ['Congo Democrático','Uzbekistán',3,1,'grupo'], ['Colombia','Portugal',0,0,'grupo'],
  ['Jordania','Argentina',1,3,'grupo'], ['Argelia','Austria',3,3,'grupo'],
  ['Sudáfrica','Canadá',0,1,'r32'], ['Brasil','Japón',2,1,'r32'],
  ['Alemania','Paraguay',1,1,'r32-pen'], ['Holanda','Marruecos',1,1,'r32-pen'],
  ['Costa de Marfil','Noruega',1,2,'r32'], ['Francia','Suecia',3,0,'r32'], ['México','Ecuador',2,0,'r32'],
  ['Inglaterra','Congo Democrático',2,1,'r32'], ['Bélgica','Senegal',3,2,'r32'], ['EEUU','Bosnia y Herzegovina',2,0,'r32'],
  ['España','Austria',3,0,'r32'],
  ['Portugal','Croacia',null,null,'r32-pendiente'], ['Suiza','Argelia',null,null,'r32-pendiente'],
  ['Australia','Egipto',null,null,'r32-pendiente'], ['Argentina','Cabo Verde',null,null,'r32-pendiente'], ['Colombia','Ghana',null,null,'r32-pendiente']
];

function find(ln, vn) {
  const l = toCode(ln), v = toCode(vn);
  const pg = FIXTURE.partidos.find(p => p.fase === 'grupos'
    && ((p.local === l && p.visitante === v) || (p.local === v && p.visitante === l)));
  const ko = FIXTURE.idSlotKoPorPareja(l, v);
  return { pg, ko, l, v };
}

console.log('\n=== FIXTURE LOCAL (72 grupos + 16 R32 oficiales) ===\n');
console.log(`Total partidos fixture: ${FIXTURE.partidos.length}`);
console.log(`Grupos: ${FIXTURE.partidos.filter(p=>p.fase==='grupos').length}`);
console.log(`Eliminatorias: ${FIXTURE.partidos.filter(p=>p.fase==='eliminatorias').length}`);
console.log(`Slots R32 oficiales (KO_R32_OFICIAL): ${Object.keys(FIXTURE.koR32Oficial).length}\n`);

const map = [];
let missing = 0;
for (const [ln, vn, gl, gv, tipo] of PARTIDOS) {
  const { pg, ko, l, v } = find(ln, vn);
  const pid = pg?.id || ko;
  const flip = pg && pg.local !== l;
  const slot = pg ? `P${pg.n} ${pg.id}` : (ko ? `P${FIXTURE.porId(ko).n} ${ko}` : '—');
  if (!pid) { missing++; console.log(`❌ NO EN FIXTURE: ${ln} vs ${vn}`); continue; }
  map.push({ partido: `${ln} vs ${vn}`, pid, slot, tipo, esperado: gl != null ? `${flip?gv:gl}-${flip?gl:gv}` : 'pendiente' });
}

console.log(`\n✅ ${map.length}/${PARTIDOS.length} partidos mapeados al fixture`);
if (missing) console.log(`❌ ${missing} sin mapear`);

console.log('\n--- MAPA R32 OFICIAL (P73–P88) ---');
for (const [pair, id] of Object.entries(FIXTURE.koR32Oficial)) {
  const [a,b] = pair.split('|');
  console.log(`${id} (P${FIXTURE.porId(id).n}): ${FIXTURE.equipo(a).n} vs ${FIXTURE.equipo(b).n}`);
}

console.log('\n--- RIESGO CONOCIDO: parejas de GRUPO en slots KO ---');
const gruposEnKo = [];
for (const p of FIXTURE.partidos.filter(x => x.fase === 'eliminatorias')) {
  for (const g of FIXTURE.partidos.filter(x => x.fase === 'grupos')) {
    if ((g.local === 'ARG' && g.visitante === 'JOR') || (g.local === 'AUT' && g.visitante === 'ALG')) {
      // known problematic pairs
    }
  }
}
['ARG-JOR','AUT-ALG','ARG-ALG','AUT-JOR'].forEach(pair => {
  const [a,b] = pair.split('-');
  const pg = FIXTURE.partidos.find(p => p.fase==='grupos' && ((p.local===a&&p.visitante===b)||(p.local===b&&p.visitante===a)));
  const koSlots = FIXTURE.partidos.filter(p => p.fase==='eliminatorias').map(p=>p.id);
  console.log(`${FIXTURE.equipo(a).n} vs ${FIXTURE.equipo(b).n}: grupo=${pg?.id||'—'} (J${pg?.jornada}) — NO debe estar en ko-89+`);
});

console.log('\n--- OCTAVOS (P89–P96) slots vacíos por diseño ---');
[89,90,91,92,93,94,95,96].forEach(n => {
  const p = FIXTURE.porId(`ko-${n}`);
  console.log(`ko-${n}: ${p.etiqL} vs ${p.etiqV}`);
});

console.log('\n=== Para Firebase: ejecuta Admin → Auditar tabla / Verificación ===\n');
