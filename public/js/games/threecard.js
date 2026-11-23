// Drei-Karten-Poker – Frontend.
import { h, fmt, sleep, celebrate, cardEl } from '../ui.js';
import { sfx } from '../sound.js';

export default async function mount(root, ctx) {
  let alive = true, busy = false, running = false;

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="ante-slot"></div>
      <div class="pp-slot"></div>
      <button class="btn btn-gold btn-big deal-btn">KARTEN GEBEN</button>
      <div class="tc-actions hidden">
        <button class="btn btn-green btn-big play-btn">SPIELEN</button>
        <button class="btn btn-red fold-btn">Passen (Ante verloren)</button>
      </div>
      <table class="tbl tc-pay">
        <thead><tr><th>Hand</th><th class="num">Paar-Plus</th><th class="num">Ante-Bonus</th></tr></thead>
        <tbody>
          <tr><td>Straight Flush</td><td class="num">40:1</td><td class="num">5:1</td></tr>
          <tr><td>Drilling</td><td class="num">30:1</td><td class="num">4:1</td></tr>
          <tr><td>Straße</td><td class="num">6:1</td><td class="num">1:1</td></tr>
          <tr><td>Flush</td><td class="num">4:1</td><td class="num">–</td></tr>
          <tr><td>Paar</td><td class="num">1:1</td><td class="num">–</td></tr>
        </tbody>
      </table>
      <p class="muted" style="margin:0;font-size:.78rem;line-height:1.5">Ansehen → Spielen (gleicher Einsatz nochmal) oder Passen. Dealer spielt ab Dame hoch. Bei 3 Karten ist die Straße mehr wert als der Flush!</p>
    </div>
    <div class="game-stage">
      <div class="felt tc-table">
        <div class="bj-zone"><div class="bj-label">Dealer <span class="bj-val d-hand"></span></div><div class="bj-cards d-cards"></div></div>
        <div class="result-msg"></div>
        <div class="bj-zone"><div class="bj-cards p-cards"></div><div class="bj-label">Du <span class="bj-val p-hand"></span></div></div>
      </div>
    </div></div>`);
  root.appendChild(el);

  const ante = ctx.bet({ game: 'threecard', initial: 50, label: 'Ante' });
  const pp = ctx.bet({ game: 'threecard-pp', initial: 0, min: 0, label: 'Paar-Plus (optional)' });
  el.querySelector('.ante-slot').appendChild(ante.el);
  el.querySelector('.pp-slot').appendChild(pp.el);
  const dealBtn = el.querySelector('.deal-btn');
  const actions = el.querySelector('.tc-actions');
  const playBtn = el.querySelector('.play-btn');
  const foldBtn = el.querySelector('.fold-btn');
  const dCards = el.querySelector('.d-cards'), pCards = el.querySelector('.p-cards');
  const dHand = el.querySelector('.d-hand'), pHand = el.querySelector('.p-hand');
  const msg = el.querySelector('.result-msg');

  function setRunning(r, anteAmount) {
    running = r;
    dealBtn.classList.toggle('hidden', r);
    actions.classList.toggle('hidden', !r);
    ante.setDisabled(r);
    pp.setDisabled(r);
    if (r) playBtn.textContent = `SPIELEN (+${fmt(anteAmount)})`;
  }

  async function showPlayer(cards, animate) {
    pCards.replaceChildren();
    for (const c of cards) {
      pCards.appendChild(cardEl(c, animate ? 'deal' : ''));
      if (animate) { sfx.card(); await sleep(160); }
    }
  }

  async function deal() {
    if (busy) return;
    busy = true;
    dealBtn.disabled = true;
    msg.className = 'result-msg';
    msg.textContent = '';
    dHand.textContent = '';
    try {
      const r = await ctx.post('/api/games/threecard/deal', { ante: ante.value, pairplus: pp.value });
      ctx.setBalance(r.balance);
      dCards.replaceChildren(cardEl(null), cardEl(null), cardEl(null));
      await showPlayer(r.player, true);
      pHand.textContent = r.hand;
      setRunning(true, r.ante);
      playBtn.disabled = !r.canPlay;
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
    playBtn.disabled = foldBtn.disabled = true;
    try {
      const r = await ctx.post(`/api/games/threecard/${action}`);
      ctx.setBalance(r.balance - r.payout);
      for (let i = 0; i < 3 && alive; i++) {
        dCards.children[i].replaceWith(cardEl(r.dealer[i], 'flip'));
        sfx.card();
        await sleep(220);
      }
      if (!alive) return;
      dHand.textContent = r.dealerHand + (r.dealerQualifies ? '' : ' (spielt nicht)');
      ctx.setBalance(r.balance);
      const net = r.payout - r.totalBet;
      const texts = { fold: 'Gepasst', noqualify: 'Dealer qualifiziert sich nicht – Ante gewinnt', win: 'Gewonnen!', push: 'Unentschieden', lose: 'Dealer gewinnt' };
      const extras = [r.anteBonus ? `Ante-Bonus +${fmt(r.anteBonus)}` : '', r.pairPlus ? `Paar-Plus ${fmt(r.pairPlus)}` : ''].filter(Boolean).join(' · ');
      msg.className = 'result-msg ' + (net > 0 ? 'win' : net < 0 ? 'lose' : 'push');
      msg.textContent = `${texts[r.outcome]} ${net > 0 ? '+' + fmt(net) : net < 0 ? '−' + fmt(-net) : '±0'}${extras ? ' · ' + extras : ''}`;
      if (net > 0) celebrate(r.payout, r.totalBet); else if (net < 0) sfx.lose();
      setRunning(false);
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      playBtn.disabled = foldBtn.disabled = false;
    }
  }

  dealBtn.addEventListener('click', deal);
  playBtn.addEventListener('click', () => decide('play'));
  foldBtn.addEventListener('click', () => decide('fold'));

  const st = await ctx.post('/api/games/threecard/state');
  if (st.running) {
    dCards.replaceChildren(cardEl(null), cardEl(null), cardEl(null));
    await showPlayer(st.player, false);
    pHand.textContent = st.hand;
    setRunning(true, st.ante);
  }
  return () => { alive = false; };
}
