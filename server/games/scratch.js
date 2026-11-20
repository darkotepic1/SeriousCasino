// Rubbellos: 9 Felder – drei gleiche Symbole gewinnen den Preis des Symbols.
// Ergebnis steht beim Kauf fest (wie beim echten Los). Auszahlungsquote 95 %.
const { randInt, shuffle, parseBet, payoutFor } = require('../util');
const profiles = require('../profiles');

const SYMBOLS = [
  { id: 'bag', icon: '💰', pay: 500, weight: 40 },
  { id: 'gem', icon: '💎', pay: 100, weight: 150 },
  { id: 'crown', icon: '👑', pay: 20, weight: 750 },
  { id: 'clover', icon: '🍀', pay: 5, weight: 4000 },
  { id: 'cherry', icon: '🍒', pay: 2, weight: 12500 },
];
const TOTAL = 100000; // Rest = Niete

function pickOutcome() {
  let r = randInt(0, TOTAL);
  for (let i = 0; i < SYMBOLS.length; i++) {
    r -= SYMBOLS[i].weight;
    if (r < 0) return i;
  }
  return -1;
}

/** Baut ein 3×3-Feld: bei Gewinn genau 3× das Gewinnsymbol, alle anderen höchstens 2× */
function buildGrid(win) {
  const cells = [];
  if (win >= 0) cells.push(win, win, win);
  const counts = new Array(SYMBOLS.length).fill(0);
  if (win >= 0) counts[win] = 3;
  while (cells.length < 9) {
    const s = randInt(0, SYMBOLS.length);
    if (counts[s] >= 2) continue;
    counts[s]++;
    cells.push(s);
  }
  return shuffle(cells);
}

function info() {
  return { symbols: SYMBOLS.map(({ id, icon, pay }) => ({ id, icon, pay })) };
}

function buy(p, body) {
  const bet = parseBet(body.bet, p);
  p.balance -= bet;
  const win = pickOutcome();
  const grid = buildGrid(win);
  const mult = win >= 0 ? SYMBOLS[win].pay : 0;
  const payout = payoutFor(bet, mult);
  p.balance += payout;
  profiles.record(p, 'scratch', bet, payout, win >= 0 ? `3× ${SYMBOLS[win].icon} = ${mult}×` : 'Niete');
  return { grid, win, multiplier: mult, payout, bet };
}

module.exports = { info, buy };
module.exports._internal = { SYMBOLS, TOTAL, buildGrid };
