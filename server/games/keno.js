// Keno: Zahlen 1–40, du wählst 1–10 Zahlen, der Server zieht 10.
// Die Gewinntabelle wird aus den exakten Wahrscheinlichkeiten berechnet (Auszahlungsquote ≈ 97 %).
const { shuffle, parseBet, payoutFor, GameError } = require('../util');
const profiles = require('../profiles');

const N = 40, DRAW = 10, MAX_PICKS = 10, RTP = 0.97, CAP = 10000;

const C = (n, k) => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};
const prob = (n, k) => (C(n, k) * C(N - n, DRAW - k)) / C(N, DRAW);
const round = (v) => (v < 10 ? Math.round(v * 100) / 100 : v < 100 ? Math.round(v * 10) / 10 : Math.round(v));

function buildTable(n) {
  const th = n <= 2 ? 1 : Math.ceil(n / 2);
  const base = Array.from({ length: n + 1 }, (_, k) => (k < th ? 0 : Math.pow(prob(n, k), -0.75)));
  const capped = new Set();
  let pays = [];
  for (let iter = 0; iter < 10; iter++) {
    // gedeckelte Stufen zahlen CAP, der Rest wird so skaliert, dass die Quote stimmt
    let fixed = 0, ev = 0;
    base.forEach((b, k) => {
      if (capped.has(k)) fixed += prob(n, k) * CAP;
      else ev += prob(n, k) * b;
    });
    const s = (RTP - fixed) / ev;
    pays = base.map((b, k) => (capped.has(k) ? CAP : b * s));
    const over = pays.findIndex((v, k) => v > CAP && !capped.has(k));
    if (over < 0) break;
    pays.forEach((v, k) => v > CAP && capped.add(k));
  }
  return pays.map(round);
}
const TABLES = {};
for (let n = 1; n <= MAX_PICKS; n++) TABLES[n] = buildTable(n);

function info() {
  return { numbers: N, draw: DRAW, maxPicks: MAX_PICKS, tables: TABLES };
}

function play(p, body) {
  const picks = Array.isArray(body.picks) ? [...new Set(body.picks.map(Number))] : [];
  if (!picks.length || picks.length > MAX_PICKS) throw new GameError(`Wähle 1 bis ${MAX_PICKS} Zahlen.`);
  if (picks.some((x) => !Number.isInteger(x) || x < 1 || x > N)) throw new GameError('Ungültige Zahl.');
  const bet = parseBet(body.bet, p);
  p.balance -= bet;
  const drawn = shuffle(Array.from({ length: N }, (_, i) => i + 1)).slice(0, DRAW);
  const hits = picks.filter((x) => drawn.includes(x));
  const mult = TABLES[picks.length][hits.length];
  const payout = payoutFor(bet, mult);
  p.balance += payout;
  profiles.record(p, 'keno', bet, payout, `${hits.length} von ${picks.length} Treffern (${mult}×)`);
  return { drawn, hits, multiplier: mult, payout, bet };
}

module.exports = { info, play };
module.exports._internal = { TABLES, prob };
