// Texas Hold'em (No Limit) – ein Tisch, bis zu 6 Spieler, Chips werden beim Hinsetzen eingekauft.
// Blinds 25/50, Zugzeit 25 s (sonst Check bzw. Fold), Side-Pots, Showdown mit bester 5-aus-7-Hand.
const crypto = require('crypto');
const db = require('./db');
const profiles = require('./profiles');
const { makeDeck, GameError } = require('./util');

const SEATS = 6, SB = 25, BB = 50, MIN_BUYIN = 1000, MAX_BUYIN = 20000;
const TURN_MS = 25000, START_MS = 4000, END_MS = 7000, RUNOUT_MS = 1200;

// ---------- Handbewertung ----------
const CAT = ['Höchste Karte', 'Paar', 'Zwei Paare', 'Drilling', 'Straße', 'Flush', 'Full House', 'Vierling', 'Straight Flush'];
function score5(cards) {
  const rs = cards.map((c) => c.r).sort((a, b) => b - a);
  const flush = cards.every((c) => c.s === cards[0].s);
  const uniq = [...new Set(rs)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (rs[0] - rs[4] === 4) straightHigh = rs[0];
    else if (rs[0] === 14 && rs[1] === 5) straightHigh = 5; // A-2-3-4-5
  }
  const cnt = {};
  rs.forEach((r) => (cnt[r] = (cnt[r] || 0) + 1));
  const groups = Object.entries(cnt).map(([r, n]) => [n, Number(r)]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const byGroup = groups.map((g) => g[1]);
  if (straightHigh && flush) return [8, straightHigh];
  if (groups[0][0] === 4) return [7, ...byGroup];
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...byGroup];
  if (flush) return [5, ...rs];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][0] === 3) return [3, ...byGroup];
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...byGroup];
  if (groups[0][0] === 2) return [1, ...byGroup];
  return [0, ...rs];
}
const cmp = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
function best(cards) {
  let top = null, topCards = null;
  const pick = (start, chosen) => {
    if (chosen.length === 5) { const sc = score5(chosen); if (!top || cmp(sc, top) > 0) { top = sc; topCards = chosen.slice(); } return; }
    for (let i = start; i <= cards.length - (5 - chosen.length); i++) { chosen.push(cards[i]); pick(i + 1, chosen); chosen.pop(); }
  };
  pick(0, []);
  const name = top[0] === 8 && top[1] === 14 ? 'Royal Flush' : CAT[top[0]];
  return { score: top, name, cards: topCards };
}

// ---------- Tisch ----------
let T = null;
const pending = () => (db.get().holdemPending ||= {});
const prof = (pid) => db.get().profiles[pid];

function syncPending(s) { if (s) { const v = s.stack + s.total; if (v > 0) pending()[s.pid] = v; else delete pending()[s.pid]; } }

function start() {
  for (const [pid, amount] of Object.entries(pending())) { const p = prof(pid); if (p) p.balance += amount; }
  db.get().holdemPending = {};
  db.save();
  T = { seats: new Array(SEATS).fill(null), button: -1, phase: 'waiting', board: [], until: null, hand: null, log: [], winners: null };
  require('./util').safeInterval('holdem', tick, 250);
}

const inHand = (s) => s && s.cards.length === 2 && !s.folded;
const canAct = (s) => inHand(s) && !s.allIn;
function nextIdx(from, pred) {
  for (let k = 1; k <= SEATS; k++) { const i = (from + k + SEATS) % SEATS; if (pred(T.seats[i], i)) return i; }
  return -1;
}
function say(text) { T.log.unshift(text); T.log.length = Math.min(T.log.length, 12); }

function eligible() { return T.seats.filter((s) => s && !s.leaving && s.stack > 0); }

function cashOut(i) {
  const s = T.seats[i];
  if (!s) return;
  const p = prof(s.pid);
  if (p) p.balance += s.stack;
  delete pending()[s.pid];
  T.seats[i] = null;
}

function startHand(now) {
  // Wer gehen will oder pleite ist, steht auf
  T.seats.forEach((s, i) => { if (s && (s.leaving || s.stack <= 0)) cashOut(i); });
  if (eligible().length < 2) { T.phase = 'waiting'; T.until = null; return; }
  T.hand = crypto.randomUUID();
  T.phase = 'playing';
  T.deck = makeDeck(1);
  T.board = [];
  T.winners = null;
  T.street = 'preflop';
  T.seats.forEach((s) => { if (s) Object.assign(s, { cards: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, shown: null, won: 0 }); });
  T.button = nextIdx(T.button, (s) => s && s.stack > 0);
  const players = T.seats.filter((s) => s && s.stack > 0);
  const headsUp = players.length === 2;
  const sbI = headsUp ? T.button : nextIdx(T.button, (s) => s && s.stack > 0);
  const bbI = nextIdx(sbI, (s) => s && s.stack > 0);
  for (let k = 0; k < 2; k++) for (let j = 1; j <= SEATS; j++) { const s = T.seats[(T.button + j) % SEATS]; if (s && s.stack > 0) s.cards.push(T.deck.pop()); }
  post(T.seats[sbI], SB);
  post(T.seats[bbI], BB);
  T.sb = sbI; T.bb = bbI;
  T.currentBet = BB;
  T.minRaise = BB;
  T.log = [];
  say(`Neue Hand – Blinds ${SB}/${BB}`);
  T.turn = -1;
  setTurn(nextIdx(bbI, canAct), now);
  if (T.turn < 0 || roundDone()) advance(now);
}

function post(s, amount) {
  const a = Math.min(amount, s.stack);
  s.stack -= a; s.bet += a; s.total += a;
  if (s.stack === 0) s.allIn = true;
  syncPending(s);
}

function setTurn(i, now) { T.turn = i; T.until = i >= 0 ? now + TURN_MS : null; }

function roundDone() {
  return T.seats.every((s) => !canAct(s) || (s.acted && s.bet === T.currentBet));
}

function potTotal() { return T.seats.reduce((a, s) => a + (s ? s.total : 0), 0); }

function advance(now) {
  const alive = T.seats.filter(inHand);
  if (alive.length === 1) return finish(now, false);
  if (!roundDone()) { setTurn(nextIdx(T.turn, (s) => canAct(s) && !(s.acted && s.bet === T.currentBet)), now); return; }
  nextStreet(now);
}

// Setzrunde fertig → nächste Straße
function nextStreet(now) {
  T.seats.forEach((s) => { if (s) { s.bet = 0; s.acted = false; } });
  T.currentBet = 0;
  T.minRaise = BB;
  if (T.street === 'river') return finish(now, true);
  T.street = { preflop: 'flop', flop: 'turn', turn: 'river' }[T.street];
  T.deck.pop(); // Brennkarte
  T.board.push(...T.deck.splice(-(T.street === 'flop' ? 3 : 1)));
  say({ flop: 'Flop', turn: 'Turn', river: 'River' }[T.street] + ' liegt.');
  const actors = T.seats.filter(canAct);
  if (actors.length < 2) { // alle (bis auf einen) all-in → Karten automatisch aufdecken
    T.turn = -1; T.phase = 'runout'; T.until = now + RUNOUT_MS; return;
  }
  setTurn(nextIdx(T.button, canAct), now);
}

function finish(now, showdown) {
  T.turn = -1;
  const alive = T.seats.filter(inHand);
  const results = [];
  if (!showdown || alive.length === 1) {
    const w = alive[0];
    w.won = potTotal();
    results.push({ name: w.name, amount: w.won, hand: null });
    say(`${w.name} gewinnt ${w.won.toLocaleString('de-DE')} Chips.`);
  } else {
    alive.forEach((s) => { const b = best([...s.cards, ...T.board]); s.shown = { name: b.name, score: b.score, best: b.cards }; });
    // Side-Pots nach Einsatzhöhe
    const all = T.seats.filter((s) => s && s.total > 0);
    const levels = [...new Set(all.map((s) => s.total))].sort((a, b) => a - b);
    let prev = 0, carry = 0;
    for (const lvl of levels) {
      let amount = carry;
      for (const s of all) amount += Math.max(0, Math.min(s.total, lvl) - prev);
      prev = lvl;
      const elig = alive.filter((s) => s.total >= lvl);
      if (!elig.length) { carry = amount; continue; }
      carry = 0;
      let top = null;
      for (const s of elig) if (!top || cmp(s.shown.score, top) > 0) top = s.shown.score;
      const winners = elig.filter((s) => cmp(s.shown.score, top) === 0);
      const share = Math.floor(amount / winners.length);
      let rest = amount - share * winners.length;
      // Rest-Chip an den ersten Gewinner links vom Button
      for (let k = 1; k <= SEATS && rest; k++) { const s = T.seats[(T.button + k) % SEATS]; if (winners.includes(s)) { s.won += rest; rest = 0; } }
      winners.forEach((s) => (s.won += share));
    }
    for (const s of alive) if (s.won) { results.push({ name: s.name, amount: s.won, hand: s.shown.name }); say(`${s.name} gewinnt ${s.won.toLocaleString('de-DE')} mit ${s.shown.name}.`); }
  }
  // Auszahlen, Statistik buchen
  for (const s of T.seats) {
    if (!s || !s.cards.length) continue;
    s.stack += s.won || 0;
    const p = prof(s.pid);
    if (p && s.total > 0) profiles.record(p, 'holdem', s.total, s.won || 0, `Hold'em: ${s.won ? 'gewonnen' : 'verloren'}${s.shown ? ' – ' + s.shown.name : ''}`);
    s.total = 0;
    s.bet = 0;
    syncPending(s);
    if (s.timeouts >= 2) s.leaving = true;
  }
  T.winners = results;
  T.phase = 'showdown';
  T.showdown = showdown && alive.length > 1;
  T.until = now + END_MS;
  db.save();
}

function tick() {
  if (!T) return;
  const now = Date.now();
  if (T.phase === 'waiting') {
    if (eligible().length >= 2) { if (!T.until) T.until = now + START_MS; else if (now >= T.until) startHand(now); }
    else T.until = null;
  } else if (T.phase === 'playing' && T.turn >= 0 && now >= T.until) {
    const s = T.seats[T.turn];
    s.timeouts = (s.timeouts || 0) + 1;
    doAction(s, s.bet === T.currentBet ? 'check' : 'fold', 0, now);
  } else if (T.phase === 'runout' && now >= T.until) {
    T.phase = 'playing';
    nextStreet(now);
  } else if (T.phase === 'showdown' && now >= T.until) {
    T.phase = 'waiting';
    T.until = null;
    T.seats.forEach((s, i) => { if (s && (s.leaving || s.stack <= 0)) cashOut(i); });
    if (eligible().length >= 2) startHand(now);
  }
}

function doAction(s, a, raiseTo, now) {
  const toCall = T.currentBet - s.bet;
  if (a === 'fold') { s.folded = true; say(`${s.name} passt.`); }
  else if (a === 'check') { if (toCall > 0) throw new GameError('Checken geht nicht – es liegt ein Einsatz.'); say(`${s.name} checkt.`); }
  else if (a === 'call') {
    if (toCall <= 0) throw new GameError('Nichts zu bezahlen – checke stattdessen.');
    post(s, toCall);
    say(`${s.name} geht mit${s.allIn ? ' (all-in)' : ''}.`);
  } else if (a === 'raise' || a === 'allin') {
    const max = s.bet + s.stack;
    let to = a === 'allin' ? max : Math.floor(Number(raiseTo));
    if (!Number.isFinite(to)) throw new GameError('Ungültiger Betrag.');
    if (to > max) to = max;
    const minTo = T.currentBet + T.minRaise;
    if (to <= T.currentBet && to < max) throw new GameError('Das ist kein Erhöhen.');
    if (to < minTo && to < max) throw new GameError(`Mindestens auf ${minTo.toLocaleString('de-DE')} erhöhen.`);
    const raiseBy = to - T.currentBet;
    post(s, to - s.bet);
    if (to > T.currentBet) {
      if (raiseBy >= T.minRaise) { T.minRaise = raiseBy; T.seats.forEach((o) => { if (o && o !== s) o.acted = false; }); }
      else T.seats.forEach((o) => { if (o && o !== s && o.bet < to) o.acted = false; }); // kleines All-in: nur Nachziehen nötig
      T.currentBet = to;
      say(`${s.name} ${T.currentBet === s.bet && s.allIn ? 'geht all-in' : 'erhöht'} auf ${to.toLocaleString('de-DE')}.`);
    } else say(`${s.name} geht all-in.`);
  } else throw new GameError('Unbekannte Aktion.');
  s.acted = true;
  advance(now);
}

// ---------- API ----------
function view(viewerId) {
  tick();
  const now = Date.now();
  const reveal = T.phase === 'showdown' && T.showdown;
  return {
    hand: T.hand, phase: T.phase, now, timeLeft: T.until ? Math.max(0, T.until - now) : null, turn: T.turn,
    button: T.button, sb: T.sb, bb: T.bb, blinds: [SB, BB], buyin: [MIN_BUYIN, MAX_BUYIN],
    board: T.board, pot: potTotal(), currentBet: T.currentBet || 0, minRaise: T.minRaise || BB, street: T.street,
    log: T.log, winners: T.winners,
    seats: T.seats.map((s, i) => (s ? {
      seat: i, name: s.name, me: s.pid === viewerId, stack: s.stack, bet: s.bet, folded: s.folded, allIn: s.allIn,
      inHand: s.cards.length === 2, leaving: !!s.leaving, won: T.phase === 'showdown' ? s.won || 0 : 0,
      cards: s.pid === viewerId || (reveal && !s.folded && s.cards.length) ? s.cards : s.cards.map(() => null),
      shown: reveal && !s.folded && s.shown ? { name: s.shown.name, best: s.shown.best } : null,
      myHand: s.pid === viewerId && s.cards.length === 2 && T.board.length >= 3 ? best([...s.cards, ...T.board]).name : null,
    } : null)),
    mySeat: T.seats.findIndex((s) => s && s.pid === viewerId),
  };
}

function seatOf(p) { return T.seats.findIndex((s) => s && s.pid === p.id); }

function sit(p, body) {
  tick();
  if (seatOf(p) >= 0) throw new GameError('Du sitzt schon am Tisch.');
  const buyin = Math.floor(Number(body.buyin));
  if (!Number.isFinite(buyin) || buyin < MIN_BUYIN || buyin > MAX_BUYIN) throw new GameError(`Einkauf zwischen ${MIN_BUYIN.toLocaleString('de-DE')} und ${MAX_BUYIN.toLocaleString('de-DE')} Chips.`);
  if (buyin > p.balance) throw new GameError('Nicht genug Chips.');
  const want = Number(body.seat);
  const idx = Number.isInteger(want) && want >= 0 && want < SEATS && !T.seats[want] ? want : T.seats.findIndex((s) => !s);
  if (idx < 0) throw new GameError('Der Tisch ist voll.');
  p.balance -= buyin;
  T.seats[idx] = { pid: p.id, name: p.name, stack: buyin, cards: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, timeouts: 0 };
  syncPending(T.seats[idx]);
  say(`${p.name} setzt sich mit ${buyin.toLocaleString('de-DE')} Chips.`);
  return view(p.id);
}

function rebuy(p, body) {
  const i = seatOf(p);
  if (i < 0) throw new GameError('Du sitzt nicht am Tisch.');
  const s = T.seats[i];
  if (inHand(s) && T.phase !== 'showdown' && T.phase !== 'waiting') throw new GameError('Nachkaufen geht erst nach der Hand.');
  const amount = Math.floor(Number(body.amount));
  if (!Number.isFinite(amount) || amount < 1) throw new GameError('Ungültiger Betrag.');
  if (s.stack + amount > MAX_BUYIN) throw new GameError(`Höchstens ${MAX_BUYIN.toLocaleString('de-DE')} Chips am Tisch.`);
  if (amount > p.balance) throw new GameError('Nicht genug Chips.');
  p.balance -= amount;
  s.stack += amount;
  syncPending(s);
  return view(p.id);
}

function leave(p) {
  const i = seatOf(p);
  if (i < 0) throw new GameError('Du sitzt nicht am Tisch.');
  const s = T.seats[i];
  if (s.cards.length && s.folded && (T.phase === 'playing' || T.phase === 'runout')) {
    s.leaving = true; // schon gepasst → nach der Hand aufstehen (Einsätze bleiben im Pot)
  } else if (inHand(s) && (T.phase === 'playing' || T.phase === 'runout')) {
    // Mitten in der Hand: passen und nach der Hand aufstehen
    s.leaving = true;
    if (T.turn === i) doAction(s, 'fold', 0, Date.now());
    else if (!s.allIn) { s.folded = true; say(`${s.name} passt und verlässt den Tisch.`); if (T.seats.filter(inHand).length === 1) finish(Date.now(), false); }
  } else cashOut(i);
  return view(p.id);
}

function act(p, body) {
  tick();
  const i = seatOf(p);
  if (T.phase !== 'playing' || i < 0 || T.turn !== i) throw new GameError('Du bist nicht dran.');
  T.seats[i].timeouts = 0;
  doAction(T.seats[i], String(body.action), body.amount, Date.now());
  return view(p.id);
}

module.exports = { start, view, sit, rebuy, leave, act };
module.exports._internal = { best, score5, cmp };
