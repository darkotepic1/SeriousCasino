// Craps mit zwei Würfeln.
// Pass Line 1:1 (Come-out: 7/11 gewinnt, 2/3/12 verliert, sonst wird der "Point" gesetzt und muss vor der 7 fallen).
// Don't Pass 1:1 (umgekehrt; 12 beim Come-out = unentschieden).
// Ein-Wurf-Wetten: Field (2,3,4,9,10,11,12 – 2 zahlt 2:1, 12 zahlt 3:1, sonst 1:1), Any 7 (4:1), Any Craps (2/3/12, 7:1).
const { randInt, parseAmounts, GameError } = require('../util');
const profiles = require('../profiles');

const ONE_ROLL = ['field', 'any7', 'anycraps'];

function oneRollPay(k, amt, s) {
  if (!amt) return 0;
  if (k === 'field') return [2, 3, 4, 9, 10, 11, 12].includes(s) ? amt * (s === 2 ? 3 : s === 12 ? 4 : 2) : 0;
  if (k === 'any7') return s === 7 ? amt * 5 : 0;
  if (k === 'anycraps') return [2, 3, 12].includes(s) ? amt * 8 : 0;
  return 0;
}

function doRoll(p, st, oneRoll) {
  const dice = [randInt(1, 7), randInt(1, 7)];
  const s = dice[0] + dice[1];
  const results = [];
  let paid = 0;
  for (const k of ONE_ROLL) {
    if (!oneRoll[k]) continue;
    const pay = oneRollPay(k, oneRoll[k], s);
    paid += pay;
    results.push({ bet: k, amount: oneRoll[k], payout: pay });
  }
  let done = false;
  const line = (k, outcome) => {
    const amt = st[k];
    if (!amt) return;
    const pay = outcome === 'win' ? amt * 2 : outcome === 'push' ? amt : 0;
    paid += pay;
    results.push({ bet: k, amount: amt, payout: pay, outcome });
  };
  const comeOut = st.point === null;
  if (comeOut) {
    if (s === 7 || s === 11) { line('pass', 'win'); line('dont', 'lose'); done = true; }
    else if (s === 2 || s === 3) { line('pass', 'lose'); line('dont', 'win'); done = true; }
    else if (s === 12) { line('pass', 'lose'); line('dont', 'push'); done = true; }
    else st.point = s;
  } else if (s === st.point) { line('pass', 'win'); line('dont', 'lose'); done = true; }
  else if (s === 7) { line('pass', 'lose'); line('dont', 'win'); done = true; }

  if (!st.pass && !st.dont) done = true; // nur Ein-Wurf-Wetten: Runde sofort vorbei
  p.balance += paid;
  st.paid += paid;
  st.rolls.push(s);
  const view = { dice, sum: s, comeOut, point: done ? null : st.point, results, payout: paid, running: !done, pass: st.pass, dont: st.dont };
  if (done) {
    profiles.record(p, 'craps', st.wagered, st.paid, `Würfe: ${st.rolls.join(', ')}`);
    delete p.active.craps;
    view.roundBet = st.wagered;
    view.roundPaid = st.paid;
  }
  return view;
}

function state(p) {
  const st = p.active.craps;
  return st ? { running: true, point: st.point, pass: st.pass, dont: st.dont, rolls: st.rolls } : { running: false };
}

function start(p, body) {
  if (p.active.craps) throw new GameError('Es läuft schon eine Runde – weiterwürfeln!');
  const { amounts, total } = parseAmounts(body, ['pass', 'dont', ...ONE_ROLL], p);
  p.balance -= total;
  const st = { pass: amounts.pass, dont: amounts.dont, point: null, wagered: total, paid: 0, rolls: [] };
  p.active.craps = st;
  return doRoll(p, st, amounts);
}

function roll(p, body) {
  const st = p.active.craps;
  if (!st) throw new GameError('Keine laufende Runde.');
  const { amounts, total } = parseAmounts(body, ONE_ROLL, p, { allowZeroTotal: true });
  p.balance -= total;
  st.wagered += total;
  return doRoll(p, st, amounts);
}

module.exports = { state, start, roll };
module.exports._internal = { oneRollPay };
