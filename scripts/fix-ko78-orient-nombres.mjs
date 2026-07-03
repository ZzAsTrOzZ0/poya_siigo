/**
 * Corrige orientación (gl↔gv) y nombres de preds ko-78 recuperados desde ko-76.
 */
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const PROJECT = 'polla-mundialista-siigo';
const CONFIG_PATH = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
const CANON = 'ko-78';

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

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function queryByPid(tok, pid) {
  await sleep(1200);
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'predicciones' }],
      where: { fieldFilter: { field: { fieldPath: 'pid' }, op: 'EQUAL', value: { stringValue: pid } } }
    }
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`query ${pid}: ${r.status}`);
  return (await r.json()).filter(x => x.document).map(x => ({
    id: x.document.name.split('/').pop(),
    uid: val(x.document.fields, 'uid'),
    gl: val(x.document.fields, 'gl'),
    gv: val(x.document.fields, 'gv'),
    nombre: val(x.document.fields, 'nombre'),
    orientacionCorregida: val(x.document.fields, 'orientacionCorregida'),
    recuperadoDesdeSlot: val(x.document.fields, 'recuperadoDesdeSlot'),
    recuperadoDesdeHistorial: val(x.document.fields, 'recuperadoDesdeHistorial'),
    supersededBy: val(x.document.fields, 'supersededBy')
  })).filter(p => !p.supersededBy);
}

async function listUsuarios(tok) {
  await sleep(1200);
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/usuarios?pageSize=300`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
  if (!r.ok) throw new Error(`usuarios: ${r.status}`);
  const data = await r.json();
  const map = {};
  for (const doc of data.documents || []) {
    const uid = doc.name.split('/').pop();
    map[uid] = val(doc.fields, 'nombre');
  }
  return map;
}

async function patchPred(tok, id, data) {
  await sleep(800);
  const mask = Object.keys(data).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/predicciones/${id}?${mask}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fieldsObj(data) })
  });
  if (!r.ok) throw new Error(`patch ${id}: ${r.status} ${(await r.text()).slice(0, 120)}`);
}

async function main() {
  const tok = await getToken();
  const [preds, mapNom] = await Promise.all([queryByPid(tok, CANON), listUsuarios(tok)]);
  console.log(`\n=== P78 (${CANON}): ${preds.length} pronósticos ===\n`);

  let orient = 0;
  let nombres = 0;
  for (const p of preds) {
    const patch = {};
    const debeInvertir = !p.orientacionCorregida
      && (p.recuperadoDesdeSlot === 'ko-76' || p.recuperadoDesdeHistorial);
    if (debeInvertir && p.gl != null && p.gv != null) {
      patch.gl = p.gv;
      patch.gv = p.gl;
      patch.orientacionCorregida = true;
      patch.orientacionCorregidaEn = Date.now();
      orient++;
    }
    const nom = mapNom[p.uid];
    if (nom && nom !== p.nombre) {
      patch.nombre = nom;
      nombres++;
    }
    if (!Object.keys(patch).length) {
      console.log(`  · ${p.nombre || mapNom[p.uid] || p.uid}: ${p.gl}-${p.gv} (sin cambios)`);
      continue;
    }
    await patchPred(tok, p.id, patch);
    const gl = patch.gl ?? p.gl;
    const gv = patch.gv ?? p.gv;
    console.log(`  ✓ ${nom || p.nombre || p.uid}: ${p.gl}-${p.gv} → ${gl}-${gv}`);
  }

  console.log(`\n=== RESUMEN ===`);
  console.log(`Orientación corregida: ${orient}`);
  console.log(`Nombres actualizados: ${nombres}\n`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
