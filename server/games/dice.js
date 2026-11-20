// Würfel (Dice): Zufallszahl 0,00–99,99. Wette auf "unter" oder "über" bei frei wählbarer Gewinnchance.
// Multiplikator = 99 / Gewinnchance (1 % Hausvorteil).
const { randInt, parseBet, payoutFor, GameError } = require('../util');
const profiles = require('../profiles');

const MIN_CHANCE = 1;
const MAX_CHANCE = 95;

const multFor = (chanceBp) => Math.floor(99000000 / chanceBp) / 10000; // chanceBp = Chance in 1/100 %

function info() {
  return { minChance: MIN_CHANCE, maxChance: MAX_CHANCE };
}

function roll(p, body) {
  const chance = Number(body.chance);
  const mode = body.mode === 'over' ? 'over' : body.mode === 'under' ? 'under' : null;
  if (!mode) throw new GameError('Bitte "über" oder "unter" wählen.');
  if (!Number.isFinite(chance) || chance < MIN_CHANCE || chance > MAX_CHANCE) throw new GameError(`Gewinnchance: ${MIN_CHANCE} bis ${MAX_CHANCE} %.`);
  const chanceBp = Math.round(chance * 100);
  const bet = parseBet(body.bet, p);
  p.balance -= bet;

  const r = randInt(0, 10000); // 0..9999 -> 0,00..99,99
  const target = mode === 'under' ? chanceBp : 10000 - chanceBp; // unter: r < target · über: r >= target
  const won = mode === 'under' ? r < target : r >= target;
  const mult = multFor(chanceBp);
  const payout = won ? payoutFor(bet, mult) : 0;
  p.balance += payout;
  const tStr = (target / 100).toFixed(2);
  profiles.record(p, 'dice', bet, payout, `${(r / 100).toFixed(2)} – ${mode === 'under' ? 'unter' : 'über'} ${tStr} (${mult}×)`);
  return { roll: r / 100, target: target / 100, mode, won, multiplier: mult, payout, bet, chance: chanceBp / 100 };
}

module.exports = { info, roll };
module.exports._internal = { multFor };
