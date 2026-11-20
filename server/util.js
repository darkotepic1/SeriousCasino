// Hilfsfunktionen: Zufall (crypto.randomInt), Einsatzprüfung, Kartendecks.
const crypto = require('crypto');

class GameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Ganzzahl im Bereich [min, max) – kryptografisch sicher */
function randInt(min, max) {
  return crypto.randomInt(min, max);
}

/** Fisher-Yates-Mischen mit crypto.randomInt */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Gleichverteilte Zahl in [0, 1) mit 47 Bit Auflösung (randomInt erlaubt max. 2^48 - 1) */
function randFloat() {
  return crypto.randomInt(0, 2 ** 47) / 2 ** 47;
}

/** Prüft einen Einsatz (ganze Chips, >= min, <= Guthaben) */
function parseBet(value, profile, min = 1) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new GameError(`Einsatz muss eine ganze Zahl ab ${min} sein.`);
  if (n > profile.balance) throw new GameError('Nicht genug Chips für diesen Einsatz.');
  return n;
}

/** Auszahlung = Einsatz × Multiplikator, abgerundet – ohne Gleitkomma-Fehler (100 × 1,16 = 116, nicht 115) */
function payoutFor(bet, mult) {
  return Math.floor(Math.round(bet * mult * 1e6) / 1e6);
}

const SUITS =['♠', '♥', '♦', '♣'];
// Rang 2–14 (11=B, 12=D, 13=K, 14=A)
function makeDeck(decks = 1) {
  const cards = [];
  for (let d = 0; d < decks; d++) {
    for (const s of SUITS) for (let r = 2; r <= 14; r++) cards.push({ r, s });
  }
  return shuffle(cards);
}

module.exports = { GameError, randInt, randFloat, shuffle, parseBet, makeDeck, payoutFor };
