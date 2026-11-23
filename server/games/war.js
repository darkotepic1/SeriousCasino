// Kartenkrieg: Deine Karte gegen die des Dealers, die höhere gewinnt (Ass hoch). 6 Decks.
// Gewinn 1:1. Unentschieden → "Krieg" (Einsatz verdoppeln, je eine neue Karte; bei Sieg oder erneutem
// Gleichstand gewinnst du 1:1 auf den Zusatzeinsatz, der ursprüngliche Einsatz kommt zurück) oder "Aufgeben" (halber Einsatz zurück).
// Nebenwette "Unentschieden" zahlt 10:1.
const { makeDeck, parseAmounts, GameError } = require('../util');
const profiles = require('../profiles');

function draw(st) {
  if (!st.shoe.length) st.shoe = makeDeck(6);
  return st.shoe.pop();
}

function state(p) {
  const st = p.active.war;
  return st ? { running: true, player: st.player, dealer: st.dealer, bet: st.bet } : { running: false };
}

function end(p, st, payout, outcome, extra = {}) {
  p.balance += payout;
  profiles.record(p, 'war', st.wagered, payout, outcome);
  delete p.active.war;
  return { running: false, payout, totalBet: st.wagered, outcome, ...extra };
}

function deal(p, body) {
  if (p.active.war) throw new GameError('Erst Krieg oder Aufgeben wählen.');
  const { amounts, total } = parseAmounts(body, ['bet', 'tie'], p);
  if (amounts.bet < 1) throw new GameError('Bitte einen Einsatz setzen.');
  p.balance -= total;
  const st = { shoe: makeDeck(6), bet: amounts.bet, wagered: total };
  st.player = draw(st);
  st.dealer = draw(st);
  const tiePay = st.player.r === st.dealer.r ? amounts.tie * 11 : 0;
  const base = { player: st.player, dealer: st.dealer, tiePay };
  if (st.player.r > st.dealer.r) return end(p, st, st.bet * 2 + tiePay, 'Höhere Karte – gewonnen', base);
  if (st.player.r < st.dealer.r) return end(p, st, tiePay, 'Niedrigere Karte – verloren', base);
  // Gleichstand: Spieler muss entscheiden
  p.balance += tiePay;
  st.tiePaid = tiePay;
  p.active.war = st;
  return { running: true, ...base, bet: st.bet, canWar: p.balance >= st.bet };
}

function war(p) {
  const st = p.active.war;
  if (!st) throw new GameError('Kein Gleichstand offen.');
  if (p.balance < st.bet) throw new GameError('Nicht genug Chips für den Krieg – nur Aufgeben möglich.');
  p.balance -= st.bet;
  st.wagered += st.bet;
  st.shoe.splice(-3, 3); // drei Karten verbrennen
  const player2 = draw(st);
  const dealer2 = draw(st);
  const won = player2.r >= dealer2.r;
  const payout = (won ? st.bet * 3 : 0) + (st.tiePaid || 0);
  p.balance -= st.tiePaid || 0; // Unentschieden-Gewinn wurde schon gutgeschrieben; in end() gesammelt buchen
  return end(p, st, payout, won ? 'Krieg gewonnen' : 'Krieg verloren', { player: st.player, dealer: st.dealer, player2, dealer2, war: true, won });
}

function surrender(p) {
  const st = p.active.war;
  if (!st) throw new GameError('Kein Gleichstand offen.');
  p.balance -= st.tiePaid || 0;
  return end(p, st, Math.floor(st.bet / 2) + (st.tiePaid || 0), 'Aufgegeben – halber Einsatz zurück', { player: st.player, dealer: st.dealer, surrendered: true });
}

module.exports = { state, deal, war, surrender };
