// Baccarat (Punto Banco): 8 Decks, klassische Ziehregeln für die dritte Karte.
// Spieler 1:1 · Bank 0,95:1 (5 % Kommission) · Unentschieden 8:1 (Spieler/Bank-Einsätze kommen bei Gleichstand zurück).
const { makeDeck, GameError } = require('../util');
const profiles = require('../profiles');

const value = (c) => (c.r === 14 ? 1 : c.r >= 10 ? 0 : c.r);
const total = (cards) => cards.reduce((a, c) => a + value(c), 0) % 10;

function bankerDraws(b, p3) {
  if (p3 === null) return b <= 5;
  if (b <= 2) return true;
  if (b === 3) return p3 !== 8;
  if (b === 4) return p3 >= 2 && p3 <= 7;
  if (b === 5) return p3 >= 4 && p3 <= 7;
  if (b === 6) return p3 === 6 || p3 === 7;
  return false;
}

/** Spielt eine komplette Runde; liefert Karten und Gewinner */
function deal(shoe) {
  const player = [shoe.pop(), shoe.pop()];
  const banker = [shoe.pop(), shoe.pop()];
  const natural = total(player) >= 8 || total(banker) >= 8;
  if (!natural) {
    let p3 = null;
    if (total(player) <= 5) {
      const c = shoe.pop();
      player.push(c);
      p3 = value(c);
    }
    if (bankerDraws(total(banker), p3)) banker.push(shoe.pop());
  }
  const pt = total(player), bt = total(banker);
  return { player, banker, playerTotal: pt, bankerTotal: bt, winner: pt > bt ? 'player' : bt > pt ? 'banker' : 'tie', natural };
}

function play(p, body) {
  const amounts = {};
  let sum = 0;
  for (const k of ['player', 'banker', 'tie']) {
    const v = body[k] === undefined || body[k] === '' ? 0 : Number(body[k]);
    if (!Number.isInteger(v) || v < 0) throw new GameError('Ungültiger Einsatz.');
    amounts[k] = v;
    sum += v;
  }
  if (sum < 1) throw new GameError('Bitte auf Spieler, Bank oder Unentschieden setzen.');
  if (sum > p.balance) throw new GameError('Nicht genug Chips.');
  p.balance -= sum;

  const r = deal(makeDeck(8));
  let payout = 0;
  if (r.winner === 'player') payout += amounts.player * 2;
  if (r.winner === 'banker') payout += amounts.banker + Math.floor(amounts.banker * 0.95);
  if (r.winner === 'tie') payout += amounts.player + amounts.banker + amounts.tie * 9;
  p.balance += payout;
  const names = { player: 'Spieler', banker: 'Bank', tie: 'Unentschieden' };
  profiles.record(p, 'baccarat', sum, payout, `${names[r.winner]} gewinnt (${r.playerTotal}:${r.bankerTotal})`);
  return { ...r, payout, totalBet: sum };
}

module.exports = { play };
module.exports._internal = { deal, bankerDraws };
