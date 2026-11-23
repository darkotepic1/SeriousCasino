// Hütchenspiel: Unter einem der Becher liegt die Kugel. Wähle 3, 4 oder 5 Becher –
// mehr Becher = schwerer, aber höherer Gewinn (Auszahlung 99 % der fairen Quote).
const { randInt, parseBet, payoutFor, GameError } = require('../util');
const profiles = require('../profiles');

const mult = (cups) => Math.round(0.99 * cups * 100) / 100;

function play(p, body) {
  const cups = Number(body.cups);
  if (![3, 4, 5].includes(cups)) throw new GameError('3, 4 oder 5 Becher.');
  const pick = Number(body.pick);
  if (!Number.isInteger(pick) || pick < 0 || pick >= cups) throw new GameError('Bitte einen Becher wählen.');
  const bet = parseBet(body.bet, p);
  p.balance -= bet;
  const ball = randInt(0, cups);
  const won = ball === pick;
  const m = mult(cups);
  const payout = won ? payoutFor(bet, m) : 0;
  p.balance += payout;
  profiles.record(p, 'cups', bet, payout, `${cups} Becher – ${won ? 'gefunden' : 'daneben'}`);
  return { ball, pick, won, multiplier: m, payout, bet, cups };
}

function info() {
  return { mults: { 3: mult(3), 4: mult(4), 5: mult(5) } };
}

module.exports = { info, play };
