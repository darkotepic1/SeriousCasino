// Drei-Karten-Poker gegen den Dealer.
// Ante setzen (optional Paar-Plus) → 3 Karten ansehen → "Spielen" (zweiter Einsatz = Ante) oder "Passen".
// Dealer spielt mit Dame hoch oder besser. Qualifiziert er sich nicht: Ante 1:1, Spiel-Einsatz zurück.
// Ante-Bonus (immer, wenn gespielt wird): Straße 1:1, Drilling 4:1, Straight Flush 5:1.
// Paar-Plus (unabhängig vom Dealer): Paar 1:1, Flush 4:1, Straße 6:1, Drilling 30:1, Straight Flush 40:1 (≈ 97,7 %).
const { makeDeck, parseAmounts, GameError } = require('../util');
const profiles = require('../profiles');

const NAMES = ['Höchste Karte', 'Paar', 'Flush', 'Straße', 'Drilling', 'Straight Flush'];
const PAIR_PLUS = [0, 2, 5, 7, 31, 41]; // Rückzahlung inkl. Einsatz
const ANTE_BONUS = [0, 0, 0, 1, 4, 5];

/** Bewertet 3 Karten: { rank 0–5, tie[] zum Vergleichen } */
function evaluate(cards) {
  const r = cards.map((c) => c.r).sort((a, b) => b - a);
  const flush = cards.every((c) => c.s === cards[0].s);
  const wheel = r[0] === 14 && r[1] === 3 && r[2] === 2;
  const straight = (r[0] - r[1] === 1 && r[1] - r[2] === 1) || wheel;
  const high = wheel ? [3, 2, 1] : r;
  if (straight && flush) return { rank: 5, tie: high };
  if (r[0] === r[2]) return { rank: 4, tie: r };
  if (straight) return { rank: 3, tie: high };
  if (flush) return { rank: 2, tie: r };
  if (r[0] === r[1] || r[1] === r[2]) {
    const pair = r[1];
    const kicker = r[0] === r[1] ? r[2] : r[0];
    return { rank: 1, tie: [pair, kicker] };
  }
  return { rank: 0, tie: r };
}

function compare(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < a.tie.length; i++) if (a.tie[i] !== b.tie[i]) return a.tie[i] - b.tie[i];
  return 0;
}

const qualifies = (e) => e.rank > 0 || e.tie[0] >= 12;

function state(p) {
  const st = p.active.threecard;
  return st ? { running: true, player: st.player, ante: st.ante, pairplus: st.pairplus, hand: NAMES[evaluate(st.player).rank] } : { running: false };
}

function deal(p, body) {
  if (p.active.threecard) throw new GameError('Es läuft schon eine Runde.');
  const { amounts, total } = parseAmounts(body, ['ante', 'pairplus'], p);
  if (amounts.ante < 1) throw new GameError('Bitte einen Ante-Einsatz setzen.');
  p.balance -= total;
  const deck = makeDeck(1);
  const st = { ante: amounts.ante, pairplus: amounts.pairplus, player: deck.splice(0, 3), dealer: deck.splice(0, 3) };
  p.active.threecard = st;
  return { ...state(p), canPlay: p.balance >= st.ante };
}

function finish(p, st, played) {
  const pe = evaluate(st.player);
  const de = evaluate(st.dealer);
  let payout = 0;
  let outcome;
  const play = played ? st.ante : 0;
  if (!played) outcome = 'fold';
  else if (!qualifies(de)) { outcome = 'noqualify'; payout += st.ante * 2 + play; }
  else {
    const c = compare(pe, de);
    if (c > 0) { outcome = 'win'; payout += st.ante * 2 + play * 2; }
    else if (c === 0) { outcome = 'push'; payout += st.ante + play; }
    else outcome = 'lose';
  }
  const anteBonus = played ? st.ante * ANTE_BONUS[pe.rank] : 0;
  const pairPlus = st.pairplus * PAIR_PLUS[pe.rank];
  payout += anteBonus + pairPlus;
  p.balance += payout;
  const bet = st.ante + play + st.pairplus;
  const words = { fold: 'gepasst', noqualify: 'Dealer qualifiziert sich nicht', win: 'gewonnen', push: 'unentschieden', lose: 'verloren' };
  profiles.record(p, 'threecard', bet, payout, `${NAMES[pe.rank]} vs ${NAMES[de.rank]} – ${words[outcome]}`);
  delete p.active.threecard;
  return {
    running: false, player: st.player, dealer: st.dealer, playerHand: NAMES[pe.rank], dealerHand: NAMES[de.rank],
    dealerQualifies: qualifies(de), outcome, payout, totalBet: bet, anteBonus, pairPlus,
  };
}

function play(p) {
  const st = p.active.threecard;
  if (!st) throw new GameError('Keine laufende Runde.');
  if (p.balance < st.ante) throw new GameError('Nicht genug Chips zum Spielen – du kannst nur passen.');
  p.balance -= st.ante;
  return finish(p, st, true);
}

function fold(p) {
  const st = p.active.threecard;
  if (!st) throw new GameError('Keine laufende Runde.');
  return finish(p, st, false);
}

module.exports = { state, deal, play, fold };
module.exports._internal = { evaluate, compare, qualifies };
