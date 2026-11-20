// Speichert alle Daten in einer lokalen JSON-Datei (data/db.json).
const fs = require('fs');
const path = require('path');

// optional eigener Datenordner (z. B. für Tests, damit echte Spielstände unberührt bleiben)
const DATA_DIR = process.env.CASINO_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');

let data = null;

function fresh() {
  return { version: 1, profiles: {} };
}

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch (e) {
      // Kaputte Datei nicht löschen, sondern beiseitelegen
      const backup = FILE.replace(/\.json$/, `.kaputt-${Date.now()}.json`);
      fs.copyFileSync(FILE, backup);
      console.warn(`db.json war beschädigt – Sicherung unter ${backup} angelegt, starte neu.`);
      data = fresh();
    }
  } else {
    data = fresh();
  }
  if (!data.profiles || typeof data.profiles !== 'object') data.profiles = {};
  save();
  return data;
}

function save() {
  const json = JSON.stringify(data, null, 1);
  const tmp = FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, FILE);
  } catch (e) {
    // Fallback (z. B. wenn ein Virenscanner die Datei kurz sperrt)
    fs.writeFileSync(FILE, json);
  }
}

function get() {
  return data;
}

module.exports = { load, save, get, FILE };
