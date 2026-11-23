// Sic Bo: drei Würfel. Auszahlungen wie in Macau.
// Klein (4–10) / Groß (11–17) / Gerade / Ungerade 1:1 – verlieren bei jedem Pasch aus drei gleichen.
// Summe 4/17 60:1 · 5/16 30:1 · 6/15 17:1 · 7/14 12:1 · 8/13 8:1 · 9/12 6:1 · 10/11 6:1
// Beliebiger Dreier 30:1 · bestimmter Dreier 180:1 · bestimmter Zweier 10:1 · Einzelzahl 1:1 / 2:1 / 3:1 (je nach Anzahl)
const { randInt, GameError } = require('../util');
const profiles = require('../profiles');

const TOTAL_PAY = { 4: 60, 5: 30, 6: 17, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 17, 16: 30, 17: 60 };

function payFor(b, dice) {
  const s = dice[0] + dice[1] + dice[2];
  const triple = dice[0] === dice[1] && dice[1] === dice[2];
  const count = (v) => dice.filter((d) => d === v).length;
  switch (b.type) {
    case 'small': return !triple && s >= 4 && s <= 10 ? 2 : 0;
    case 'big': return !triple && s >= 11 && s <= 17 ? 2 : 0;
    case 'odd': return !triple && s % 2 === 1 ? 2 : 0;
    case 'even': return !triple && s % 2 === 0 ? 2 : 0;
    case 'total': return s === b.value ? TOTAL_PAY[b.value] + 1 : 0;
    case 'anytriple': return triple ? 31 : 0;
    case 'triple': return triple && dice[0] === b.value ? 181 : 0;
    case 'double': return count(b.value) >= 2 ? 11 : 0;
    case 'single': { const c = count(b.value); return c ? c + 1 : 0; }
    default: return 0;
  }
}

function validate(bets) {
  if (!Array.isArray(bets) || !bets.length) throw new GameError('Bitte zuerst Chips auf den Tisch legen.');
  if (bets.length > 100) throw new GameError('Zu viele Einzelwetten.');
  return bets.map((b) => {
    const type = String(b?.type);
    const amount = Number(b?.amount);
    if (!Number.isInteger(amount) || amount < 1) throw new GameError('Ungültiger Einsatz.');
    let value = null;
    if (['small', 'big', 'odd', 'even', 'anytriple'].includes(type)) value = null;
    else if (type === 'total') { value = Number(b.value); if (!TOTAL_PAY[value]) throw new GameError('Ungültige Summe.'); }
    else if (['triple', 'double', 'single'].includes(type)) { value = Number(b.value); if (!Number.isInteger(value) || value < 1 || value > 6) throw new GameError('Ungültige Zahl.'); }
    else throw new GameError('Unbekannte Wette.');
    return { type, value, amount };
  });
}

function roll(p, body) {
  const bets = validate(body.bets);
  const total = bets.reduce((a, b) => a + b.amount, 0);
  if (total > p.balance) throw new GameError('Nicht genug Chips für diese Einsätze.');
  p.balance -= total;
  const dice = [randInt(1, 7), randInt(1, 7), randInt(1, 7)];
  let payout = 0;
  const results = bets.map((b) => {
    const pay = b.amount * payFor(b, dice);
    payout += pay;
    return { ...b, payout: pay, won: pay > 0 };
  });
  p.balance += payout;
  profiles.record(p, 'sicbo', total, payout, `Würfel ${dice.join('-')} (Summe ${dice[0] + dice[1] + dice[2]})`);
  return { dice, sum: dice[0] + dice[1] + dice[2], results, payout, totalBet: total };
}

function info() {
  return { totals: TOTAL_PAY };
}

module.exports = { info, roll };
module.exports._internal = { payFor, TOTAL_PAY };
