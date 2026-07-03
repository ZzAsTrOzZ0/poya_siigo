/**
 * Auditoría profunda: historial vs preds visibles vs marcadores.
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const require = createRequire(import.meta.url);

const fixtureSrc = readFileSync(join(root, 'js', 'fixture.js'), 'utf8')
  .replace(/window\.FIXTURE\s*=\s*FIXTURE;?/, 'globalThis.FIXTURE = FIXTURE;');
eval(fixtureSrc);

const utilsSrc = readFileSync(join(root, 'js', 'utils.js'), 'utf8')
  .replace(/window\.U\s*=\s*U;?/, 'globalThis.U = U;')
  .replace(/^const U = /m, 'globalThis.U = ');
eval(utilsSrc);

async function loadDb() {
  const admin = require(join(root, '..', 'node_modules', 'firebase-admin'));
  if (!admin.getApps().length) admin.initializeApp({ projectId: 'polla-mundialista-siigo' });
  const { getFirestore } = require(join(root, '..', 'node_modules', 'firebase-admin/lib/firestore/index.js'));
  return getFirestore();
}

function clavePareja(a, b) {
  return `ko:${[a, b].sort().join('-')}`;
}

async function main() {
  const db = await loadDb();
  console.log('Cargando Firestore…');
  const [resSnap, ajSnap, predSnap, histSnap, usrSnap] = await Promise.all([
    db.collection('resultados').get(),
    db.collection('ajustes').get(),
    db.collection('predicciones').get(),
    db.collection('historial_predicciones').get(),
    db.collection('usuarios').get()
  ]);

  const resultados = {};
  resSnap.forEach(d => { resultados[d.id] = d.data(); });
  const ajustes = {};
  ajSnap.forEach(d => { if (d.id !== 'GLOBAL') ajustes[d.id] = d.data(); });

  const usuarios = {};
  usrSnap.forEach(d => { usuarios[d.id] = { uid: d.id, ...d.data() }; });
  const activos = Object.values(usuarios).filter(u => u.estado === 'activo');

  const todas = {};
  predSnap.forEach(d => {
    const p = d.data();
    if (!p.uid || !p.pid || p.supersededBy) return;
    const canon = p.pidCanon || p.pid;
    const prev = todas[p.uid]?.[canon];
    if (!prev || (p.t || 0) >= (prev.t || 0)) {
      (todas[p.uid] = todas[p.uid] || {})[canon] = { ...p, pid: canon, _docId: d.id };
    }
  });

  const rawByUid = {};
  predSnap.forEach(d => {
    const p = d.data();
    if (!p.uid || p.supersededBy) return;
    (rawByUid[p.uid] = rawByUid[p.uid] || []).push({ id: d.id, ...p });
  });

  const ultimoHist = new Map();
  histSnap.docs.forEach(d => {
    const h = d.data();
    if (h.accion === 'eliminar' || h.gl == null || h.gv == null) return;
    const k = `${h.uid}|${h.pid}`;
    const prev = ultimoHist.get(k);
    if (!prev || (h.t || 0) >= (prev.t || 0)) ultimoHist.set(k, { ...h, id: d.id });
  });

  const partidosUnicos = new Map();
  for (const p of FIXTURE.partidos) {
    const pe = { ...p, ...(ajustes[p.id] || {}) };
    if (!pe.local || pe.local === 'Por definir') {
      const eq = U.equiposOficialSlotKo(p.id);
      if (eq) Object.assign(pe, { local: eq[0], visitante: eq[1] });
      else continue;
    }
    const pidCanon = U.idSlotKoOficial(pe.local, pe.visitante) || pe.id;
    const peCanon = { ...FIXTURE.porId(pidCanon), ...(ajustes[pidCanon] || {}), id: pidCanon };
    if (!peCanon.local || peCanon.local === 'Por definir') {
      Object.assign(peCanon, { local: pe.local, visitante: pe.visitante });
    }
    const cl = pe.fase === 'eliminatorias'
      ? clavePareja(peCanon.local, peCanon.visitante)
      : U.clavePartidoDuplicado(peCanon);
    if (!partidosUnicos.has(cl)) {
      partidosUnicos.set(cl, { pidCanon, pe: peCanon, cl });
    }
  }

  const sinMarcador = [];
  const histSinPred = [];
  const predDocSinModal = [];
  const orfanosSlot = [];

  for (const { pidCanon, pe } of partidosUnicos.values()) {
    const res = resultados[pidCanon] || resultados[pe.id];
    const finalizado = res?.estado === 'finalizado';
    const label = `${FIXTURE.equipo(pe.local).n} vs ${FIXTURE.equipo(pe.visitante).n}`;

    if (!finalizado && pe.fecha && new Date(`${pe.fecha}T23:59:59Z`).getTime() < Date.now()) {
      sinMarcador.push({ pid: pidCanon, partido: label, preds: 0 });
    }

    const uidsHist = new Set();
    const uidsPred = new Set();
    for (const u of activos) {
      const pMap = todas[u.uid] || {};
      const pr = pMap[pidCanon] || pMap[pe.id];
      const hasAny = rawByUid[u.uid]?.some(r =>
        r.pid === pidCanon || r.pid === pe.id || r.pidCanon === pidCanon
      );
      if (pr?.gl != null) uidsPred.add(u.uid);
      else if (hasAny) {
        predDocSinModal.push({
          uid: u.uid,
          nombre: u.nombre,
          pid: pidCanon,
          partido: label,
          docs: rawByUid[u.uid].filter(r => r.pid === pidCanon || r.pid === pe.id || r.pidCanon === pidCanon)
        });
      }

      for (const h of ultimoHist.values()) {
        if (h.uid !== u.uid) continue;
        if (h.pid !== pidCanon && h.pid !== pe.id) {
          const peH = { ...FIXTURE.porId(h.pid), ...(ajustes[h.pid] || {}) };
          const clH = peH.local ? clavePareja(peH.local, peH.visitante) : U.claveOficialPorSlotKo(h.pid);
          const clP = clavePareja(pe.local, pe.visitante);
          if (pe.fase === 'grupos') continue;
          if (clH && clH !== clP && clH !== `ko:${[pe.local, pe.visitante].sort().join('-')}`) continue;
        }
        if (h.pid === pidCanon || h.pid === pe.id) {
          if (!uidsPred.has(u.uid)) uidsHist.add(`${u.uid}|${u.nombre}`);
        }
      }
    }

    for (const slot of FIXTURE.partidos) {
      if (slot.id === pidCanon) continue;
      const px = { ...slot, ...(ajustes[slot.id] || {}) };
      if (!px.local || px.local === 'Por definir') continue;
      if (clavePareja(px.local, px.visitante) !== clavePareja(pe.local, pe.visitante)) continue;
      let n = 0;
      activos.forEach(u => {
        const pr = rawByUid[u.uid]?.find(r => r.pid === slot.id && r.gl != null && !r.supersededBy);
        if (pr) n++;
      });
      if (n) orfanosSlot.push({ partido: label, pidCanon, slot: slot.id, n });
    }

    for (const entry of uidsHist) {
      const [uid, nombre] = entry.split('|');
      histSinPred.push({ uid, nombre, pid: pidCanon, partido: label, finalizado });
    }
  }

  console.log('\n=== AUDITORÍA PROFUNDA ===\n');
  console.log(`Activos: ${activos.length} · Historial entradas: ${histSnap.size} · Pronósticos docs: ${predSnap.size}\n`);

  console.log(`❌ SIN MARCADOR FINAL (deberían tener resultado): ${sinMarcador.length}`);
  sinMarcador.forEach(x => console.log(`   · ${x.partido} [${x.pid}]`));

  console.log(`\n♻️ HISTORIAL SIN PRED VISIBLE (canon slot): ${histSinPred.length}`);
  histSinPred.slice(0, 30).forEach(x =>
    console.log(`   · ${x.nombre || x.uid} → ${x.partido} [${x.pid}]${x.finalizado ? ' FT' : ''}`)
  );
  if (histSinPred.length > 30) console.log(`   … y ${histSinPred.length - 30} más`);

  console.log(`\n⚠ PREDS EN SLOT INCORRECTO (live docs): ${orfanosSlot.length} cruces`);
  orfanosSlot.forEach(x => console.log(`   · ${x.partido} [${x.pidCanon}]: ${x.n} en ${x.slot}`));

  console.log(`\n🔍 DOCS EN CANON PERO NO EN MAPA: ${predDocSinModal.length}`);
  predDocSinModal.slice(0, 15).forEach(x =>
    console.log(`   · ${x.nombre} → ${x.partido}: ${x.docs.map(d => `${d.pid}(${d.gl}-${d.gv})`).join(', ')}`)
  );

  // Por usuario: diferencia historial vs preds visibles en finalizados
  console.log('\n--- Usuarios con más historial que preds en finalizados ---');
  const porUsuario = [];
  for (const u of activos) {
    const histPids = new Set([...ultimoHist.values()].filter(h => h.uid === u.uid).map(h => h.pid));
    let predsVis = 0;
    let histFin = 0;
    for (const { pidCanon, pe } of partidosUnicos.values()) {
      const res = resultados[pidCanon];
      if (res?.estado !== 'finalizado') continue;
      if ((todas[u.uid] || {})[pidCanon]?.gl != null) predsVis++;
      if ([...histPids].some(pid => pid === pidCanon || pid === pe.id)) histFin++;
    }
    const diff = histFin - predsVis;
    if (diff > 0) porUsuario.push({ nombre: u.nombre, uid: u.uid, predsVis, histFin, diff });
  }
  porUsuario.sort((a, b) => b.diff - a.diff).slice(0, 15).forEach(u =>
    console.log(`   · ${u.nombre}: ${u.predsVis} preds visibles / ${u.histFin} en historial (faltan ~${u.diff})`)
  );

  console.log('');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
