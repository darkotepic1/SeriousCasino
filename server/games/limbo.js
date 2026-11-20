// Limbo: Wähle einen Ziel-Multiplikator. Liegt das Zufallsergebnis darüber (oder gleich), gewinnst du Einsatz × Ziel.
// P(Ergebnis ≥ Ziel) = 0,99 / Ziel → 1 % Hausvorteil.
const { randFloat, parseBet, payoutFor, GameError } = require('../util');
const profiles = require('../profiles');

const MIN = 1.01, MAX = 1000000;

function info() {
  return { min: MIN, max: MAX };
}

function play(p, body) {
  const target = Math.floor(Number(body.target) * 100) / 100;
  if (!Number.isFinite(target) || target < MIN || target > MAX) throw new GameError('Ziel: 1,01× bis 1.000.000×.');
  const bet = parseBet(body.bet, p);
  p.balance -= bet;
  const u = randFloat();
  // Ergebnis mit P(r ≥ t) = 0,99 / t
  const result = Math.max(1, Math.min(MAX, Math.floor((0.99 / (1 - u)) * 100) / 100));
  const won = 0.99 / (1 - u) >= target;
  const payout = won ? payoutFor(bet, target) : 0;
  p.balance += payout;
  profiles.record(p, 'limbo', bet, payout, `Ziel ${target.toFixed(2)}×, Ergebnis ${result.toFixed(2)}×`);
  return { result, target, won, payout, bet, chance: Math.min(99, 99 / target) };
}

module.exports = { info, play };
