// Glücksrad: 30 Felder, drei Risikostufen, jeweils 99 % Auszahlungsquote.
const { randInt, parseBet, payoutFor, GameError } = require('../util');
const profiles = require('../profiles');

// Feldverteilung je Risiko: [Multiplikator, Anzahl]
const DIST = {
  low: [[0, 7], [1.2, 16], [1.5, 7]],
  medium: [[0, 16], [1.5, 6], [2, 5], [3, 2], [4.7, 1]],
  high: [[0, 29], [29.7, 1]],
};
const RISK_NAMES = { low: 'niedrig', medium: 'mittel', high: 'hoch' };

/** Verteilt die Felder gleichmäßig gemischt über das Rad (immer gleiche Anordnung) */
function layout(dist) {
  const total = dist.reduce((a, [, n]) => a + n, 0);
  const slots = new Array(total).fill(null);
  // seltene Felder zuerst, möglichst weit auseinander
  const sorted = [...dist].sort((a, b) => a[1] - b[1]);
  for (const [m, n] of sorted) {
    let placed = 0;
    for (let i = 0; placed < n; i++) {
      let pos = Math.floor(((i + 0.5) * total) / n) % total;
      while (slots[pos] !== null) pos = (pos + 1) % total;
      slots[pos] = m;
      placed++;
    }
  }
  return slots;
}
const WHEELS = Object.fromEntries(Object.entries(DIST).map(([k, d]) => [k, layout(d)]));

function info() {
  return { wheels: WHEELS };
}

function spin(p, body) {
  const risk = String(body.risk);
  if (!Object.hasOwn(WHEELS, risk)) throw new GameError('Ungültiges Risiko.');
  const bet = parseBet(body.bet, p);
  p.balance -= bet;
  const wheel = WHEELS[risk];
  const index = randInt(0, wheel.length);
  const mult = wheel[index];
  const payout = payoutFor(bet, mult);
  p.balance += payout;
  profiles.record(p, 'wheel', bet, payout, `Risiko ${RISK_NAMES[risk]}: ${mult}×`);
  return { index, multiplier: mult, payout, bet, risk };
}

module.exports = { info, spin };
module.exports._internal = { WHEELS };
