// Live-Bereich: wer ist gerade online (und wo), plus Feed mit großen Gewinnen.
// Alles nur im Arbeitsspeicher – nach einem Neustart beginnt der Feed leer.
const ONLINE_MS = 25 * 1000;
const FEED_MAX = 30;

const presence = new Map(); // profileId -> { name, where, at }
const feed = [];

function touch(p, where) {
  if (!p) return;
  const prev = presence.get(p.id);
  presence.set(p.id, { name: p.name, where: where || prev?.where || 'home', at: Date.now() });
}

function online() {
  const now = Date.now();
  const out = [];
  for (const [id, x] of presence) {
    if (now - x.at > ONLINE_MS) presence.delete(id);
    else out.push({ name: x.name, where: x.where });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

// Alle abgeschlossenen Runden (für "Alle Wetten" und "Top-Gewinne")
const BETS_MAX = 300;
const bets = [];

/** Großer Gewinn → in den Feed (ab 10× Einsatz und mindestens 1.000 Chips Gewinn) */
function noteRound(p, game, bet, payout) {
  if (game !== 'admin') {
    const entry = { name: p.name, game, bet, payout, mult: bet > 0 ? Math.round((payout / bet) * 100) / 100 : 0, at: Date.now() };
    if (held) held.push({ __bet: entry }); else pushBet(entry);
  }
  const net = payout - bet;
  if (bet > 0 && net >= 1000 && payout >= bet * 10) push({ type: 'bigwin', name: p.name, game, net, mult: Math.round((payout / bet) * 100) / 100 });
}

// Während der Admin-Glückssteuerung neu ausgelost wird, Feed-Einträge zurückhalten
let held = null;
function hold() { held = []; }
function release() {
  const h = held;
  held = null;
  (h || []).forEach((x) => (x.__bet ? pushBet(x.__bet) : x.__chat ? require('./chat').add({ system: true, text: x.__chat }) : push(x)));
}
const holding = () => !!held;
const queue = (x) => held?.push(x);

function pushBet(entry) {
  bets.unshift(entry);
  if (bets.length > BETS_MAX) bets.length = BETS_MAX;
}

/** Letzte Wetten (optional nur ein Spiel) und Top-Gewinne der letzten 24 h */
function betsView(game) {
  const list = game ? bets.filter((b) => b.game === game) : bets;
  const day = Date.now() - 24 * 3600 * 1000;
  const top = list.filter((b) => b.at > day && b.payout > b.bet).sort((a, b) => b.payout - b.bet - (a.payout - a.bet)).slice(0, 10);
  return { all: list.slice(0, 25), top };
}
function discard() { held = []; }

function push(item) {
  if (held) { held.push(item); return; }
  feed.unshift({ ...item, at: Date.now() });
  if (feed.length > FEED_MAX) feed.length = FEED_MAX;
}

function recent() {
  return feed.slice(0, 15);
}

module.exports = { touch, online, noteRound, push, recent, hold, release, discard, betsView, holding, queue };
