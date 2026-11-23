// Texas Hold'em – Multiplayer-Tisch für bis zu 6 Spieler.
import { h, esc, fmt, celebrate, cardEl } from '../ui.js';
import { sfx } from '../sound.js';

const STREET = { preflop: 'Pre-Flop', flop: 'Flop', turn: 'Turn', river: 'River' };
const sameCard = (a, b) => a && b && a.r === b.r && a.s === b.s;

export default async function mount(root, ctx) {
  let alive = true, pollTimer = 0, st = null, busy = false, lastHand = null, lastPhase = null, shownBoard = 0, myCardsKey = '';

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="he-join">
        <label class="lbl">Einkauf (Chips an den Tisch)</label>
        <input type="number" class="input he-buyin" value="5000" min="1000" max="20000" step="500">
        <button class="btn btn-gold btn-big he-sit">HINSETZEN</button>
      </div>
      <div class="he-play hidden">
        <div class="he-actions">
          <button class="btn btn-red" data-a="fold">Passen <small>(F)</small></button>
          <button class="btn btn-green" data-a="check">Checken <small>(C)</small></button>
          <button class="btn btn-green" data-a="call">Mitgehen</button>
        </div>
        <label class="lbl">Erhöhen auf</label>
        <div class="row he-raise-row">
          <input type="range" class="he-slider" min="0" max="0" step="25">
          <input type="number" class="input he-raise" min="0" step="25">
        </div>
        <div class="row he-quick">
          <button class="btn btn-sm" data-q="min">Min</button>
          <button class="btn btn-sm" data-q="half">½ Pot</button>
          <button class="btn btn-sm" data-q="pot">Pot</button>
          <button class="btn btn-sm" data-q="all">All-in</button>
        </div>
        <button class="btn btn-gold he-raise-btn" data-a="raise">ERHÖHEN <small>(R)</small></button>
        <div class="row he-seat-tools">
          <button class="btn btn-sm he-rebuy">Nachkaufen</button>
          <button class="btn btn-sm he-leave">Aufstehen</button>
        </div>
      </div>
      <div class="he-mine kv hidden"><span>Deine Hand</span><span class="gold he-myhand"></span></div>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">No-Limit Texas Hold'em, Blinds 25/50. Ab 2 Spielern startet automatisch eine Hand. 25 s pro Zug – sonst wird gecheckt bzw. gepasst. Beim Aufstehen gehen deine Tisch-Chips zurück aufs Konto.</p>
      <div class="he-log"></div>
    </div>
    <div class="game-stage">
      <div class="he-wrap"><div class="he-table">
        <div class="he-felt">
          <div class="he-center">
            <div class="he-phase"></div>
            <div class="he-board"></div>
            <div class="he-pot"></div>
            <div class="result-msg"></div>
          </div>
        </div>
        <div class="he-seats"></div>
      </div></div>
    </div></div>`);
  root.appendChild(el);

  const $ = (s) => el.querySelector(s);
  const joinEl = $('.he-join'), playEl = $('.he-play'), seatsEl = $('.he-seats'), boardEl = $('.he-board');
  const slider = $('.he-slider'), raiseIn = $('.he-raise'), msg = $('.result-msg');
  const actBtns = [...el.querySelectorAll('[data-a]')];

  async function post(path, body, okSound) {
    if (busy) return;
    busy = true;
    try { const s = await ctx.post(path, body); busy = false; okSound?.(); onState(s); return s; } catch (e) { busy = false; ctx.toast(e.message, 'err'); }
  }

  $('.he-sit').addEventListener('click', () => post('/api/table/holdem/sit', { buyin: Number($('.he-buyin').value) }, sfx.coin));
  seatsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-sit]'); if (b) post('/api/table/holdem/sit', { buyin: Number($('.he-buyin').value), seat: Number(b.dataset.sit) }, sfx.coin); });
  $('.he-leave').addEventListener('click', () => post('/api/table/holdem/leave'));
  $('.he-rebuy').addEventListener('click', async () => {
    const me = st?.seats[st.mySeat];
    const max = st.buyin[1] - (me?.stack || 0);
    if (max <= 0) return ctx.toast('Du hast schon das Maximum am Tisch.', 'err');
    const amount = Math.min(max, ctx.getBalance());
    post('/api/table/holdem/rebuy', { amount }, sfx.coin);
  });
  slider.addEventListener('input', () => (raiseIn.value = slider.value));
  raiseIn.addEventListener('input', () => (slider.value = raiseIn.value));
  el.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
    const r = raiseRange();
    if (!r) return;
    const pot = st.pot + (st.currentBet - r.me.bet);
    const v = { min: r.min, half: st.currentBet + Math.floor(pot / 2), pot: st.currentBet + pot, all: r.max }[b.dataset.q];
    raiseIn.value = slider.value = Math.max(r.min, Math.min(r.max, v));
  }));
  actBtns.forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.a;
    const r = raiseRange();
    const body = { action: a };
    if (a === 'raise') { const v = Number(raiseIn.value); if (r && v >= r.max) body.action = 'allin'; else body.amount = v; }
    post('/api/table/holdem/act', body, a === 'fold' ? sfx.click : sfx.chip);
  }));
  const onKey = (e) => {
    if (e.target.matches('input, textarea')) return;
    const k = e.key.toLowerCase();
    const a = k === 'f' ? 'fold' : k === 'c' ? (st?.currentBet > (st?.seats[st.mySeat]?.bet || 0) ? 'call' : 'check') : k === 'r' ? 'raise' : null;
    const b = a && actBtns.find((x) => x.dataset.a === a && !x.disabled && !x.classList.contains('hidden'));
    if (b) b.click();
  };
  document.addEventListener('keydown', onKey);

  function raiseRange() {
    const me = st?.seats[st.mySeat];
    if (!me) return null;
    const max = me.bet + me.stack;
    return { me, max, min: Math.min(max, st.currentBet + st.minRaise) };
  }

  // Sitzpositionen rund um den ovalen Tisch (eigener Platz immer unten)
  const POS = [[50, 96], [9, 74], [9, 24], [50, 4], [91, 24], [91, 74]];

  function paintSeats(s) {
    const offset = s.mySeat >= 0 ? s.mySeat : 0;
    seatsEl.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const seat = s.seats[i];
      const [x, y] = POS[(i - offset + 6) % 6];
      let node;
      if (!seat) {
        node = h(`<div class="he-seat empty">${s.mySeat < 0 ? `<button class="btn btn-sm" data-sit="${i}">Hier setzen</button>` : '<span class="muted">frei</span>'}</div>`);
      } else {
        const turn = s.turn === i && (s.phase === 'playing');
        const winner = s.phase === 'showdown' && seat.won > 0;
        node = h(`<div class="he-seat ${seat.me ? 'me' : ''} ${turn ? 'turn' : ''} ${seat.folded ? 'folded' : ''} ${winner ? 'winner' : ''}">
          <div class="he-cards"></div>
          <div class="he-plate">
            <div class="he-name">${esc(seat.name)}${seat.leaving ? ' <small class="muted">(geht)</small>' : ''}</div>
            <div class="he-stack"><span class="chip-icon"></span>${fmt(seat.stack)}</div>
            ${turn ? `<div class="bjt-timer"><i style="animation-duration:${s.timeLeft}ms"></i></div>` : ''}
          </div>
          ${i === s.button ? '<span class="he-dealer">D</span>' : ''}
          ${seat.bet ? `<span class="he-bet"><span class="chip-icon"></span>${fmt(seat.bet)}</span>` : ''}
          ${seat.allIn && !seat.folded ? '<span class="he-tag">ALL-IN</span>' : ''}
          ${winner ? `<span class="he-tag win">+${fmt(seat.won)}</span>` : ''}
          ${seat.shown ? `<div class="he-handname">${esc(seat.shown.name)}</div>` : ''}
        </div>`);
        const cardsEl = node.querySelector('.he-cards');
        if (seat.inHand) {
          const best = s.phase === 'showdown' ? seat.shown?.best : null;
          seat.cards.forEach((c) => cardsEl.appendChild(cardEl(c, (best && best.some((b) => sameCard(b, c)) ? 'he-best ' : '') + (seat.me && myCardsKey !== s.hand ? 'deal' : (seat.shown && lastPhase !== 'showdown' ? 'flip' : '')))));
        }
      }
      node.style.left = x + '%';
      node.style.top = y + '%';
      seatsEl.appendChild(node);
    }
    const me = s.seats[s.mySeat];
    if (me?.inHand && myCardsKey !== s.hand) { myCardsKey = s.hand; sfx.card(); }
  }

  function paintBoard(s) {
    if (s.board.length < shownBoard) { boardEl.innerHTML = ''; shownBoard = 0; }
    const winners = s.phase === 'showdown' ? s.seats.filter((x) => x?.shown && x.won > 0).flatMap((x) => x.shown.best) : [];
    boardEl.replaceChildren(...s.board.map((c, i) => cardEl(c, (i >= shownBoard ? 'deal ' : '') + (winners.some((b) => sameCard(b, c)) ? 'he-best' : ''))));
    for (let i = s.board.length; i < 5; i++) boardEl.appendChild(h('<div class="he-slot"></div>'));
    if (s.board.length > shownBoard) sfx.card();
    shownBoard = s.board.length;
  }

  function onState(s) {
    const newHand = s.hand !== lastHand;
    if (newHand) { shownBoard = 0; msg.className = 'result-msg'; msg.textContent = ''; }
    if (s.phase === 'showdown' && lastPhase !== 'showdown') {
      const me = s.seats[s.mySeat];
      const w = s.winners || [];
      msg.className = 'result-msg ' + (me?.won ? 'win' : me?.inHand ? 'lose' : '');
      msg.textContent = w.map((x) => `${x.name} gewinnt ${fmt(x.amount)}${x.hand ? ` mit ${x.hand}` : ''}`).join(' · ');
      if (me?.won) celebrate(me.won, Math.max(1, me.won / 2)); else if (me?.inHand && !me.folded) sfx.lose();
    }
    st = s;
    paintBoard(s);
    paintSeats(s);
    lastHand = s.hand;
    lastPhase = s.phase;
    if (s.balance !== null && s.balance !== undefined && !busy) ctx.setBalance(s.balance);

    const me = s.seats[s.mySeat];
    const secs = s.timeLeft !== null ? Math.ceil(s.timeLeft / 1000) : null;
    const seated = s.seats.filter(Boolean).length;
    $('.he-phase').innerHTML = s.phase === 'waiting' ? (seated < 2 ? 'Warte auf mindestens 2 Spieler …' : `Nächste Hand in ${secs ?? 0} s`)
      : s.phase === 'showdown' ? `Nächste Hand in ${secs} s`
        : `${STREET[s.street] || ''}${s.phase === 'playing' && s.turn >= 0 ? (s.turn === s.mySeat ? ` – <span class="gold">Du bist dran (${secs} s)</span>` : ` – ${esc(s.seats[s.turn]?.name || '')} ist dran`) : ''}`;
    $('.he-pot').innerHTML = s.pot ? `Pot <b class="gold">${fmt(s.pot)}</b>` : '';
    $('.he-log').innerHTML = s.log.map((l) => `<div>${esc(l)}</div>`).join('');
    joinEl.classList.toggle('hidden', s.mySeat >= 0);
    playEl.classList.toggle('hidden', s.mySeat < 0);
    $('.he-mine').classList.toggle('hidden', !me?.myHand || me.folded);
    $('.he-myhand').textContent = me?.myHand || '';

    const myTurn = s.phase === 'playing' && s.turn === s.mySeat && s.mySeat >= 0;
    const toCall = me ? s.currentBet - me.bet : 0;
    const btn = (a) => actBtns.find((b) => b.dataset.a === a);
    btn('check').classList.toggle('hidden', toCall > 0);
    btn('call').classList.toggle('hidden', toCall <= 0);
    btn('call').innerHTML = `Mitgehen ${fmt(Math.min(toCall, me?.stack || 0))} <small>(C)</small>`;
    const r = raiseRange();
    const canRaise = myTurn && r && r.max > s.currentBet;
    actBtns.forEach((b) => (b.disabled = busy || !myTurn));
    btn('raise').disabled = busy || !canRaise;
    el.querySelectorAll('[data-q]').forEach((b) => (b.disabled = !canRaise));
    if (r) {
      slider.min = r.min; slider.max = r.max;
      if (!myTurn || Number(raiseIn.value) < r.min || Number(raiseIn.value) > r.max) raiseIn.value = slider.value = r.min;
      btn('raise').innerHTML = Number(raiseIn.value) >= r.max ? 'ALL-IN <small>(R)</small>' : `${s.currentBet ? 'ERHÖHEN' : 'SETZEN'} <small>(R)</small>`;
    }
    $('.he-leave').disabled = busy;
    $('.he-rebuy').disabled = busy || (me?.inHand && !me.folded && s.phase !== 'showdown' && s.phase !== 'waiting');
  }
  raiseIn.addEventListener('input', () => st && onState(st));
  slider.addEventListener('input', () => st && onState(st));

  async function poll() {
    if (!alive) return;
    try { onState(await ctx.get('/api/table/holdem')); } catch { /* nächster Versuch */ }
    pollTimer = setTimeout(poll, 500);
  }
  await poll();
  return () => { alive = false; clearTimeout(pollTimer); document.removeEventListener('keydown', onKey); };
}
