// Multiplayer-Blackjack – bis zu 5 Spieler an einem Tisch gegen denselben Dealer.
import { h, esc, fmt, sleep, celebrate, cardEl } from '../ui.js';
import { sfx } from '../sound.js';

const RES = { win: ['Gewonnen', 'pos'], blackjack: ['Blackjack!', 'pos'], push: ['Unentschieden', 'muted'], lose: ['Verloren', 'neg'], bust: ['Überkauft', 'neg'] };

export default async function mount(root, ctx) {
  let alive = true, pollTimer = 0, st = null, busy = false, lastRound = null, lastPhase = null;
  let shownSeat = {}, shownDealer = 0, dealerReveal = null;

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <button class="btn btn-gold btn-big bet-btn">EINSATZ SETZEN</button>
      <div class="bj-actions">
        <button class="btn btn-green" data-a="hit">Karte <small>(H)</small></button>
        <button class="btn btn-red" data-a="stand">Halten <small>(S)</small></button>
        <button class="btn" data-a="double">Verdoppeln <small>(D)</small></button>
      </div>
      <button class="btn btn-sm leave-btn hidden">Tisch verlassen</button>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">Bis zu 5 Spieler, ein Dealer. Wenn der erste setzt, läuft die Wettphase 15 s. Danach ist jeder der Reihe nach dran (20 s, sonst wird automatisch gehalten). Blackjack zahlt 3:2, Dealer steht auf 17.</p>
    </div>
    <div class="game-stage">
      <div class="bjt-wrap"><div class="felt bj-table bjt-table">
        <div class="bj-zone">
          <div class="bj-label">Dealer <span class="bj-val dealer-val"></span></div>
          <div class="bj-cards dealer-cards"></div>
        </div>
        <div class="bj-center"><div class="bjt-phase"></div><div class="result-msg"></div></div>
        <div class="bjt-seats"></div></div>
      </div>
    </div></div>`);
  root.appendChild(el);

  const amount = ctx.bet({ game: 'bjtable', initial: 100, label: 'Einsatz' });
  el.querySelector('.bet-slot').appendChild(amount.el);
  const betBtn = el.querySelector('.bet-btn'), leaveBtn = el.querySelector('.leave-btn');
  const actBtns = [...el.querySelectorAll('[data-a]')];
  const dealerEl = el.querySelector('.dealer-cards'), dealerVal = el.querySelector('.dealer-val');
  const seatsEl = el.querySelector('.bjt-seats'), phaseEl = el.querySelector('.bjt-phase'), msg = el.querySelector('.result-msg');

  async function post(path, body) {
    if (busy) return;
    busy = true;
    try { const s = await ctx.post(path, body); busy = false; onState(s); return s; } catch (e) { busy = false; ctx.toast(e.message, 'err'); }
  }

  betBtn.addEventListener('click', async () => { if (await post('/api/table/blackjack/bet', { amount: amount.value })) sfx.chip(); });
  leaveBtn.addEventListener('click', () => post('/api/table/blackjack/leave'));
  seatsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-sit]'); if (b) post('/api/table/blackjack/sit', { seat: Number(b.dataset.sit) }); });
  actBtns.forEach((b) => b.addEventListener('click', () => { sfx.click(); post('/api/table/blackjack/act', { action: b.dataset.a }); }));
  const onKey = (e) => {
    if (e.target.matches('input, textarea')) return;
    const a = { h: 'hit', s: 'stand', d: 'double' }[e.key.toLowerCase()];
    const b = a && actBtns.find((x) => x.dataset.a === a);
    if (b && !b.disabled) b.click();
  };
  document.addEventListener('keydown', onKey);

  function paintDealer(s) {
    let cards = s.dealer.cards;
    let value = s.dealer.value;
    if (s.phase === 'dealer' && dealerReveal) {
      // Dealer-Karten nacheinander aufdecken
      const n = Math.min(cards.length, 2 + Math.floor((Date.now() - dealerReveal) / s.dealerStepMs));
      cards = cards.slice(0, n);
      value = null;
    }
    if (cards.length !== shownDealer || (cards[1] && dealerEl.children[1]?.classList.contains('back'))) {
      const from = cards.length < shownDealer ? 0 : shownDealer;
      dealerEl.replaceChildren(...cards.map((c, i) => cardEl(c, i >= from ? (i === 1 && c ? 'flip' : 'deal') : (i === 1 && c && dealerEl.children[1]?.classList.contains('back') ? 'flip' : ''))));
      if (cards.length > shownDealer) sfx.card?.();
      shownDealer = cards.length;
    }
    dealerVal.textContent = value === null ? '' : cards.length ? value : '';
  }

  function paintSeats(s) {
    const mine = s.mySeat;
    seatsEl.innerHTML = '';
    s.seats.forEach((seat, i) => {
      if (!seat) {
        seatsEl.appendChild(h(`<div class="bjt-seat empty">${mine < 0 && s.phase !== 'playing' && s.phase !== 'dealer' ? `<button class="btn btn-sm" data-sit="${i}">Platz ${i + 1} nehmen</button>` : `<span class="muted">Platz ${i + 1} frei</span>`}</div>`));
        return;
      }
      const prev = shownSeat[i] ?? 0;
      const turn = s.turn === i;
      const box = h(`<div class="bjt-seat bj-hand ${turn ? 'active' : ''} ${seat.me ? 'me' : ''} ${seat.result ? 'res-' + (RES[seat.result][1] === 'neg' ? 'lose' : 'win') : ''}">
        <div class="bj-cards"></div>
        <div class="bj-hand-info">${seat.cards.length ? `<span class="bj-val">${seat.value}</span>` : ''}${seat.bet ? `<span class="lc-bet"><span class="chip-icon"></span>${fmt(seat.bet)}${seat.doubled ? ' ×2' : ''}</span>` : '<span class="muted">kein Einsatz</span>'}</div>
        <div class="bjt-name">${esc(seat.name)}${seat.me ? ' <small class="gold">(du)</small>' : ''}</div>
        ${turn ? `<div class="bjt-timer"><i style="animation-duration:${s.timeLeft}ms"></i></div>` : ''}
        ${seat.result ? `<div class="bjt-res ${RES[seat.result][1]}">${RES[seat.result][0]}${seat.payout > seat.bet ? ` +${fmt(seat.payout - seat.bet)}` : ''}</div>` : ''}
      </div>`);
      box.querySelector('.bj-cards').append(...seat.cards.map((c, k) => cardEl(c, k >= prev ? 'deal' : '')));
      if (seat.cards.length > prev) sfx.card?.();
      shownSeat[i] = seat.cards.length;
      seatsEl.appendChild(box);
    });
  }

  function onState(s) {
    const newRound = s.round !== lastRound;
    const changed = newRound || s.phase !== lastPhase;
    st = s;
    if (newRound) { shownSeat = {}; shownDealer = 0; dealerEl.replaceChildren(); }
    if (changed) {
      if (s.phase === 'betting') { msg.className = 'result-msg'; msg.textContent = ''; }
      dealerReveal = s.phase === 'dealer' ? Date.now() - (s.dealer.cards.length - 1) * s.dealerStepMs + s.timeLeft : null;
      if (s.phase === 'result') {
        const me = s.seats[s.mySeat];
        if (me?.result) {
          const [t, c] = RES[me.result];
          const net = me.payout - me.bet;
          msg.className = 'result-msg ' + (c === 'pos' ? 'win' : c === 'neg' ? 'lose' : 'push');
          msg.textContent = `${t}${net ? ` (${net > 0 ? '+' : '−'}${fmt(Math.abs(net))})` : ''}`;
          if (net > 0) celebrate(me.payout, me.bet); else if (net < 0) sfx.lose();
        }
      }
    }
    lastRound = s.round;
    lastPhase = s.phase;
    if (s.balance !== null && s.balance !== undefined && !busy) ctx.setBalance(s.balance);

    const secs = s.timeLeft !== null ? Math.ceil(s.timeLeft / 1000) : null;
    const turnName = s.turn >= 0 ? s.seats[s.turn]?.name : '';
    phaseEl.innerHTML = s.phase === 'betting'
      ? (secs !== null ? `<span class="pos">Einsätze</span> – noch <b>${secs} s</b>` : s.seats.some(Boolean) ? 'Warte auf den ersten Einsatz …' : 'Setz dich an den Tisch!')
      : s.phase === 'playing' ? (s.seats[s.turn]?.me ? `<span class="gold">Du bist dran!</span> (${secs} s)` : `${esc(turnName)} ist dran …`)
        : s.phase === 'dealer' ? 'Dealer zieht …' : `Nächste Runde in ${secs} s`;

    paintDealer(s);
    paintSeats(s);
    const meSeat = s.seats[s.mySeat];
    const myTurn = s.phase === 'playing' && s.turn === s.mySeat && s.mySeat >= 0;
    actBtns.forEach((b) => { b.disabled = busy || !myTurn || (b.dataset.a === 'double' && meSeat?.cards.length !== 2); });
    betBtn.disabled = busy || s.phase !== 'betting';
    betBtn.textContent = meSeat?.bet ? 'NACHLEGEN' : 'EINSATZ SETZEN';
    leaveBtn.classList.toggle('hidden', s.mySeat < 0 || (meSeat?.bet > 0 && (s.phase === 'playing' || s.phase === 'dealer')));
  }

  async function poll() {
    if (!alive) return;
    try { onState(await ctx.get('/api/table/blackjack')); } catch { /* nächster Versuch */ }
    pollTimer = setTimeout(poll, st?.phase === 'dealer' ? 250 : 500);
  }
  await poll();
  return () => { alive = false; clearTimeout(pollTimer); document.removeEventListener('keydown', onKey); };
}
