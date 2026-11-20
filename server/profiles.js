// Profile, Guthaben, Bonus, Nachfüllen und Statistik.
const crypto = require('crypto');
const db = require('./db');
const { GameError } = require('./util');

const START_BALANCE = 10000;
const REFILL_THRESHOLD = 100;
const REFILL_AMOUNT = 5000;
const REFILL_COOLDOWN_MS = 60 * 60 * 1000; // 1 Stunde
const DAILY_BONUS = 1000;
const HISTORY_LIMIT = 50;
const MAX_PROFILES = 30;

const GAME_NAMES = {
  slots: 'Slots',
  blackjack: 'Blackjack',
  roulette: 'Roulette',
  poker: 'Video Poker',
  crash: 'Crash',
  mines: 'Mines',
  plinko: 'Plinko',
  dice: 'Würfel',
  keno: 'Keno',
  baccarat: 'Baccarat',
  hilo: 'Hi-Lo',
  wheel: 'Glücksrad',
  tower: 'Turm',
  scratch: 'Rubbellos',
  coinflip: 'Münzwurf',
  limbo: 'Limbo',
};

function emptyStats() {
  return { rounds: 0, wagered: 0, paid: 0, biggestWin: 0, biggestWinGame: null, perGame: {} };
}

function todayLocal() {
  return new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in lokaler Zeit
}

function cleanName(name) {
  const n = String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
  if (!n) throw new GameError('Bitte einen Namen eingeben.');
  return n;
}

function all() {
  return Object.values(db.get().profiles);
}

function create(name) {
  const clean = cleanName(name);
  if (all().length >= MAX_PROFILES) throw new GameError('Zu viele Profile.');
  if (all().some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
    throw new GameError('Diesen Namen gibt es schon.');
  }
  const p = {
    id: crypto.randomUUID(),
    name: clean,
    balance: START_BALANCE,
    createdAt: Date.now(),
    lastRefill: 0,
    lastDaily: null,
    stats: emptyStats(),
    history: [],
    active: {}, // laufende Runden (Blackjack, Poker, Crash, Mines)
  };
  db.get().profiles[p.id] = p;
  db.save();
  return p;
}

function get(id) {
  const p = typeof id === 'string' ? db.get().profiles[id] : null;
  if (!p) throw new GameError('Profil nicht gefunden. Bitte Profil wählen.', 401);
  if (!p.active) p.active = {};
  return p;
}

function remove(id) {
  get(id);
  delete db.get().profiles[id];
  db.save();
}

function rename(p, name) {
  const clean = cleanName(name);
  if (all().some((o) => o.id !== p.id && o.name.toLowerCase() === clean.toLowerCase())) {
    throw new GameError('Diesen Namen gibt es schon.');
  }
  p.name = clean;
}

function reset(p) {
  p.balance = START_BALANCE;
  p.stats = emptyStats();
  p.history = [];
  p.active = {};
  p.lastRefill = 0;
}

function refillInfo(p) {
  const nextAt = (p.lastRefill || 0) + REFILL_COOLDOWN_MS;
  return {
    needed: p.balance < REFILL_THRESHOLD,
    available: p.balance < REFILL_THRESHOLD && Date.now() >= nextAt,
    nextAt,
    amount: REFILL_AMOUNT,
    threshold: REFILL_THRESHOLD,
  };
}

function refill(p) {
  const info = refillInfo(p);
  if (!info.needed) throw new GameError(`Nachfüllen geht erst unter ${REFILL_THRESHOLD} Chips.`);
  if (!info.available) {
    const min = Math.ceil((info.nextAt - Date.now()) / 60000);
    throw new GameError(`Nachfüllen wieder in ${min} Min. möglich.`);
  }
  p.balance += REFILL_AMOUNT;
  p.lastRefill = Date.now();
  return REFILL_AMOUNT;
}

function claimDaily(p) {
  if (p.lastDaily === todayLocal()) throw new GameError('Den Tagesbonus hast du heute schon abgeholt.');
  p.lastDaily = todayLocal();
  p.balance += DAILY_BONUS;
  return DAILY_BONUS;
}

/** Bucht eine abgeschlossene Runde in Statistik und Verlauf. */
function record(p, game, bet, payout, detail = '') {
  const net = payout - bet;
  const s = p.stats;
  s.rounds++;
  s.wagered += bet;
  s.paid += payout;
  if (net > s.biggestWin) {
    s.biggestWin = net;
    s.biggestWinGame = game;
  }
  const g = (s.perGame[game] ||= { rounds: 0, wagered: 0, paid: 0, biggestWin: 0 });
  g.rounds++;
  g.wagered += bet;
  g.paid += payout;
  if (net > g.biggestWin) g.biggestWin = net;
  p.history.unshift({ game, bet, payout, net, balance: p.balance, time: Date.now(), detail });
  if (p.history.length > HISTORY_LIMIT) p.history.length = HISTORY_LIMIT;
}

function publicView(p) {
  return {
    id: p.id,
    name: p.name,
    balance: p.balance,
    createdAt: p.createdAt,
    refill: refillInfo(p),
    daily: { available: p.lastDaily !== todayLocal(), amount: DAILY_BONUS },
  };
}

function summary(p) {
  return {
    id: p.id,
    name: p.name,
    balance: p.balance,
    rounds: p.stats.rounds,
    net: p.stats.paid - p.stats.wagered,
    biggestWin: p.stats.biggestWin,
  };
}

module.exports = {
  START_BALANCE, GAME_NAMES,
  all, create, get, remove, rename, reset, refill, claimDaily, record, publicView, summary,
};
