// Live-Crash: EINE gemeinsame Rakete für alle Spieler.
// Ablauf: Wettphase (8 s) → Flug, bis es kracht → kurze Pause (4 s) → neue Wettphase.
// Alle sehen die Einsätze und das Auscashen der anderen live.
// Admin kann (für die Spieler unsichtbar) die laufende oder nächste Runde steuern.
const crypto = require('crypto');
const db = require('./db');
const profiles = require('./profiles');
const live = require('./live');
const { parseBet, payoutFor, GameError } = require('./util');
const { crashPoint, multAt, timeFor } = require('./games/crash')._internal;

const BET_MS = 8000;
const PAUSE_MS = 4000;
const MAX_MULT = 1000;

let round = null;
const history = []; // letzte Absturzpunkte
const rig = { next: null }; // vom Admin gesetzter Absturzpunkt für die nächste Runde

const pending = () => (db.get().livecrashPending ||= {}); // Einsätze, die noch nicht abgerechnet sind (für Erstattung nach Neustart)

/** Nach einem Server-Neustart: offene Einsätze zurückzahlen */
function refundAfterRestart() {
  const pend = pending();
  for (const [pid, amount] of Object.entries(pend)) {
    const p = db.get().profiles[pid];
    if (p) p.balance += amount;
  }
  db.get().livecrashPending = {};
  db.save();
}

function newRound() {
  round = { id: crypto.randomUUID(), phase: 'betting', bettingEnds: Date.now() + BET_MS, bets: new Map(), rigged: false };
}

function startFlight(now) {
  round.phase = 'running';
  round.startedAt = now;
  if (rig.next) { round.crashPoint = rig.next; round.rigged = true; rig.next = null; }
  else round.crashPoint = Math.min(crashPoint(), MAX_MULT);
}

function cashOut(b, at) {
  b.cashedAt = at;
  b.payout = payoutFor(b.bet, at);
  const p = db.get().profiles[b.pid];
  if (p) {
    p.balance += b.payout;
    profiles.record(p, 'livecrash', b.bet, b.payout, `Live-Crash: ausgecasht bei ${at.toFixed(2)}×`);
  }
  delete pending()[b.pid];
  db.save();
}

function crash(now) {
  round.phase = 'crashed';
  round.crashedAt = now;
  for (const b of round.bets.values()) {
    if (b.cashedAt) continue;
    b.payout = 0;
    const p = db.get().profiles[b.pid];
    if (p) profiles.record(p, 'livecrash', b.bet, 0, `Live-Crash: abgestürzt bei ${round.crashPoint.toFixed(2)}×`);
    delete pending()[b.pid];
  }
  history.unshift(round.crashPoint);
  if (history.length > 20) history.length = 20;
  db.save();
}

/** Takt: Phasen weiterschalten, Auto-Cashouts, Absturz */
function tick() {
  const now = Date.now();
  if (!round) return newRound();
  if (round.phase === 'betting' && now >= round.bettingEnds) startFlight(now);
  if (round.phase === 'running') {
    const elapsed = now - round.startedAt;
    const crashAtMs = timeFor(round.crashPoint);
    for (const b of round.bets.values()) {
      if (!b.cashedAt && b.auto && b.auto < round.crashPoint && elapsed >= timeFor(b.auto)) cashOut(b, b.auto);
    }
    if (round.forceCrash || elapsed >= crashAtMs) {
      if (round.forceCrash) round.crashPoint = Math.max(1, multAt(elapsed));
      crash(now);
    }
  }
  if (round.phase === 'crashed' && now - round.crashedAt >= PAUSE_MS) newRound();
}

function start() {
  refundAfterRestart();
  newRound();
  setInterval(tick, 50);
}

function currentMult(now = Date.now()) {
  return round?.phase === 'running' ? Math.min(multAt(now - round.startedAt), round.crashPoint) : 1;
}

function publicState(viewerId) {
  tick();
  const now = Date.now();
  const bets = [...round.bets.values()].map((b) => ({ name: b.name, bet: b.bet, cashedAt: b.cashedAt || null, payout: b.payout ?? null, me: b.pid === viewerId }))
    .sort((a, b) => b.bet - a.bet);
  const mine = viewerId ? round.bets.get(viewerId) : null;
  return {
    id: round.id,
    phase: round.phase,
    now,
    timeLeft: round.phase === 'betting' ? round.bettingEnds - now : round.phase === 'crashed' ? PAUSE_MS - (now - round.crashedAt) : null,
    elapsed: round.phase === 'running' ? now - round.startedAt : null,
    multiplier: currentMult(now),
    crashPoint: round.phase === 'crashed' ? round.crashPoint : null,
    bets,
    mine: mine ? { bet: mine.bet, auto: mine.auto, cashedAt: mine.cashedAt || null, payout: mine.payout ?? null } : null,
    history,
    k: 0.00006,
  };
}

function bet(p, body) {
  tick();
  if (round.phase !== 'betting') throw new GameError('Die Runde läuft schon – warte auf die nächste Wettphase.');
  if (round.bets.has(p.id)) throw new GameError('Du hast in dieser Runde schon gesetzt.');
  const amount = parseBet(body.bet, p);
  let auto = null;
  if (body.auto !== undefined && body.auto !== null && body.auto !== '') {
    auto = Math.floor(Number(body.auto) * 100) / 100;
    if (!Number.isFinite(auto) || auto < 1.01 || auto > MAX_MULT) throw new GameError('Auto-Cashout: 1,01 bis 1.000.');
  }
  p.balance -= amount;
  round.bets.set(p.id, { pid: p.id, name: p.name, bet: amount, auto, cashedAt: null, payout: null });
  pending()[p.id] = amount;
  return publicState(p.id);
}

function cashout(p) {
  tick();
  const b = round.bets.get(p.id);
  if (!b) throw new GameError('Du hast in dieser Runde nicht gesetzt.');
  if (b.cashedAt) throw new GameError('Schon ausgecasht.');
  if (round.phase !== 'running') throw new GameError(round.phase === 'crashed' ? 'Zu spät – abgestürzt!' : 'Die Rakete ist noch nicht gestartet.');
  const m = multAt(Date.now() - round.startedAt);
  if (m >= round.crashPoint) { tick(); throw new GameError('Zu spät – abgestürzt!'); }
  cashOut(b, m);
  if (b.payout >= b.bet * 10 && b.payout - b.bet >= 1000) { /* Feed-Eintrag kommt über profiles.record */ }
  return publicState(p.id);
}

// ---------- Admin ----------
function adminState() {
  const s = publicState(null);
  return {
    ...s,
    realCrashPoint: round.phase !== 'betting' ? round.crashPoint : null,
    rigged: round.rigged,
    nextRig: rig.next,
    bets: [...round.bets.values()].map((b) => ({ name: b.name, bet: b.bet, auto: b.auto, cashedAt: b.cashedAt || null, payout: b.payout ?? null })),
  };
}

function adminRig(body) {
  tick();
  const mode = String(body.mode);
  if (mode === 'now') {
    if (round.phase !== 'running') throw new GameError('Gerade fliegt keine Rakete.');
    round.forceCrash = true;
    round.rigged = true;
    tick();
  } else if (mode === 'next' || mode === 'current') {
    const v = Math.floor(Number(body.value) * 100) / 100;
    if (!Number.isFinite(v) || v < 1 || v > MAX_MULT) throw new GameError('Wert zwischen 1,00 und 1.000.');
    if (mode === 'next' || round.phase === 'betting') rig.next = v;
    else {
      if (round.phase !== 'running') throw new GameError('Gerade fliegt keine Rakete.');
      if (v <= currentMult()) throw new GameError(`Die Rakete ist schon bei ${currentMult().toFixed(2)}× – dann lieber „Jetzt crashen“.`);
      round.crashPoint = v;
      round.rigged = true;
    }
  } else if (mode === 'clear') {
    rig.next = null;
  } else throw new GameError('Unbekannte Aktion.');
  return adminState();
}

module.exports = { start, publicState, bet, cashout, adminState, adminRig };
