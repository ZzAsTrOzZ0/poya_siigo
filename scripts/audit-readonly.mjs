/**
 * Auditoría READ-ONLY de Firestore vs calendario oficial FIFA.
 * No escribe nada. Solo reporta.
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Cargar fixture (sin DOM)
const fixtureSrc = readFileSync(join(root, 'js', 'fixture.js'), 'utf8')
  .replace(/window\.FIXTURE\s*=\s*FIXTURE;?/, 'globalThis.FIXTURE = FIXTURE;');
eval(fixtureSrc);

const ALIAS = {
  'México': 'MEX', 'Sudáfrica': 'RSA', 'Corea del Sur': 'KOR', 'República Checa': 'CZE', 'Chequia': 'CZE',
  'Canadá': 'CAN', 'Bosnia y Herzegovina': 'BIH', 'Bosnia y He...': 'BIH', 'Catar': 'QAT', 'Suiza': 'SUI',
  'Brasil': 'BRA', 'Marruecos': 'MAR', 'Haití': 'HAI', 'Escocia': 'SCO',
  'EEUU': 'USA', 'Estados Unidos': 'USA', 'Paraguay': 'PAR', 'Australia': 'AUS', 'Turquía': 'TUR',
  'Alemania': 'GER', 'Curazao': 'CUW', 'Costa de Marfil': 'CIV', 'Ecuador': 'ECU',
  'Holanda': 'NED', 'Países Bajos': 'NED', 'Japón': 'JPN', 'Suecia': 'SWE', 'Túnez': 'TUN',
  'Bélgica': 'BEL', 'Egipto': 'EGY', 'Irán': 'IRN', 'Nueva Zelanda': 'NZL',
  'España': 'ESP', 'Cabo Verde': 'CPV', 'Arabia Saudí': 'KSA', 'Arabia Saudita': 'KSA', 'Uruguay': 'URU',
  'Francia': 'FRA', 'Senegal': 'SEN', 'Irak': 'IRQ', 'Noruega': 'NOR',
  'Argentina': 'ARG', 'Argelia': 'ALG', 'Austria': 'AUT', 'Jordania': 'JOR',
  'Portugal': 'POR', 'Congo Democrático': 'COD', 'RD Congo': 'COD', 'Congo Dem...': 'COD',
  'Uzbekistán': 'UZB', 'Colombia': 'COL', 'Inglaterra': 'ENG', 'Croacia': 'CRO', 'Ghana': 'GHA', 'Panamá': 'PAN'
};

function parsePen(s) {
  const m = String(s).match(/^(\d+)\s*\((\d+)\)$/);
  if (m) return { gl: +m[1], gv: +m[1], penL: +m[2], penV: null, penOnly: true };
  return null;
}

function toCode(name) {
  const n = name.trim();
  if (ALIAS[n]) return ALIAS[n];
  for (const [k, v] of Object.entries(ALIAS)) {
    if (k.startsWith(n.slice(0, 5)) || n.startsWith(k.slice(0, 5))) return v;
  }
  return null;
}

function findPartido(local, visitante) {
  const l = toCode(local), v = toCode(visitante);
  if (!l || !v) return null;
  return FIXTURE.partidos.find(p =>
    (p.local === l && p.visitante === v) || (p.local === v && p.visitante === l)
  ) || null;
}

function findKoSlot(local, visitante) {
  const l = toCode(local), v = toCode(visitante);
  if (!l || !v) return null;
  return FIXTURE.idSlotKoPorPareja(l, v);
}

// Resultados esperados del usuario (FT). Formato: [local, visitante, gl, gv, pen?]
const OFICIAL = [
  // Grupos J1
  ['México','Sudáfrica',2,0], ['Corea del Sur','República Checa',2,1],
  ['Canadá','Bosnia y Herzegovina',1,1], ['EEUU','Paraguay',4,1],
  ['Catar','Suiza',1,1], ['Brasil','Marruecos',1,1], ['Haití','Escocia',0,1], ['Australia','Turquía',2,0],
  ['Alemania','Curazao',7,1], ['Holanda','Japón',2,2], ['Costa de Marfil','Ecuador',1,0], ['Suecia','Túnez',5,1],
  ['España','Cabo Verde',0,0], ['Bélgica','Egipto',1,1], ['Arabia Saudí','Uruguay',1,1], ['Irán','Nueva Zelanda',2,2],
  ['Francia','Senegal',3,1], ['Irak','Noruega',1,4], ['Argentina','Argelia',3,0], ['Austria','Jordania',3,1],
  ['Portugal','Congo Democrático',1,1], ['Inglaterra','Croacia',4,2], ['Ghana','Panamá',1,0], ['Uzbekistán','Colombia',1,3],
  // J2
  ['República Checa','Sudáfrica',1,1], ['Suiza','Bosnia y Herzegovina',4,1], ['Canadá','Catar',6,0], ['México','Corea del Sur',1,0],
  ['EEUU','Australia',2,0], ['Escocia','Marruecos',0,1], ['Brasil','Haití',3,0], ['Turquía','Paraguay',0,1],
  ['Holanda','Suecia',5,1], ['Alemania','Costa de Marfil',2,1], ['Ecuador','Curazao',0,0], ['Túnez','Japón',0,4],
  ['España','Arabia Saudí',4,0], ['Bélgica','Irán',0,0], ['Uruguay','Cabo Verde',2,2], ['Nueva Zelanda','Egipto',1,3],
  ['Argentina','Austria',2,0], ['Francia','Irak',3,0], ['Noruega','Senegal',3,2], ['Jordania','Argelia',1,2],
  ['Portugal','Uzbekistán',5,0], ['Inglaterra','Ghana',0,0], ['Panamá','Croacia',0,1], ['Colombia','Congo Democrático',1,0],
  // J3
  ['Bosnia y Herzegovina','Catar',3,1], ['Suiza','Canadá',2,1], ['Escocia','Brasil',0,3], ['Marruecos','Haití',4,2],
  ['República Checa','México',0,3], ['Sudáfrica','Corea del Sur',1,0],
  ['Curazao','Costa de Marfil',0,2], ['Ecuador','Alemania',2,1], ['Japón','Suecia',1,1], ['Túnez','Holanda',1,3],
  ['Turquía','EEUU',3,2], ['Paraguay','Australia',0,0],
  ['Noruega','Francia',1,4], ['Senegal','Irak',5,0], ['Uruguay','España',0,1], ['Cabo Verde','Arabia Saudí',0,0],
  ['Egipto','Irán',1,1], ['Nueva Zelanda','Bélgica',1,5],
  ['Panamá','Inglaterra',0,2], ['Croacia','Ghana',2,1], ['Congo Democrático','Uzbekistán',3,1], ['Colombia','Portugal',0,0],
  ['Jordania','Argentina',1,3], ['Argelia','Austria',3,3],
  // R32
  ['Sudáfrica','Canadá',0,1], ['Brasil','Japón',2,1],
  ['Alemania','Paraguay',1,1,'pen',3,4], ['Holanda','Marruecos',1,1,'pen',2,3],
  ['Costa de Marfil','Noruega',1,2], ['Francia','Suecia',3,0], ['México','Ecuador',2,0],
  ['Inglaterra','Congo Democrático',2,1], ['Bélgica','Senegal',3,2], ['EEUU','Bosnia y Herzegovina',2,0],
  ['España','Austria',3,0]
];

async function loadFirestore() {
  const require = createRequire(import.meta.url);
  const adminPath = join(root, '..', 'node_modules', 'firebase-admin');
  let admin;
  try {
    admin = require(adminPath);
  } catch {
    admin = require('firebase-admin');
  }
  if (!admin.getApps().length) {
    admin.initializeApp({ projectId: 'polla-mundialista-siigo' });
  }
  const { getFirestore } = require(join(root, '..', 'node_modules', 'firebase-admin', 'lib', 'firestore', 'index.js'));
  return getFirestore();
}

function normRes(r, pe) {
  if (!r) return null;
  const flip = pe && r._flip;
  let gl = r.gl, gv = r.gv;
  if (flip) [gl, gv] = [gv, gl];
  return { gl, gv, estado: r.estado, ganadorPenales: r.ganadorPenales, perdedorPenales: r.perdedorPenales };
}

function eqScore(a, b) {
  return a && b && a.gl === b.gl && a.gv === b.gv;
}

async function main() {
  const db = await loadFirestore();
  const [resSnap, ajSnap, predSnap, histSnap] = await Promise.all([
    db.collection('resultados').get(),
    db.collection('ajustes').get(),
    db.collection('predicciones').get(),
    db.collection('historial_predicciones').get().catch(() => null)
  ]);

  const resultados = {};
  resSnap.forEach(d => { resultados[d.id] = d.data(); });
  const ajustes = {};
  ajSnap.forEach(d => { if (d.id !== 'GLOBAL') ajustes[d.id] = d.data(); });

  const predsByPid = {};
  const predsTotal = predSnap.size;
  let superseded = 0;
  predSnap.forEach(d => {
    const p = d.data();
    if (p.supersededBy) { superseded++; return; }
    const pid = p.pid;
    if (!predsByPid[pid]) predsByPid[pid] = [];
    predsByPid[pid].push({ id: d.id, uid: p.uid, gl: p.gl, gv: p.gv });
  });

  const histByPid = {};
  if (histSnap?.docs) {
    histSnap.docs.forEach(d => {
      const h = d.data();
      const pid = h.pid;
      if (!histByPid[pid]) histByPid[pid] = 0;
      histByPid[pid]++;
    });
  }

  console.log('\n=== AUDITORÍA READ-ONLY FIRESTORE ===\n');
  console.log(`Resultados en Firestore: ${resSnap.size}`);
  console.log(`Ajustes calendario: ${ajSnap.size}`);
  console.log(`Pronósticos activos: ${predsTotal - superseded} (${superseded} archivados supersededBy)`);
  console.log(`Historial predicciones: ${histSnap?.size ?? 0} entradas\n`);

  const issues = [];
  const ok = [];
  const pending = [];
  const dupSlots = new Map();

  for (const row of OFICIAL) {
    const [locName, visName, gl, gv, ...rest] = row;
    const isPen = rest[0] === 'pen';
    const penL = isPen ? rest[1] : null;
    const penV = isPen ? rest[2] : null;

    const pg = findPartido(locName, visName);
    const koId = findKoSlot(locName, visName);
    const pid = pg?.id || koId;
    const pe = pid ? { ...FIXTURE.porId(pid), ...(ajustes[pid] || {}) } : null;

    if (!pid) {
      issues.push({ tipo: 'NO_FIXTURE', partido: `${locName} vs ${visName}` });
      continue;
    }

    // Buscar resultado en slot oficial y duplicados
    let resFound = resultados[pid];
    let resPid = pid;
    const altPids = [];

    if (pg && pg.fase === 'grupos') {
      // ok
    } else if (koId) {
      for (const p of FIXTURE.partidos) {
        if (p.fase !== 'eliminatorias') continue;
        const raw = { ...p, ...(ajustes[p.id] || {}) };
        if (!raw.local || !raw.visitante) continue;
        const key = [raw.local, raw.visitante].sort().join('|');
        const exp = [toCode(locName), toCode(visName)].sort().join('|');
        if (key === exp && p.id !== koId) altPids.push(p.id);
      }
    }

    for (const alt of altPids) {
      if (resultados[alt]) {
        altPids.push(alt);
        if (!resFound) { resFound = resultados[alt]; resPid = alt; }
        dupSlots.set(`${locName} vs ${visName}`, { oficial: koId || pid, duplicado: alt, resEn: alt });
      }
    }

    // También buscar resultado en cualquier slot con misma pareja en ajustes
    for (const [aid, aj] of Object.entries(ajustes)) {
      if (aid === pid || !aj.local || !aj.visitante) continue;
      const key = [aj.local, aj.visitante].sort().join('|');
      const exp = pe ? [pe.local, pe.visitante].sort().join('|') : [toCode(locName), toCode(visName)].sort().join('|');
      if (key === exp && resultados[aid]) {
        if (!resFound) { resFound = resultados[aid]; resPid = aid; }
        if (aid !== pid) dupSlots.set(`${locName} vs ${visName}`, { oficial: pid, duplicado: aid, resEn: aid });
      }
    }

    const nPreds = (predsByPid[pid] || []).length;
    const nPredsDup = altPids.reduce((s, a) => s + (predsByPid[a]?.length || 0), 0);
    const nHist = (histByPid[pid] || 0) + altPids.reduce((s, a) => s + (histByPid[a] || 0), 0);

    const expGl = pg && pg.local !== toCode(locName) ? gv : gl;
    const expGv = pg && pg.local !== toCode(locName) ? gl : gv;

    if (!resFound || resFound.estado !== 'finalizado') {
      pending.push({ pid, partido: `${locName} vs ${visName}`, nPreds: nPreds + nPredsDup, esperado: `${gl}-${gv}` });
      continue;
    }

    const flip = pg && pg.local !== toCode(locName);
    const rgl = flip ? resFound.gv : resFound.gl;
    const rgv = flip ? resFound.gl : resFound.gv;

    const scoreOk = rgl === expGl && rgv === expGv;
    const slotOk = resPid === pid;

    if (scoreOk && slotOk) {
      ok.push({ pid, partido: `${locName} vs ${visName}`, preds: nPreds, hist: nHist });
    } else {
      issues.push({
        tipo: scoreOk ? 'RESULTADO_SLOT_DUPLICADO' : 'RESULTADO_INCORRECTO',
        pid, resPid, partido: `${locName} vs ${visName}`,
        esperado: `${expGl}-${expGv}`, actual: `${rgl}-${rgv}`,
        predsOficial: nPreds, predsDuplicado: nPredsDup, hist: nHist
      });
    }

    if (nPreds === 0 && nPredsDup > 0) {
      issues.push({
        tipo: 'PREDS_EN_SLOT_DUPLICADO',
        pid, partido: `${locName} vs ${visName}`,
        predsOficial: 0, predsDuplicado: nPredsDup
      });
    }
    if (nPreds === 0 && nPredsDup === 0 && nHist > 0) {
      issues.push({
        tipo: 'PREDS_PERDIDOS_HISTORIAL',
        pid, partido: `${locName} vs ${visName}`, hist: nHist
      });
    }
  }

  // KO pendientes sin resultado
  const koPendientes = [
    ['Portugal','Croacia'], ['Suiza','Argelia'], ['Australia','Egipto'],
    ['Argentina','Cabo Verde'], ['Colombia','Ghana']
  ];
  for (const [locName, visName] of koPendientes) {
    const koId = findKoSlot(locName, visName);
    const nPreds = (predsByPid[koId] || []).length;
    let nDup = 0;
    for (const [aid, aj] of Object.entries(ajustes)) {
      if (aid === koId || !aj.local) continue;
      const exp = [toCode(locName), toCode(visName)].sort().join('|');
      if ([aj.local, aj.visitante].sort().join('|') === exp) nDup += (predsByPid[aid]?.length || 0);
    }
    pending.push({ pid: koId, partido: `${locName} vs ${visName}`, nPreds: nPreds + nDup, esperado: 'pendiente' });
  }

  // Slots KO con parejas de grupos (fantasma)
  const fantasmas = [];
  for (const p of FIXTURE.partidos.filter(x => x.fase === 'eliminatorias')) {
    const raw = { ...p, ...(ajustes[p.id] || {}) };
    if (!raw.local || !raw.visitante || raw.local === 'Por definir') continue;
    const pg = FIXTURE.partidos.find(g => g.fase === 'grupos'
      && ((g.local === raw.local && g.visitante === raw.visitante)
        || (g.local === raw.visitante && g.visitante === raw.local)));
    if (pg) {
      fantasmas.push({
        slot: p.id, pareja: `${FIXTURE.equipo(raw.local).n} vs ${FIXTURE.equipo(raw.visitante).n}`,
        grupoId: pg.id, preds: (predsByPid[p.id] || []).length,
        res: resultados[p.id]?.estado || '—'
      });
    }
  }

  // Duplicados 16avos (misma pareja en 2 slots)
  const parejasKo = new Map();
  for (const p of FIXTURE.partidos.filter(x => x.fase === 'eliminatorias' && x.ronda === '16avos')) {
    const raw = { ...p, ...(ajustes[p.id] || {}) };
    if (!raw.local || !raw.visitante) continue;
    const key = [raw.local, raw.visitante].sort().join('|');
    if (!parejasKo.has(key)) parejasKo.set(key, []);
    parejasKo.get(key).push(p.id);
  }
  const duplicados16 = [...parejasKo.entries()].filter(([, ids]) => ids.length > 1);

  console.log(`✅ Partidos verificados OK: ${ok.length}`);
  console.log(`⏳ Sin resultado / pendientes: ${pending.length}`);
  console.log(`⚠️  Problemas detectados: ${issues.length}`);
  console.log(`👻 Slots KO con parejas de GRUPOS: ${fantasmas.length}`);
  console.log(`🔀 Parejas 16avos duplicadas en calendario: ${duplicados16.length}\n`);

  if (issues.length) {
    console.log('--- PROBLEMAS ---');
    issues.forEach(i => console.log(JSON.stringify(i)));
  }
  if (fantasmas.length) {
    console.log('\n--- SLOTS KO FANTASMA (grupo en eliminatoria) ---');
    fantasmas.forEach(f => console.log(JSON.stringify(f)));
  }
  if (duplicados16.length) {
    console.log('\n--- DUPLICADOS 16AVOS ---');
    duplicados16.forEach(([pair, ids]) => {
      const names = pair.split('|').map(c => FIXTURE.equipo(c).n).join(' vs ');
      const detail = ids.map(id => `${id}: res=${resultados[id]?.estado || '—'} preds=${(predsByPid[id] || []).length}`).join(' | ');
      console.log(`${names} → ${detail}`);
    });
  }

  const predsHuerfanos = Object.entries(predsByPid)
    .filter(([pid, arr]) => {
      const base = FIXTURE.porId(pid);
      if (!base) return true;
      const raw = { ...base, ...(ajustes[pid] || {}) };
      return base.fase === 'eliminatorias' && base.ronda !== '16avos'
        && (!raw.local || raw.local === 'Por definir');
    })
    .map(([pid, arr]) => ({ pid, n: arr.length }));

  if (predsHuerfanos.length) {
    console.log('\n--- PREDS EN OCTAVOS+ SIN EQUIPOS (slot vacío) ---');
    predsHuerfanos.forEach(h => console.log(JSON.stringify(h)));
  }

  console.log('\n=== FIN (sin cambios aplicados) ===\n');
}

main().catch(err => {
  console.error('Error:', err.message || err);
  if (String(err.message).includes('Could not load the default credentials')) {
    console.error('\nEjecuta: gcloud auth application-default login\nO usa Admin → Ver auditoría con tu sesión.');
  }
  process.exit(1);
});
