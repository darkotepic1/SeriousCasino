// Schere-Stein-Papier gegen das Haus. Sieg zahlt 1,97×, Unentschieden = Einsatz zurück (Quote 99 %).
const { randInt, parseBet, payoutFor, GameError } = require('../util');
const profiles = require('../profiles');

const CHOICES = ['rock', 'paper', 'scissors'];
const NAMES = { rock: 'Stein', paper: 'Papier', scissors: 'Schere' };
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const WIN_MULT = 1.97;

function play(p, body) {
  const choice = String(body.choice);
  if (!CHOICES.includes(choice)) throw new GameError('Schere, Stein oder Papier?');
  const bet = parseBet(body.bet, p);
  p.balance -= bet;
  const house = CHOICES[randInt(0, 3)];
  const result = choice === house ? 'draw' : BEATS[choice] === house ? 'win' : 'lose';
  const payout = result === 'win' ? payoutFor(bet, WIN_MULT) : result === 'draw' ? bet : 0;
  p.balance += payout;
  profiles.record(p, 'rps', bet, payout, `${NAMES[choice]} vs ${NAMES[house]}`);
  return { choice, house, result, payout, bet, multiplier: WIN_MULT };
}

module.exports = { play };
