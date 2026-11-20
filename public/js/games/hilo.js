// Hi-Lo – Frontend.
import { h, fmt, fmtMult, celebrate, cardEl } from '../ui.js';
import { sfx } from '../sound.js';

const pct = (x) => (x * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %';

export default async function mount(root, ctx) {
  let busy = false;
  let st = { running: false };
  let lastCards = [];

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <button class="btn btn-gold btn-big main-btn">START</button>
      <div class="kv"><span>Multiplikator</span><span class="h-mult">–</span></div>
      <div class="kv"><span>Treffer</span><span class="h-steps">0</span></div>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">Tippe, ob die nächste Karte höher oder niedriger ist. Ass ist die niedrigste, König die höchste Karte. Gleicher Wert = verloren. Tasten: ↑ höher · ↓ niedriger · → überspringen.</p>
    </div>
    <div class="game-stage">
      <div class="felt hilo-table">
        <div class="hilo-history"></div>
        <div class="hilo-main">
          <button class="btn hilo-btn hi" data-d="higher"><span>▲ HÖHER</span><small></small></button>
          <div class="hilo-card"></div>
          <button class="btn hilo-btn lo" data-d="lower"><span>▼ NIEDRIGER</span><small></small></button>
        </div>
        <button class="btn btn-sm skip-btn">Karte überspringen →</button>
        <div class="result-msg"></div>
      </div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'hilo', initial: 100 });
  el.querySelector('.bet-slot').appendChild(bet.el);
  const mainBtn = el.querySelector('.main-btn');
  const hiBtn = el.querySelector('[data-d="higher"]'), loBtn = el.querySelector('[data-d="lower"]');
  const skipBtn = el.querySelector('.skip-btn');
  const cardBox = el.querySelector('.hilo-card');
  const hist = el.querySelector('.hilo-history');
  const msg = el.querySelector('.result-msg');
  const multEl = el.querySelector('.h-mult'), stepsEl = el.querySelector('.h-steps');

  function paintCards(cards, animate) {
    const cur = cards[cards.length - 1];
    if (cur) cardBox.replaceChildren(cardEl(cur, animate ? 'flip' : ''));
    else cardBox.replaceChildren(cardEl(null));
    hist.replaceChildren(...cards.slice(-9, -1).map((c) => cardEl(c, 'mini')));
  }

  function paint() {
    const r = st.running;
    bet.setDisabled(r || busy);
    mainBtn.disabled = busy || (r && !st.steps);
    mainBtn.textContent = r ? (st.steps ? `AUSCASHEN  ${fmt(st.payoutNow)}` : 'Tippe zuerst …') : 'START';
    mainBtn.classList.toggle('btn-green', r);
    mainBtn.classList.toggle('btn-gold', !r);
    hiBtn.disabled = !r || busy || !st.higher?.chance;
    loBtn.disabled = !r || busy || !st.lower?.chance;
    skipBtn.disabled = !r || busy || !st.skipsLeft;
    hiBtn.querySelector('small').textContent = r && st.higher.chance ? `${pct(st.higher.chance)} · ${fmtMult(st.higher.mult)}` : '';
    loBtn.querySelector('small').textContent = r && st.lower.chance ? `${pct(st.lower.chance)} · ${fmtMult(st.lower.mult)}` : '';
    multEl.textContent = r && st.steps ? fmtMult(st.multiplier) : '–';
    stepsEl.textContent = r ? st.steps : 0;
  }

  async function call(action, body = {}) {
    if (busy) return;
    busy = true;
    paint();
    try {
      const r = await ctx.post(`/api/games/hilo/${action}`, body);
      ctx.setBalance(r.balance);
      const isNewCard = r.cards && r.cards.length !== lastCards.length;
      lastCards = r.cards || lastCards;
      if (action === 'start') { msg.className = 'result-msg'; msg.textContent = ''; }
      if (r.running) {
        st = r;
        paintCards(r.cards, isNewCard);
        if (action === 'guess') sfx.gem(); else if (isNewCard) sfx.card();
      } else {
        st = { running: false };
        paintCards(r.cards, action === 'guess');
        if (r.won) {
          msg.className = 'result-msg win';
          msg.textContent = `${fmtMult(r.multiplier)} – +${fmt(r.payout)} Chips!`;
          sfx.cashout();
          celebrate(r.payout, r.bet);
        } else {
          msg.className = 'result-msg lose';
          msg.textContent = `Falsch getippt – −${fmt(r.bet)} Chips`;
          sfx.lose();
        }
      }
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      paint();
    }
  }

  mainBtn.addEventListener('click', () => (st.running ? call('cashout') : call('start', { bet: bet.value })));
  hiBtn.addEventListener('click', () => call('guess', { dir: 'higher' }));
  loBtn.addEventListener('click', () => call('guess', { dir: 'lower' }));
  skipBtn.addEventListener('click', () => call('skip'));
  const onKey = (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    if (e.key === 'ArrowUp' && !hiBtn.disabled) { e.preventDefault(); hiBtn.click(); }
    if (e.key === 'ArrowDown' && !loBtn.disabled) { e.preventDefault(); loBtn.click(); }
    if (e.key === 'ArrowRight' && !skipBtn.disabled) { e.preventDefault(); skipBtn.click(); }
    if (e.code === 'Space' && document.activeElement?.tagName !== 'BUTTON' && !mainBtn.disabled) { e.preventDefault(); mainBtn.click(); }
  };
  document.addEventListener('keydown', onKey);

  st = await ctx.post('/api/games/hilo/state');
  if (st.running) { lastCards = st.cards; paintCards(st.cards, false); } else paintCards([], false);
  paint();
  return () => document.removeEventListener('keydown', onKey);
}
