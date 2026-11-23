// Red Dog: Zwei Karten werden aufgedeckt. Fällt die dritte Karte dazwischen, gewinnst du.
// Lücke 1 zahlt 5:1, Lücke 2 zahlt 4:1, Lücke 3 zahlt 2:1, Lücke 4+ zahlt 1:1. Vor der dritten Karte darfst du verdoppeln.
// Benachbarte Karten = Einsatz zurück. Paar: dritte Karte gleich → 11:1, sonst Einsatz zurück. 8 Decks, Ass hoch.
const { makeDeck, parseBet, GameError } = require('../util');
const profiles = require('../profiles');

const SPREAD_PAY = (gap) => (gap === 1 ? 6 : gap === 2 ? 5 : gap === 3 ? 3 : 2); // inkl. Einsatz

function state(p) {
  const st = p.active.reddog;
  return st ? { running: true, cards: st.cards, bet: st.bet, gap: st.gap, pay: SPREAD_PAY(st.gap) - 1 } : { running: false };
}

function end(p, st, payout, text, extra) {
  p.balance += payout;
  profiles.record(p, 'reddog', st.bet, payout, text);
  delete p.active.reddog;
  return { running: false, payout, totalBet: st.bet, text, ...extra };
}

function deal(p, body) {
  if (p.active.reddog) throw new GameError('Es läuft schon eine Runde.');
  const bet = parseBet(body.bet, p);
  p.balance -= bet;
  const deck = makeDeck(8);
  const cards = [deck.pop(), deck.pop()].sort((a, b) => a.r - b.r);
  const st = { bet, deck, cards };
  const diff = cards[1].r - cards[0].r;
  if (diff === 1) return end(p, st, bet, 'Benachbarte Karten – Einsatz zurück', { cards, kind: 'consecutive' });
  if (diff === 0) {
    const third = deck.pop();
    const three = third.r === cards[0].r;
    return end(p, st, three ? bet * 12 : bet, three ? 'Drilling! 11:1' : 'Paar – Einsatz zurück', { cards, third, kind: 'pair', three });
  }
  st.gap = diff - 1;
  p.active.reddog = st;
  return { ...state(p), canRaise: p.balance >= bet };
}

function finish(p, raise) {
  const st = p.active.reddog;
  if (!st) throw new GameError('Keine laufende Runde.');
  if (raise) {
    if (p.balance < st.bet) throw new GameError('Nicht genug Chips zum Verdoppeln.');
    p.balance -= st.bet;
    st.bet *= 2;
  }
  const third = st.deck.pop();
  const inside = third.r > st.cards[0].r && third.r < st.cards[1].r;
  const payout = inside ? st.bet * SPREAD_PAY(st.gap) : 0;
  return end(p, st, payout, inside ? `Dazwischen! Lücke ${st.gap}` : 'Nicht dazwischen', { cards: st.cards, third, kind: 'spread', inside, gap: st.gap, raised: raise });
}

const call = (p) => finish(p, false);
const raise = (p) => finish(p, true);

module.exports = { state, deal, call, raise };
module.exports._internal = { SPREAD_PAY };
