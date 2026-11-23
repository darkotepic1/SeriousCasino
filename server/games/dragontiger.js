// Drache & Tiger: je eine Karte für Drache und Tiger, die höhere gewinnt (Ass = 1, König = 13). 8 Decks.
// Drache/Tiger 1:1 · Unentschieden 11:1 – bei Gleichstand verlieren Drache/Tiger-Einsätze nur die Hälfte.
const { makeDeck, parseAmounts } = require('../util');
const profiles = require('../profiles');

const val = (c) => (c.r === 14 ? 1 : c.r);

function play(p, body) {
  const { amounts, total } = parseAmounts(body, ['dragon', 'tiger', 'tie'], p);
  p.balance -= total;
  const deck = makeDeck(8);
  const dragon = deck.pop();
  const tiger = deck.pop();
  const d = val(dragon), t = val(tiger);
  const winner = d > t ? 'dragon' : t > d ? 'tiger' : 'tie';
  let payout = 0;
  if (winner === 'tie') payout = amounts.tie * 12 +Math.floor(amounts.dragon / 2) + Math.floor(amounts.tiger / 2);
  else payout = amounts[winner] * 2;
  p.balance += payout;
  const names = { dragon: 'Drache', tiger: 'Tiger', tie: 'Unentschieden' };
  profiles.record(p, 'dragontiger', total, payout, `${names[winner]} (${d}:${t})`);
  return { dragon, tiger, winner, payout, totalBet: total };
}

module.exports = { play };
