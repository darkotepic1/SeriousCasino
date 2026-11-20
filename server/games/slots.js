// Slots: 5 Walzen x 3 Reihen, 10 Gewinnlinien. Theoretische Auszahlungsquote ≈ 95,9 %.
// Gewinn: mind. 3 gleiche Symbole von links nach rechts auf einer Linie.
// Die Gewinne in PAYS gelten als Vielfaches des Linieneinsatzes (Gesamteinsatz / 10).
const { randInt, parseBet } = require('../util');
const profiles = require('../profiles');

const SYMBOLS = [
  { id: 'cherry', icon: '🍒', weight: 260, pays: [9, 25, 75] },
  { id: 'lemon', icon: '🍋', weight: 220, pays: [14, 40, 125] },
  { id: 'orange', icon: '🍊', weight: 180, pays: [20, 60, 200] },
  { id: 'grape', icon: '🍇', weight: 140, pays: [30, 100, 400] },
  { id: 'bell', icon: '🔔', weight: 90, pays: [60, 200, 750] },
  { id: 'star', icon: '⭐', weight: 60, pays: [120, 400, 1500] },
  { id: 'diamond', icon: '💎', weight: 35, pays: [300, 1200, 5000] },
  { id: 'seven', icon: '7️⃣', weight: 15, pays: [750, 4000, 25000] },
];
const TOTAL_WEIGHT = SYMBOLS.reduce((a, s) => a + s.weight, 0);

// Reihe pro Walze (0 = oben, 1 = Mitte, 2 = unten)
const LINES = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [1, 0, 1, 2, 1],
];
const MIN_BET = LINES.length;

function pickSymbol() {
  let r = randInt(0, TOTAL_WEIGHT);
  for (let i = 0; i < SYMBOLS.length; i++) {
    r -= SYMBOLS[i].weight;
    if (r < 0) return i;
  }
  return 0;
}

function info() {
  return {
    symbols: SYMBOLS.map(({ id, icon, pays }) => ({ id, icon, pays })),
    lines: LINES,
    minBet: MIN_BET,
  };
}

function spin(p, body) {
  const bet = parseBet(body.bet, p, MIN_BET);
  p.balance -= bet;

  // grid[walze][reihe] = Symbolindex
  const grid = Array.from({ length: 5 }, () => [pickSymbol(), pickSymbol(), pickSymbol()]);

  const wins = [];
  let totalMult = 0;
  LINES.forEach((line, li) => {
    const first = grid[0][line[0]];
    let count = 1;
    while (count < 5 && grid[count][line[count]] === first) count++;
    if (count >= 3) {
      const mult = SYMBOLS[first].pays[count - 3];
      totalMult += mult;
      wins.push({ line: li, symbol: first, count, mult, cells: line.slice(0, count).map((row, reel) => [reel, row]) });
    }
  });

  const payout = Math.floor((bet * totalMult) / LINES.length);
  wins.forEach((w) => (w.amount = Math.floor((bet * w.mult) / LINES.length)));
  p.balance += payout;
  const detail = wins.length ? wins.map((w) => `${w.count}× ${SYMBOLS[w.symbol].icon}`).join(', ') : 'kein Gewinn';
  profiles.record(p, 'slots', bet, payout, detail);
  return { grid, wins, payout, bet };
}

module.exports = { info, spin };
module.exports._internal = { SYMBOLS, LINES, TOTAL_WEIGHT };
