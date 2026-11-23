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

/** Großer Gewinn → in den Feed (ab 10× Einsatz und mindestens 1.000 Chips Gewinn) */
function noteRound(p, game, bet, payout) {
  const net = payout - bet;
  if (bet > 0 && net >= 1000 && payout >= bet * 10) push({ type: 'bigwin', name: p.name, game, net, mult: Math.round((payout / bet) * 100) / 100 });
}

// Während der Admin-Glückssteuerung neu ausgelost wird, Feed-Einträge zurückhalten
let held = null;
function hold() { held = []; }
function release() { const h = held; held = null; (h || []).forEach(push); }
function discard() { held = []; }

function push(item) {
  if (held) { held.push(item); return; }
  feed.unshift({ ...item, at: Date.now() });
  if (feed.length > FEED_MAX) feed.length = FEED_MAX;
}

function recent() {
  return feed.slice(0, 15);
}

module.exports = { touch, online, noteRound, push, recent, hold, release, discard };
