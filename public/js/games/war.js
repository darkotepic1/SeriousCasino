// Kartenkrieg – Frontend.
import { h, fmt, sleep, celebrate, cardEl } from '../ui.js';
import { sfx } from '../sound.js';

export default async function mount(root, ctx) {
  let alive = true, busy = false;

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <div class="tie-slot"></div>
      <button class="btn btn-gold btn-big deal-btn">KARTEN ZIEHEN</button>
      <div class="war-actions hidden">
        <button class="btn btn-red btn-big war-btn">⚔️ KRIEG!</button>
        <button class="btn surr-btn">Aufgeben (halber Einsatz zurück)</button>
      </div>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">Die höhere Karte gewinnt 1:1 (Ass ist die höchste). Bei Gleichstand: <b>Krieg</b> (Einsatz verdoppeln, neue Karten – du gewinnst auch bei erneutem Gleichstand) oder <b>Aufgeben</b>. Nebenwette „Gleichstand“ zahlt 10:1.</p>
    </div>
    <div class="game-stage">
      <div class="felt war-table">
        <div class="war-side"><div class="bj-label">Dealer</div><div class="bj-cards d-cards"></div></div>
        <div class="war-vs">VS</div>
        <div class="war-side"><div class="bj-label">Du</div><div class="bj-cards p-cards"></div></div>
        <div class="result-msg"></div>
      </div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'war', initial: 100 });
  const tie = ctx.bet({ game: 'war-tie', initial: 0, min: 0, label: 'Nebenwette Gleichstand (optional)' });
  el.querySelector('.bet-slot').appendChild(bet.el);
  el.querySelector('.tie-slot').appendChild(tie.el);
  const dealBtn = el.querySelector('.deal-btn');
  const warActions = el.querySelector('.war-actions');
  const warBtn = el.querySelector('.war-btn'), surrBtn = el.querySelector('.surr-btn');
  const dCards = el.querySelector('.d-cards'), pCards = el.querySelector('.p-cards');
  const msg = el.querySelector('.result-msg');

  function setTie(on, canWar = true) {
    dealBtn.classList.toggle('hidden', on);
    warActions.classList.toggle('hidden', !on);
    bet.setDisabled(on);
    tie.setDisabled(on);
    warBtn.disabled = !canWar;
  }

  function result(r) {
    const net = r.payout - r.totalBet;
    msg.className = 'result-msg ' + (net > 0 ? 'win' : net < 0 ? 'lose' : 'push');
    msg.textContent = `${r.outcome} ${net > 0 ? '+' + fmt(net) : net < 0 ? '−' + fmt(-net) : '±0'}${r.tiePay ? ` (Gleichstand-Wette +${fmt(r.tiePay)})` : ''}`;
    if (net > 0) celebrate(r.payout, r.totalBet); else if (net < 0) sfx.lose();
  }

  async function deal() {
    if (busy) return;
    busy = true;
    dealBtn.disabled = true;
    msg.className = 'result-msg';
    msg.textContent = '';
    try {
      const r = await ctx.post('/api/games/war/deal', { bet: bet.value, tie: tie.value });
      ctx.setBalance(r.balance - (r.running ? 0 : r.payout));
      pCards.replaceChildren(cardEl(r.player, 'deal')); sfx.card(); await sleep(350);
      dCards.replaceChildren(cardEl(r.dealer, 'deal')); sfx.card(); await sleep(300);
      if (!alive) return;
      ctx.setBalance(r.balance);
      if (r.running) {
        msg.className = 'result-msg push';
        msg.textContent = `Gleichstand!${r.tiePay ? ` Nebenwette +${fmt(r.tiePay)}.` : ''} Krieg oder aufgeben?`;
        setTie(true, r.canWar);
      } else result(r);
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      dealBtn.disabled = false;
    }
  }

  async function decide(action) {
    if (busy) return;
    busy = true;
    warBtn.disabled = surrBtn.disabled = true;
    try {
      const r = await ctx.post(`/api/games/war/${action}`);
      ctx.setBalance(r.balance - r.payout);
      if (r.war) {
        sfx.boom();
        pCards.appendChild(cardEl(r.player2, 'deal')); sfx.card(); await sleep(400);
        dCards.appendChild(cardEl(r.dealer2, 'deal')); sfx.card(); await sleep(300);
      }
      if (!alive) return;
      ctx.setBalance(r.balance);
      result(r);
      setTie(false);
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      surrBtn.disabled = false;
    }
  }

  dealBtn.addEventListener('click', deal);
  warBtn.addEventListener('click', () => decide('war'));
  surrBtn.addEventListener('click', () => decide('surrender'));

  const st = await ctx.post('/api/games/war/state');
  if (st.running) {
    pCards.replaceChildren(cardEl(st.player));
    dCards.replaceChildren(cardEl(st.dealer));
    msg.textContent = 'Gleichstand! Krieg oder aufgeben?';
    setTie(true, ctx.getBalance() >= st.bet);
  } else {
    pCards.replaceChildren(cardEl(null));
    dCards.replaceChildren(cardEl(null));
  }
  return () => { alive = false; };
}
