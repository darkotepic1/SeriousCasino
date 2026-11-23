// Speichert alle Daten.
// - Standard: lokale JSON-Datei (data/db.json)
// - Cloud (Umgebungsvariable DATABASE_URL gesetzt, z. B. kostenlose Neon-Datenbank): als ein JSON-Dokument in PostgreSQL.
//   Kostenlose Server (Render) verlieren ihre Dateien bei jedem Neustart – deshalb dort die Datenbank.
const fs = require('fs');
const path = require('path');

// optional eigener Datenordner (z. B. für Tests, damit echte Spielstände unberührt bleiben)
const DATA_DIR = process.env.CASINO_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');
const DATABASE_URL = process.env.DATABASE_URL || '';

let data = null;

function fresh() {
  return { version: 1, profiles: {} };
}

function normalize(d) {
  if (!d || typeof d !== 'object') d = fresh();
  if (!d.profiles || typeof d.profiles !== 'object') d.profiles = {};
  return d;
}

// ---------- Datei ----------
const fileStore = {
  name: 'Datei',
  async read() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE)) return null;
    try {
      return JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch (e) {
      // Kaputte Datei nicht löschen, sondern beiseitelegen
      const backup = FILE.replace(/\.json$/, `.kaputt-${Date.now()}.json`);
      fs.copyFileSync(FILE, backup);
      console.warn(`db.json war beschädigt – Sicherung unter ${backup} angelegt, starte neu.`);
      return null;
    }
  },
  writeSync(json) {
    const tmp = FILE + '.tmp';
    try {
      fs.writeFileSync(tmp, json);
      fs.renameSync(tmp, FILE);
    } catch (e) {
      // Fallback (z. B. wenn ein Virenscanner die Datei kurz sperrt)
      fs.writeFileSync(FILE, json);
    }
  },
};

// ---------- PostgreSQL ----------
function makePgStore(Pool, connectionString) {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  const pool = new Pool({ connectionString, ssl: local ? false : { rejectUnauthorized: true }, max: 3, idleTimeoutMillis: 30000 });
  pool.on('error', (e) => console.warn('Datenbank-Verbindung unterbrochen (wird neu aufgebaut):', e.message));
  return {
    name: 'Datenbank',
    pool,
    async read() {
      try {
        const r = await pool.query('SELECT data FROM casino_state WHERE id = 1');
        return r.rows[0]?.data ?? null;
      } catch (e) {
        if (e.code !== '42P01' && !/does not exist|not found/i.test(e.message)) throw e;
        // Erster Start: Tabelle anlegen
        await pool.query(`CREATE TABLE casino_state (
          id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
        return null;
      }
    },
    async write(json) {
      await pool.query(
        `INSERT INTO casino_state (id, data, updated_at) VALUES (1, $1::jsonb, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [json],
      );
    },
  };
}

let store = fileStore;
if (DATABASE_URL) {
  const { Pool } = require('pg');
  store = makePgStore(Pool, DATABASE_URL);
}

// Schreiben in die Datenbank: nie zwei gleichzeitig, immer der neueste Stand zuletzt
let writing = null;
let dirty = false;
function scheduleDbWrite() {
  dirty = true;
  if (writing) return;
  writing = (async () => {
    while (dirty) {
      dirty = false;
      const json = JSON.stringify(data);
      for (let attempt = 1; ; attempt++) {
        try {
          await store.write(json);
          break;
        } catch (e) {
          console.warn(`Speichern fehlgeschlagen (Versuch ${attempt}):`, e.message);
          // Datenbank nicht erreichbar: nach kurzer Pause weiter versuchen (Stand geht nicht verloren, er liegt im Speicher)
          await new Promise((r) => setTimeout(r, Math.min(10000, 1000 * attempt)));
        }
      }
    }
  })().finally(() => { writing = null; });
}

async function load() {
  data = normalize(await store.read());
  save();
  await flush();
  return data;
}

// Nur speichern, wenn sich wirklich etwas geändert hat (Live-Spiele fragen mehrmals pro Sekunde ab)
let lastSaved = null;
function save() {
  const json = JSON.stringify(data);
  if (json === lastSaved) return;
  lastSaved = json;
  if (store === fileStore) fileStore.writeSync(JSON.stringify(data, null, 1));
  else scheduleDbWrite();
}

/** Wartet, bis alles gespeichert ist (z. B. vor dem Herunterfahren) */
async function flush() {
  while (writing) await writing;
}

function get() {
  return data;
}

module.exports = { load, save, flush, get, FILE, storeName: () => store.name, _makePgStore: makePgStore };
