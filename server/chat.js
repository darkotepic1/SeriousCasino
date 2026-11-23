// Chat für alle Spieler + Systemmeldungen (Stufenaufstiege, Geschenke, Wochensieger).
// Die letzten 100 Nachrichten werden gespeichert.
const crypto = require('crypto');
const db = require('./db');
const { GameError } = require('./util');

const MAX = 100;
const lastSent = new Map(); // Spieler-ID → Zeitpunkt (Spam-Schutz)

const store = () => (db.get().chat ||= []);

function add(msg) {
  const list = store();
  list.push({ id: crypto.randomUUID().slice(0, 8), at: Date.now(), ...msg });
  if (list.length > MAX) list.splice(0, list.length - MAX);
}

function post(p, text) {
  const t = String(text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 240);
  if (!t) throw new GameError('Leere Nachricht.');
  const now = Date.now();
  if (now - (lastSent.get(p.id) || 0) < 1200) throw new GameError('Nicht so schnell 🙂');
  lastSent.set(p.id, now);
  add({ name: p.name, level: p.vip?.level || 1, text: t });
}

/** Systemmeldung – während die Admin-Glückssteuerung neu auslost, erst nach dem endgültigen Ergebnis */
function system(text) {
  const live = require('./live');
  if (live.holding()) live.queue({ __chat: text });
  else add({ system: true, text });
}

function list(since = 0) {
  return store().filter((m) => m.at > since).slice(-60);
}

module.exports = { post, system, list, add };
