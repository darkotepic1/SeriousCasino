// Video Poker "Jacks or Better" mit der klassischen 9/6-Auszahlungstabelle (≈ 99,5 % bei optimalem Spiel).
const { makeDeck, parseBet, GameError } = require('../util');
const profiles = require('../profiles');

// Auszahlung als Vielfaches des Einsatzes (inkl. Einsatz)
const PAYTABLE = [
  { id: 'royal', name: 'Royal Flush', pay: 800 },
  { id: 'straightflush', name: 'Straight Flush', pay: 50 },
  { id: 'four', name: 'Vierling', pay: 25 },
  { id: 'fullhouse', name: 'Full House', pay: 9 },
  { id: 'flush', name: 'Flush', pay: 6 },
  { id: 'straight', name: 'Straße', pay: 4 },
  { id: 'three', name: 'Drilling', pay: 3 },
  { id: 'twopair', name: 'Zwei Paare', pay: 2 },
  { id: 'jacks', name: 'Bubenpaar oder besser', pay: 1 },
];
const BY_ID = Object.fromEntries(PAYTABLE.map((p) => [p.id, p]));

function evaluate(cards) {
  const ranks = cards.map((c) => c.r).sort((a, b) => a - b);
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.entries(counts).map(([r, n]) => ({ r: Number(r), n })).sort((a, b) => b.n - a.n || b.r - a.r);
  const flush = cards.every((c) => c.s === cards[0].s);
  const unique = groups.length === 5;
  const wheel = ranks.join(',') === '2,3,4,5,14';
  const straight = unique && (ranks[4] - ranks[0] === 4 || wheel);

  if (straight && flush) return ranks[0] === 10 ? 'royal' : 'straightflush';
  if (groups[0].n === 4) return 'four';
  if (groups[0].n === 3 && groups[1].n === 2) return 'fullhouse';
  if (flush) return 'flush';
  if (straight) return 'straight';
  if (groups[0].n === 3) return 'three';
  if (groups[0].n === 2 && groups[1].n === 2) return 'twopair';
  if (groups[0].n === 2 && groups[0].r >= 11) return 'jacks';
  return null;
}

function info() {
  return { paytable: PAYTABLE };
}

function state(p) {
  const st = p.active.poker;
  return st ? { hand: st.hand, bet: st.bet, current: evaluate(st.hand) } : { none: true };
}

function deal(p, body) {
  if (p.active.poker) throw new GameError('Es läuft schon eine Runde – erst ziehen.');
  const bet = parseBet(body.bet, p);
  p.balance -= bet;
  const deck = makeDeck(1);
  const hand = deck.splice(0, 5);
  p.active.poker = { deck, hand, bet };
  return { hand, bet, current: evaluate(hand) };
}

function draw(p, body) {
  const st = p.active.poker;
  if (!st) throw new GameError('Keine laufende Runde.');
  const hold = Array.isArray(body.hold) ? body.hold.slice(0, 5).map(Boolean) : [];
  const hand = st.hand.map((c, i) => (hold[i] ? c : st.deck.shift()));
  const result = evaluate(hand);
  const mult = result ? BY_ID[result].pay : 0;
  const payout = st.bet * mult;
  p.balance += payout;
  delete p.active.poker;
  profiles.record(p, 'poker', st.bet, payout, result ? BY_ID[result].name : 'nichts');
  return { hand, held: hold, result, resultName: result ? BY_ID[result].name : null, payout, bet: st.bet };
}

module.exports = { info, state, deal, draw };
module.exports._internal = { evaluate };
