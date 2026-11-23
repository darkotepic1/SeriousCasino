// Cases & Case Battles (eigene, erfundene Skins – im Stil von Shooter-Cases).
// Solo: Case kaufen, Skin ziehen, Wert sofort als Chips gutgeschrieben (Auszahlungsquote ≈ 92 %).
// Battle: 2–4 Spieler öffnen dieselben Cases, wer den höchsten Gesamtwert zieht, bekommt ALLE gezogenen Skins (als Chips).
// Leere Plätze können mit Bots gefüllt werden – gewinnt ein Bot, geht der Topf an das Haus.
const crypto = require('crypto');
const db = require('./db');
const profiles = require('./profiles');
const { randInt, GameError } = require('./util');

const RTP = 0.92;
const RARITY = {
  common: { name: 'Gewöhnlich', color: '#4b69ff', weight: 79920 },
  rare: { name: 'Selten', color: '#8847ff', weight: 15980 },
  epic: { name: 'Episch', color: '#d32ce6', weight: 3200 },
  legendary: { name: 'Legendär', color: '#eb4b4b', weight: 640 },
  mythic: { name: 'Mythisch ★', color: '#e4ae39', weight: 260 },
};

// [Waffe, Muster, Seltenheit, Basiswert] – Werte werden unten auf die Ziel-Quote skaliert
const T = { P: ['🔫', 'Pistole'], S: ['🔫', 'MP'], R: ['🔫', 'Sturmgewehr'], A: ['🎯', 'Scharfschütze'], K: ['🗡️', 'Messer'], G: ['🧤', 'Handschuhe'], H: ['💣', 'Granate'] };
const CASE_DEFS = [
  { id: 'street', name: 'Straßen-Case', price: 100, color: '#4a6b8a', items: [
    ['P', 'Asphalt', 'common', 20], ['S', 'Graffiti', 'common', 25], ['R', 'Betongrau', 'common', 30], ['H', 'Rostig', 'common', 15], ['P', 'Ziegelrot', 'common', 35],
    ['R', 'Nachtschicht', 'rare', 120], ['S', 'Hinterhof', 'rare', 150], ['A', 'Stadtnebel', 'rare', 180],
    ['R', 'Neonschild', 'epic', 600], ['P', 'Sprühnebel', 'epic', 750],
    ['A', 'Mitternacht', 'legendary', 2500], ['K', 'Straßenkatze', 'mythic', 6000], ['G', 'Kiezboxer', 'mythic', 9000],
  ] },
  { id: 'neon', name: 'Neon-Case', price: 500, color: '#8a2be2', items: [
    ['P', 'Cyan-Puls', 'common', 120], ['S', 'Laserlinie', 'common', 140], ['R', 'Pixelnebel', 'common', 160], ['H', 'Glimmer', 'common', 100], ['A', 'Raster', 'common', 180],
    ['R', 'Synthwave', 'rare', 700], ['P', 'Magenta', 'rare', 800], ['S', 'Arcade', 'rare', 900],
    ['R', 'Neon-Viper', 'epic', 3200], ['A', 'Lichtspur', 'epic', 4000],
    ['R', 'Hyperdrive', 'legendary', 12000], ['K', 'Neonklinge', 'mythic', 30000], ['G', 'Plasma', 'mythic', 45000],
  ] },
  { id: 'gold', name: 'Gold-Case', price: 2500, color: '#b8860b', items: [
    ['P', 'Messing', 'common', 600], ['S', 'Bronzeguss', 'common', 700], ['R', 'Sandstein', 'common', 800], ['H', 'Kupfer', 'common', 500], ['A', 'Wüstensand', 'common', 900],
    ['R', 'Goldader', 'rare', 3500], ['P', 'Pharao', 'rare', 4000], ['A', 'Sonnenkönig', 'rare', 4500],
    ['R', 'Goldrausch', 'epic', 16000], ['P', 'Schatzkammer', 'epic', 20000],
    ['A', 'Midas', 'legendary', 60000], ['K', 'Goldene Klinge', 'mythic', 150000], ['G', 'Königshand', 'mythic', 220000],
  ] },
  { id: 'diamond', name: 'Diamant-Case', price: 10000, color: '#2aa7c9', items: [
    ['P', 'Eisblau', 'common', 2400], ['S', 'Frost', 'common', 2800], ['R', 'Gletscher', 'common', 3200], ['H', 'Kristall', 'common', 2000], ['A', 'Polarlicht', 'common', 3600],
    ['R', 'Saphir', 'rare', 14000], ['P', 'Aquamarin', 'rare', 16000], ['A', 'Eisdrache', 'rare', 18000],
    ['R', 'Diamantstaub', 'epic', 64000], ['A', 'Brillant', 'epic', 80000],
    ['R', 'Kronjuwel', 'legendary', 240000], ['K', 'Diamantklinge', 'mythic', 600000], ['G', 'Eiskönig', 'mythic', 900000],
  ] },
];

/** Gewichte + auf Ziel-Quote skalierte Werte berechnen */
const CASES = CASE_DEFS.map((c) => {
  const count = {};
  c.items.forEach(([, , r]) => (count[r] = (count[r] || 0) + 1));
  const items = c.items.map(([t, finish, rarity, base], i) => ({
    i, icon: T[t][0], weapon: T[t][1], finish, rarity, base, weight: Math.round(RARITY[rarity].weight / count[rarity]),
  }));
  const totalW = items.reduce((a, x) => a + x.weight, 0);
  const ev = items.reduce((a, x) => a + (x.weight / totalW) * x.base, 0);
  const s = (c.price * RTP) / ev;
  items.forEach((x) => { x.value = Math.max(1, Math.round(x.base * s)); x.chance = x.weight / totalW; });
  return { id: c.id, name: c.name, price: c.price, color: c.color, items, totalW };
});
const byId = Object.fromEntries(CASES.map((c) => [c.id, c]));

function roll(c) {
  let r = randInt(0, c.totalW);
  for (const it of c.items) { r -= it.weight; if (r < 0) return it; }
  return c.items[0];
}
const itemView = (it) => ({ i: it.i, icon: it.icon, weapon: it.weapon, finish: it.finish, rarity: it.rarity, value: it.value });

function info() {
  return {
    rarities: Object.fromEntries(Object.entries(RARITY).map(([k, r]) => [k, { name: r.name, color: r.color }])),
    cases: CASES.map((c) => ({ id: c.id, name: c.name, price: c.price, color: c.color, items: c.items.map((it) => ({ ...itemView(it), chance: it.chance })) })),
  };
}

// ---------- Solo öffnen ----------
function open(p, body) {
  const c = byId[body.caseId];
  if (!c) throw new GameError('Unbekanntes Case.');
  if (p.balance < c.price) throw new GameError('Nicht genug Chips.');
  p.balance -= c.price;
  const it = roll(c);
  p.balance += it.value;
  profiles.record(p, 'caseopen', c.price, it.value, `${c.name}: ${it.weapon} | ${it.finish} (${RARITY[it.rarity].name})`);
  return { item: itemView(it), caseId: c.id };
}

// ---------- Battles ----------
const ROUND_MS = 4500;
const COUNTDOWN_MS = 3000;
const WAIT_MS = 15 * 60 * 1000;
const BOT_NAMES = ['Bot Kalle', 'Bot Ingrid', 'Bot Rudi', 'Bot Erna', 'Bot Horst', 'Bot Gisela'];

const battles = () => (db.get().battles ||= {});
const cost = (b) => byId[b.caseId].price * b.rounds;

function refund(b) {
  for (const pl of b.players) if (pl.pid) { const p = db.get().profiles[pl.pid]; if (p) p.balance += cost(b); }
}

function startBattle(b) {
  const c = byId[b.caseId];
  b.status = 'running';
  b.startAt = Date.now() + COUNTDOWN_MS;
  b.players.forEach((pl) => { pl.items = Array.from({ length: b.rounds }, () => roll(c).i); });
}

function settle(b) {
  const c = byId[b.caseId];
  const totals = b.players.map((pl) => pl.items.reduce((a, i) => a + c.items[i].value, 0));
  const pot = totals.reduce((a, x) => a + x, 0);
  const best = Math.max(...totals);
  const winners = b.players.map((pl, i) => (totals[i] === best ? i : -1)).filter((i) => i >= 0);
  const share = Math.floor(pot / winners.length);
  b.status = 'done';
  b.totals = totals;
  b.pot = pot;
  b.winners = winners;
  b.players.forEach((pl, i) => {
    if (!pl.pid) return;
    const p = db.get().profiles[pl.pid];
    if (!p) return;
    const payout = winners.includes(i) ? share : 0;
    p.balance += payout;
    profiles.record(p, 'casebattle', cost(b), payout, `Case Battle (${c.name} ×${b.rounds}, ${b.players.length} Spieler): ${payout ? 'gewonnen' : 'verloren'}`);
  });
  // alte Battles aufräumen
  const done = Object.values(battles()).filter((x) => x.status === 'done' || x.status === 'cancelled').sort((a, c2) => (c2.startAt || c2.createdAt) - (a.startAt || a.createdAt));
  for (const x of done.slice(40)) delete battles()[x.id];
}

function tickBattle(b, now = Date.now()) {
  if (b.status === 'waiting' && now - b.createdAt > WAIT_MS) { refund(b); b.status = 'cancelled'; }
  if (b.status === 'running' && now >= b.startAt + b.rounds * ROUND_MS + 800) settle(b);
}
function tickAll() { Object.values(battles()).forEach((b) => tickBattle(b)); }

function battleView(b, me) {
  const now = Date.now();
  const c = byId[b.caseId];
  const reveal = b.status === 'done' ? b.rounds : b.status === 'running' ? Math.max(0, Math.min(b.rounds, Math.floor((now - b.startAt) / ROUND_MS))) : 0;
  return {
    id: b.id, caseId: b.caseId, caseName: c.name, price: c.price, rounds: b.rounds, slots: b.slots, status: b.status,
    cost: cost(b), createdAt: b.createdAt, startAt: b.startAt || null, now, roundMs: ROUND_MS,
    mine: b.players[0]?.pid === me, joined: b.players.some((pl) => pl.pid === me),
    // Gezogene Skins werden erst geschickt, wenn die Runde begonnen hat (sonst könnte man spicken)
    players: b.players.map((pl, i) => ({
      name: pl.name, bot: !pl.pid, me: pl.pid === me,
      items: b.status === 'running' || b.status === 'done' ? pl.items.slice(0, Math.min(b.rounds, b.status === 'done' ? b.rounds : Math.max(0, Math.floor((now - b.startAt) / ROUND_MS) + 1))).map((x) => itemView(c.items[x])) : [],
      total: b.status === 'done' ? b.totals[i] : null,
      winner: b.status === 'done' ? b.winners.includes(i) : null,
    })),
    revealed: reveal,
    pot: b.status === 'done' ? b.pot : null,
  };
}

function find(id) {
  const b = typeof id === 'string' ? battles()[id] : null;
  if (!b) throw new GameError('Battle nicht gefunden.', 404);
  tickBattle(b);
  return b;
}

function list(p) {
  tickAll();
  const all = Object.values(battles());
  const sort = (a, b) => (b.startAt || b.createdAt) - (a.startAt || a.createdAt);
  return {
    waiting: all.filter((b) => b.status === 'waiting').sort(sort).map((b) => battleView(b, p.id)),
    running: all.filter((b) => b.status === 'running').sort(sort).map((b) => battleView(b, p.id)),
    done: all.filter((b) => b.status === 'done').sort(sort).slice(0, 10).map((b) => battleView(b, p.id)),
  };
}

function create(p, body) {
  const c = byId[body.caseId];
  if (!c) throw new GameError('Bitte ein Case wählen.');
  const rounds = Number(body.rounds), slots = Number(body.slots);
  if (![1, 2, 3, 4, 5].includes(rounds)) throw new GameError('1 bis 5 Runden.');
  if (![2, 3, 4].includes(slots)) throw new GameError('2, 3 oder 4 Spieler.');
  const price = c.price * rounds;
  if (p.balance < price) throw new GameError('Nicht genug Chips.');
  tickAll();
  if (Object.values(battles()).filter((b) => b.status === 'waiting' && b.players[0].pid === p.id).length >= 3) throw new GameError('Du hast schon 3 offene Battles.');
  p.balance -= price;
  const b = { id: crypto.randomUUID(), caseId: c.id, rounds, slots, status: 'waiting', createdAt: Date.now(), players: [{ pid: p.id, name: p.name }] };
  battles()[b.id] = b;
  return battleView(b, p.id);
}

function join(p, body) {
  const b = find(body.id);
  if (b.status !== 'waiting') throw new GameError('Dieses Battle läuft schon oder ist vorbei.');
  if (b.players.some((pl) => pl.pid === p.id)) throw new GameError('Du bist schon dabei.');
  if (p.balance < cost(b)) throw new GameError('Nicht genug Chips.');
  p.balance -= cost(b);
  b.players.push({ pid: p.id, name: p.name });
  if (b.players.length >= b.slots) startBattle(b);
  return battleView(b, p.id);
}

function bots(p, body) {
  const b = find(body.id);
  if (b.status !== 'waiting' || b.players[0].pid !== p.id) throw new GameError('Nur der Ersteller kann Bots hinzufügen.');
  const names = BOT_NAMES.filter((n) => !b.players.some((pl) => pl.name === n));
  while (b.players.length < b.slots) b.players.push({ pid: null, name: names.splice(randInt(0, names.length), 1)[0] });
  startBattle(b);
  return battleView(b, p.id);
}

function cancel(p, body) {
  const b = find(body.id);
  if (b.status !== 'waiting' || b.players[0].pid !== p.id) throw new GameError('Nur der Ersteller kann ein wartendes Battle abbrechen.');
  refund(b);
  b.status = 'cancelled';
  return battleView(b, p.id);
}

function get(p, body) {
  return battleView(find(body.id), p.id);
}

module.exports = { actions: { info, open, list, create, join, bots, cancel, get }, _internal: { CASES, roll } };
