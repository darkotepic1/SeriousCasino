// Red Dog – Frontend.
import { h, fmt, sleep, celebrate, cardEl } from '../ui.js';
import { sfx } from '../sound.js';

export default async function mount(root, ctx) {
  let alive = true, busy = false;

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <button class="btn btn-gold btn-big deal-btn">KARTEN GEBEN</button>
      <div class="rd-actions hidden">
        <button class="btn btn-green btn-big raise-btn">VERDOPPELN & ZIEHEN</button>
        <button class="btn call-btn">Dritte Karte ziehen</button>
      </div>
      <table class="tbl rd-pay"><thead><tr><th>Lücke</th><th class="num">Gewinn</th></tr></thead><tbody>
        <tr data-g="1"><td>1 Karte</td><td class="num">5:1</td></tr>
        <tr data-g="2"><td>2 Karten</td><td class="num">4:1</td></tr>
        <tr data-g="3"><td>3 Karten</td><td class="num">2:1</td></tr>
        <tr data-g="4"><td>4 oder mehr</td><td class="num">1:1</td></tr>
        <tr><td>Paar → Drilling</td><td class="num">11:1</td></tr>
      </tbody></table>
      <p class="muted" style="margin:0;font-size:.78rem;line-height:1.5">Fällt die dritte Karte <b>zwischen</b> die beiden ersten, gewinnst du. Je kleiner die Lücke, desto höher der Gewinn. Benachbarte Karten = Einsatz zurück. Ass ist hoch.</p>
    </div>
    <div class="game-stage">
      <div class="felt rd-table">
        <div class="rd-cards"><div class="rd-slot c1"></div><div class="rd-slot c3"></div><div class="rd-slot c2"></div></div>
        <div class="rd-gap"></div>
        <div class="result-msg"></div>
      </div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'reddog', initial: 100 });
  el.querySelector('.bet-slot').appendChild(bet.el);
  const dealBtn = el.querySelector('.deal-btn');
  const actions = el.querySelector('.rd-actions');
  const raiseBtn = el.querySelector('.raise-btn'), callBtn = el.querySelector('.call-btn');
  const s1 = el.querySelector('.c1'), s2 = el.querySelector('.c2'), s3 = el.querySelector('.c3');
  const gapEl = el.querySelector('.rd-gap');
  const msg = el.querySelector('.result-msg');
  const rows = [...el.querySelectorAll('[data-g]')];

  function reset() {
    s1.replaceChildren(cardEl(null)); s2.replaceChildren(cardEl(null)); s3.replaceChildren(h('<div class="rd-empty">?</div>'));
    gapEl.textContent = '';
    rows.forEach((r) => r.classList.remove('hl'));
  }
  function showGap(gap) {
    gapEl.textContent = `Lücke: ${gap} Karte${gap === 1 ? '' : 'n'} – zahlt ${gap === 1 ? '5:1' : gap === 2 ? '4:1' : gap === 3 ? '2:1' : '1:1'}`;
    rows.forEach((r) => r.classList.toggle('hl', Number(r.dataset.g) === Math.min(gap, 4)));
  }
  function setRunning(on, canRaise = true) {
    dealBtn.classList.toggle('hidden', on);
    actions.classList.toggle('hidden', !on);
    bet.setDisabled(on);
    raiseBtn.disabled = !canRaise;
  }
  function result(r) {
    const net = r.payout - r.totalBet;
    msg.className = 'result-msg ' + (net > 0 ? 'win' : net < 0 ? 'lose' : 'push');
    msg.textContent = `${r.text} ${net > 0 ? '+' + fmt(net) : net < 0 ? '−' + fmt(-net) : '±0'}`;
    if (net > 0) celebrate(r.payout, r.totalBet); else if (net < 0) sfx.lose();
  }

  async function deal() {
    if (busy) return;
    busy = true;
    dealBtn.disabled = true;
    reset();
    msg.className = 'result-msg';
    msg.textContent = '';
    try {
      const r = await ctx.post('/api/games/reddog/deal', { bet: bet.value });
      ctx.setBalance(r.balance - (r.running ? 0 : r.payout));
      s1.replaceChildren(cardEl(r.cards[0], 'deal')); sfx.card(); await sleep(300);
      s2.replaceChildren(cardEl(r.cards[1], 'deal')); sfx.card(); await sleep(300);
      if (r.third) { s3.replaceChildren(cardEl(r.third, 'flip')); sfx.card(); await sleep(300); }
      if (!alive) return;
      ctx.setBalance(r.balance);
      if (r.running) { showGap(r.gap); setRunning(true, r.canRaise); } else result(r);
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
    raiseBtn.disabled = callBtn.disabled = true;
    try {
      const r = await ctx.post(`/api/games/reddog/${action}`);
      ctx.setBalance(r.balance - r.payout);
      await sleep(250);
      s3.replaceChildren(cardEl(r.third, 'flip')); sfx.card();
      await sleep(350);
      if (!alive) return;
      ctx.setBalance(r.balance);
      result(r);
      setRunning(false);
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      callBtn.disabled = false;
    }
  }

  dealBtn.addEventListener('click', deal);
  raiseBtn.addEventListener('click', () => decide('raise'));
  callBtn.addEventListener('click', () => decide('call'));

  reset();
  const st = await ctx.post('/api/games/reddog/state');
  if (st.running) {
    s1.replaceChildren(cardEl(st.cards[0])); s2.replaceChildren(cardEl(st.cards[1]));
    showGap(st.gap);
    setRunning(true, ctx.getBalance() >= st.bet);
  }
  return () => { alive = false; };
}
