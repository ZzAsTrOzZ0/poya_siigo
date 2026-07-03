/**
 * Escribe marcadores faltantes vía Firestore REST (token firebase login).
 * Solo los partidos indicados — no toca pronósticos.
 */
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const PROJECT = 'polla-mundialista-siigo';
const CONFIG_PATH = join(homedir(), '.config', 'configstore', 'firebase-tools.json');

function loadTokens() {
  const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  return cfg.tokens;
}

async function refreshAccessToken(tokens) {
  if (tokens.access_token && tokens.expires_at > Date.now() + 60000) {
    return tokens.access_token;
  }
  const body = new URLSearchParams({
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9VdFCHg8qqXkK0j7G1G2Q8K1G2Q8K1G', // firebase-tools public client - may not need secret
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token'
  });
  // Firebase CLI uses google-auth-library internally; try without secret first via google endpoint
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token'
    })
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('No access_token: ' + JSON.stringify(j));
  return j.access_token;
}

function fields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') out[k] = { integerValue: String(v) };
    else if (typeof v === 'string') out[k] = { stringValue: v };
    else if (typeof v === 'boolean') out[k] = { booleanValue: v };
  }
  return out;
}

async function patchDoc(token, collection, docId, data) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collection}/${docId}?` +
    Object.keys(data).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const r = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields: fields(data) })
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${collection}/${docId} ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function getDoc(token, collection, docId) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collection}/${docId}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${docId}: ${r.status}`);
  return r.json();
}

const MARCADORES = [
  { pid: 'ko-78', gl: 1, gv: 2, local: 'CIV', visitante: 'NOR', nota: 'Costa de Marfil vs Noruega' }
];

async function main() {
  const tokens = loadTokens();
  const token = await refreshAccessToken(tokens);

  for (const m of MARCADORES) {
    try {
      await patchDoc(token, 'resultados', m.pid, {
        gl: m.gl,
        gv: m.gv,
        estado: 'finalizado',
        t: Date.now()
      });
      console.log(`✓ ${m.pid} ${m.nota}: ${m.gl}-${m.gv} FT`);
    } catch (e) {
      console.error(`✗ resultados/${m.pid}:`, e.message);
    }
    if (m.local) {
      try {
        await patchDoc(token, 'ajustes', m.pid, {
          local: m.local,
          visitante: m.visitante,
          horaOk: true
        });
        console.log(`  ✓ ajustes equipos OK`);
      } catch (e) {
        console.error(`  ✗ ajustes/${m.pid}:`, e.message);
      }
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log('\nListo.');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
