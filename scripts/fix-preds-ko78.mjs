/**
 * Audita/repara preds ko-78 vía runQuery (evita listar toda la colección).
 */
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const PROJECT = 'polla-mundialista-siigo';
const CONFIG_PATH = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
const CANON = 'ko-78';
const ORPHAN_SLOTS = ['ko-76'];

async function getToken() {
  const t = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')).tokens;
  if (t.expires_at > Date.now() + 60000) return t.access_token;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      refresh_token: t.refresh_token,
      grant_type: 'refresh_token'
    })
  });
  return (await r.json()).access_token;
}

function val(fields, key) {
  const f = fields?.[key];
  if (!f) return null;
  if (f.stringValue != null) return f.stringValue;
  if (f.integerValue != null) return parseInt(f.integerValue, 10);
  if (f.booleanValue != null) return f.booleanValue;
  return null;
}

function fieldsObj(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') out[k] = { integerValue: String(v) };
    else if (typeof v === 'string') out[k] = { stringValue: v };
    else if (typeof v === 'boolean') out[k] = { booleanValue: v };
  }
  return out;
}

async function queryByPid(tok, pid) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'predicciones' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'pid' },
          op: 'EQUAL',
          value: { stringValue: pid }
        }
      }
    }
  };
  await new Promise(r => setTimeout(r, 800));
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`query ${pid}: ${r.status} ${text.slice(0, 150)}`);
  const rows = JSON.parse(text);
  return rows.filter(x => x.document).map(x => ({
    id: x.document.name.split('/').pop(),
    uid: val(x.document.fields, 'uid'),
    gl: val(x.document.fields, 'gl'),
    gv: val(x.document.fields, 'gv'),
    nombre: val(x.document.fields, 'nombre'),
    supersededBy: val(x.document.fields, 'supersededBy')
  })).filter(p => !p.supersededBy);
}

async function queryHist(tok, pid) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'historial_predicciones' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'pid' },
          op: 'EQUAL',
          value: { stringValue: pid }
        }
      }
    }
  };
  await new Promise(r => setTimeout(r, 800));
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) return [];
  const rows = await r.json();
  return rows.filter(x => x.document).map(x => ({
    uid: val(x.document.fields, 'uid'),
    gl: val(x.document.fields, 'gl'),
    gv: val(x.document.fields, 'gv'),
    t: val(x.document.fields, 't'),
    nombre: val(x.document.fields, 'nombre'),
    accion: val(x.document.fields, 'accion')
  }));
}

async function getDoc(tok, col, id) {
  await new Promise(r => setTimeout(r, 400));
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${col}/${id}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`get ${id}: ${r.status}`);
  return r.json();
}

async function setDoc(tok, col, id, data) {
  await new Promise(r => setTimeout(r, 500));
  const mask = Object.keys(data).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${col}/${id}?${mask}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fieldsObj(data) })
  });
  if (!r.ok) throw new Error(`set ${id}: ${r.status} ${(await r.text()).slice(0, 150)}`);
}

async function deleteDoc(tok, col, id) {
  await new Promise(r => setTimeout(r, 500));
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${col}/${id}`;
  await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${tok}` } });
}

async function main() {
  const tok = await getToken();
  const res = await getDoc(tok, 'resultados', CANON);
  const aj = await getDoc(tok, 'ajustes', CANON);
  console.log('\n=== Costa de Marfil vs Noruega (ko-78) ===');
  if (res) console.log(`Resultado: ${val(res.fields, 'estado')} ${val(res.fields, 'gl')}-${val(res.fields, 'gv')}`);
  if (aj) console.log(`Ajuste: ${val(aj.fields, 'local')} vs ${val(aj.fields, 'visitante')}`);

  const canon = await queryByPid(tok, CANON);
  console.log(`\nPronósticos en ${CANON}: ${canon.length}`);
  canon.forEach(p => console.log(`  · ${p.nombre || p.uid}: ${p.gl}-${p.gv}`));

  const uidsCanon = new Set(canon.map(p => p.uid));
  let movidos = 0;

  for (const slot of ORPHAN_SLOTS) {
    const orphan = await queryByPid(tok, slot);
    if (!orphan.length) continue;
    console.log(`\nPronósticos en ${slot} (slot incorrecto): ${orphan.length}`);
    for (const p of orphan) {
      console.log(`  · ${p.nombre || p.uid}: ${p.gl}-${p.gv}`);
      if (!uidsCanon.has(p.uid)) {
        await setDoc(tok, 'predicciones', `${p.uid}__${CANON}`, {
          uid: p.uid, pid: CANON, pidCanon: CANON,
          gl: p.gl, gv: p.gv, nombre: p.nombre || '',
          t: Date.now(), aprobado: true, fueraDeTiempo: false, pendienteAprobacion: false
        });
        uidsCanon.add(p.uid);
        movidos++;
      }
      await deleteDoc(tok, 'predicciones', p.id);
    }
  }

  let restaurados = 0;
  for (const pid of [CANON, ...ORPHAN_SLOTS]) {
    const hist = await queryHist(tok, pid);
    const ultimo = new Map();
    for (const h of hist) {
      if (h.accion === 'eliminar' || h.gl == null) continue;
      const prev = ultimo.get(h.uid);
      if (!prev || (h.t || 0) >= (prev.t || 0)) ultimo.set(h.uid, h);
    }
    for (const [uid, h] of ultimo) {
      if (uidsCanon.has(uid)) continue;
      await setDoc(tok, 'predicciones', `${uid}__${CANON}`, {
        uid, pid: CANON, pidCanon: CANON,
        gl: h.gl, gv: h.gv, nombre: h.nombre || '',
        t: h.t || Date.now(), aprobado: true, fueraDeTiempo: false, pendienteAprobacion: false
      });
      uidsCanon.add(uid);
      restaurados++;
      console.log(`\nRestaurado historial: ${h.nombre || uid} (${h.gl}-${h.gv})`);
    }
  }

  const final = await queryByPid(tok, CANON);
  console.log(`\n=== RESUMEN ===`);
  console.log(`Migrados desde slot incorrecto: ${movidos}`);
  console.log(`Restaurados desde historial: ${restaurados}`);
  console.log(`Total en ko-78 ahora: ${final.length}`);
  final.forEach(p => console.log(`  ✓ ${p.nombre || p.uid}: ${p.gl}-${p.gv}`));
  console.log('');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
