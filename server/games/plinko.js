// Plinko: Kugel fällt durch 8/12/16 Reihen, an jedem Stift 50:50 links/rechts.
// Multiplikator-Tabellen nach Risiko; Auszahlungsquote ≈ 99 %.
const { randInt, parseBet, payoutFor, GameError } = require('../util');
const profiles = require('../profiles');

const TABLES = {
  8: {
    low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
  },
  12: {
    low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
  },
  16: {
    low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
};
const RISK_NAMES = { low: 'niedrig', medium: 'mittel', high: 'hoch' };

function info() {
  return { tables: TABLES };
}

function drop(p, body) {
  const rows = Number(body.rows);
  const risk = String(body.risk);
  if (!TABLES[rows] || !Object.hasOwn(TABLES[rows], risk)) throw new GameError('Ungültige Reihen/Risiko-Auswahl.');
  const bet = parseBet(body.bet, p);
  p.balance -= bet;
  const path = Array.from({ length: rows }, () => randInt(0, 2)); // 0 = links, 1 = rechts
  const slot = path.reduce((a, b) => a + b, 0);
  const mult = TABLES[rows][risk][slot];
  const payout = payoutFor(bet, mult);
  p.balance += payout;
  profiles.record(p, 'plinko', bet, payout, `${rows} Reihen, Risiko ${RISK_NAMES[risk]}: ${mult}×`);
  return { path, slot, multiplier: mult, payout, bet, rows, risk };
}

module.exports = { info, drop };
module.exports._internal = { TABLES };
