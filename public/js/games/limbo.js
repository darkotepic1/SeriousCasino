// Limbo – Frontend.
import { h, fmt, fmtMult, celebrate, payoutFor } from '../ui.js';
import { sfx } from '../sound.js';

export default async function mount(root, ctx) {
  const { min, max } = await ctx.get('/api/games/limbo/info');
  let alive = true, busy = false;
  let target = 2;
  try { target = Number(localStorage.getItem('casino.limbo.target')) || 2; } catch { /* egal */ }
  const recent = [];

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <label class="field">Ziel-Multiplikator
        <input class="input target-in" type="number" min="${min}" max="${max}" step="0.01" inputmode="decimal">
      </label>
      <div class="row" style="flex-wrap:wrap">${[1.5, 2, 5, 10, 100].map((v) => `<button class="btn btn-sm" data-t="${v}">${v}×</button>`).join('')}</div>
      <div class="kv"><span>Gewinnchance</span><span class="l-chance"></span></div>
      <div class="kv"><span>Gewinn bei Treffer</span><span class="l-win gold"></span></div>
      <button class="btn btn-gold btn-big play-btn">SPIELEN</button>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">Es wird ein Zufalls-Multiplikator gezogen. Ist er mindestens so hoch wie dein Ziel, gewinnst du Einsatz × Ziel. Leertaste = Spielen.</p>
    </div>
    <div class="game-stage">
      <div class="panel limbo-stage">
        <div class="crash-recent l-recent"></div>
        <div class="limbo-num">1,00×</div>
        <div class="limbo-target"></div>
        <div class="result-msg"></div>
      </div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'limbo', initial: 100 });
  el.querySelector('.bet-slot').appendChild(bet.el);
  const tIn = el.querySelector('.target-in');
  const chanceEl = el.querySelector('.l-chance'), winEl = el.querySelector('.l-win');
  const numEl = el.querySelector('.limbo-num'), targetEl = el.querySelector('.limbo-target');
  const msg = el.querySelector('.result-msg');
  const recentEl = el.querySelector('.l-recent');
  const playBtn = el.querySelector('.play-btn');

  function setTarget(v) {
    v = Math.floor(Math.min(max, Math.max(min, Number(String(v).replace(',', '.')) || 2)) * 100) / 100;
    target = v;
    tIn.value = v;
    try { localStorage.setItem('casino.limbo.target', String(v)); } catch { /* egal */ }
    paint();
  }
  function paint() {
    chanceEl.textContent = Math.min(99, 99 / target).toLocaleString('de-DE', { maximumFractionDigits: 4 }) + ' %';
    winEl.textContent = fmt(payoutFor(bet.value, target));
    targetEl.innerHTML = `Ziel: <b>${fmtMult(target)}</b>`;
  }
  tIn.addEventListener('change', () => setTarget(tIn.value));
  el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { sfx.chip(); setTarget(b.dataset.t); }));
  bet.onChange = paint;
  setTarget(target);

  function countUp(to, won) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const dur = Math.min(900, 300 + Math.log10(Math.max(1, to)) * 220);
      numEl.className = 'limbo-num';
      const step = (t) => {
        if (!alive) return resolve();
        const k = Math.min(1, (t - t0) / dur);
        const e = 1 - (1 - k) ** 3;
        const v = Math.exp(Math.log(to) * e); // exponentiell hochzählen
        numEl.textContent = fmtMult(k < 1 ? v : to);
        if (k < 1) requestAnimationFrame(step);
        else { numEl.className = 'limbo-num ' + (won ? 'win' : 'lose'); resolve(); }
      };
      requestAnimationFrame(step);
    });
  }

  async function play() {
    if (busy) return;
    busy = true;
    playBtn.disabled = true;
    try {
      const r = await ctx.post('/api/games/limbo/play', { bet: bet.value, target });
      ctx.setBalance(r.balance - r.payout);
      sfx.spin();
      await countUp(r.result, r.won);
      if (!alive) return;
      ctx.setBalance(r.balance);
      recent.unshift(r);
      if (recent.length > 12) recent.pop();
      recentEl.innerHTML = recent.map((x) => `<span class="cr-pill ${x.won ? 'good' : 'bad'}">${fmtMult(x.result)}</span>`).join('');
      if (r.won) {
        msg.className = 'result-msg win';
        msg.textContent = `Geschafft! +${fmt(r.payout - r.bet)} Chips`;
        celebrate(r.payout, r.bet);
      } else {
        msg.className = 'result-msg lose';
        msg.textContent = `Zu niedrig – −${fmt(r.bet)} Chips`;
        sfx.lose();
      }
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      playBtn.disabled = false;
    }
  }
  playBtn.addEventListener('click', play);
  const onKey = (e) => {
    if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName)) { e.preventDefault(); play(); }
  };
  document.addEventListener('keydown', onKey);
  return () => { alive = false; document.removeEventListener('keydown', onKey); };
}
