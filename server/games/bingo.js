// Schnell-Bingo: 5×5-Karte (B 1–15, I 16–30, N 31–45 mit freiem Feld, G 46–60, O 61–75).
// 40 von 75 Kugeln werden gezogen. Gewertet werden fertige Linien (5 Reihen, 5 Spalten, 2 Diagonalen).
// Auszahlungsquote ≈ 95 %.
const { shuffle, parseBet, payoutFor } = require('../util');
const profiles = require('../profiles');

const DRAWS = 40;
const PAYS = [0, 1.15, 2.8, 8, 20, 50, 100]; // Index = Anzahl Linien (6+ = 100×)
const LINES = [
  ...[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => r * 5 + c)),
  ...[0, 1, 2, 3, 4].map((c) => [0, 1, 2, 3, 4].map((r) => r * 5 + c)),
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

function newCard() {
  const card = new Array(25);
  for (let c = 0; c < 5; c++) {
    const col = shuffle(Array.from({ length: 15 }, (_, i) => c * 15 + i + 1)).slice(0, 5);
    for (let r = 0; r < 5; r++) card[r * 5 + c] = col[r];
  }
  card[12] = 0; // freies Feld
  return card;
}

function info() {
  return { draws: DRAWS, pays: PAYS };
}

function card(p) {
  if (!p.active.bingo) p.active.bingo = newCard();
  return { card: p.active.bingo };
}

function newcard(p) {
  p.active.bingo = newCard();
  return { card: p.active.bingo };
}

function play(p, body) {
  const c = p.active.bingo || (p.active.bingo = newCard());
  const bet = parseBet(body.bet, p);
  p.balance -= bet;
  const drawn = shuffle(Array.from({ length: 75 }, (_, i) => i + 1)).slice(0, DRAWS);
  const set = new Set(drawn);
  const marked = c.map((n) => n === 0 || set.has(n));
  const done = LINES.filter((l) => l.every((i) => marked[i]));
  const mult = PAYS[Math.min(done.length, PAYS.length - 1)];
  const payout = payoutFor(bet, mult);
  p.balance += payout;
  profiles.record(p, 'bingo', bet, payout, `${done.length} Linie(n) – ${mult}×`);
  return { card: c, drawn, lines: done, multiplier: mult, payout, bet };
}

module.exports = { info, card, newcard, play };
module.exports._internal = { PAYS, LINES, newCard };
