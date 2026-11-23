// Pferderennen: 6 Pferde mit unterschiedlichen Siegchancen. Die Quoten werden aus den Chancen berechnet
// (Auszahlung ≈ 95 % der fairen Quote). Setz auf ein Pferd – gewinnt es, gibt es Einsatz × Quote.
const { randInt, parseBet, payoutFor, GameError } = require('../util');
const profiles = require('../profiles');

const NAMES = ['Blitz', 'Donner', 'Goldfuß', 'Komet', 'Wirbelwind', 'Sternschnuppe', 'Pfeffer', 'Rakete', 'Nebel', 'Funke', 'Hagel', 'Saphir', 'Tornado', 'Mondschein', 'Zimt', 'Orkan'];
const COLORS = ['#e5484d', '#3b82f6', '#e3b341', '#2ecc71', '#a855f7', '#f97316'];
const HORSES = 6;
const EDGE = 0.95;

function newCard() {
  const names = [...NAMES];
  const horses = [];
  for (let i = 0; i < HORSES; i++) {
    const name = names.splice(randInt(0, names.length), 1)[0];
    horses.push({ name, color: COLORS[i], weight: randInt(8, 60) });
  }
  const sum = horses.reduce((a, h) => a + h.weight, 0);
  horses.forEach((h) => { h.mult = Math.max(1.1, Math.floor((EDGE * sum / h.weight) * 10) / 10); });
  return { id: randInt(1, 2 ** 30), horses };
}

const publicCard = (c) => ({ id: c.id, horses: c.horses.map(({ name, color, mult }) => ({ name, color, mult })) });

function card(p) {
  if (!p.active.horses) p.active.horses = newCard();
  return publicCard(p.active.horses);
}

function shuffleCard(p) {
  p.active.horses = newCard();
  return publicCard(p.active.horses);
}

function race(p, body) {
  const c = p.active.horses;
  if (!c || Number(body.cardId) !== c.id) throw new GameError('Die Quoten haben sich geändert – bitte nochmal setzen.');
  const pick = Number(body.horse);
  if (!Number.isInteger(pick) || pick < 0 || pick >= HORSES) throw new GameError('Bitte ein Pferd wählen.');
  const bet = parseBet(body.bet, p);
  p.balance -= bet;
  // Zieleinlauf: nacheinander gewichtet ziehen
  const left = c.horses.map((h, i) => ({ i, w: h.weight }));
  const order = [];
  while (left.length) {
    let r = randInt(0, left.reduce((a, x) => a + x.w, 0));
    const k = left.findIndex((x) => (r -= x.w) < 0);
    order.push(left.splice(k, 1)[0].i);
  }
  const winner = order[0];
  const mult = c.horses[pick].mult;
  const payout = winner === pick ? payoutFor(bet, mult) : 0;
  p.balance += payout;
  profiles.record(p, 'horses', bet, payout, `Tipp: ${c.horses[pick].name} (${mult}×) – Sieger: ${c.horses[winner].name}`);
  const result = { order, winner, pick, payout, bet, mult, horses: publicCard(c).horses };
  p.active.horses = newCard(); // nächstes Rennen
  return { ...result, next: publicCard(p.active.horses) };
}

module.exports = { card, shuffle: shuffleCard, race };
module.exports._internal = { newCard };
