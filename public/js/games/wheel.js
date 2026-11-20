// Glücksrad – Frontend.
import { h, fmt, sleep, celebrate, segmented } from '../ui.js';
import { sfx } from '../sound.js';

const COLORS = { 0: '#2b3a33', 1.2: '#2ecc71', 1.5: '#1abc9c', 2: '#3b82f6', 3: '#a855f7', 4.7: '#f97316', 29.7: '#e3b341' };
const color = (m) => COLORS[m] || '#e3b341';
const SPIN_MS = 4200;

function wheelSvg(slots) {
  const n = slots.length, seg = 360 / n, cx = 150, cy = 150, ro = 140, ri = 52;
  const pt = (r, deg) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  };
  const parts = slots.map((m, i) => {
    const a0 = (i - 0.5) * seg, a1 = (i + 0.5) * seg;
    return `<path d="M ${pt(ri, a0)} L ${pt(ro, a0)} A ${ro} ${ro} 0 0 1 ${pt(ro, a1)} L ${pt(ri, a1)} A ${ri} ${ri} 0 0 0 ${pt(ri, a0)} Z" fill="${color(m)}" stroke="#0b1410" stroke-width="1.2"/>
      <text x="150" y="${cy - 118}" transform="rotate(${i * seg} 150 150)" text-anchor="middle" dominant-baseline="middle" fill="${m === 0 ? '#8aa395' : '#0b1410'}" font-size="9" font-weight="800">${m === 0 ? '0' : m}</text>`;
  }).join('');
  return `<svg viewBox="0 0 300 300" class="wheel-svg"><circle cx="150" cy="150" r="148" fill="#3a2a05" stroke="#e3b341" stroke-width="3"/>${parts}
    <circle cx="150" cy="150" r="${ri}" fill="#0b1410" stroke="#e3b341" stroke-width="2"/></svg>`;
}

export default async function mount(root, ctx) {
  const { wheels } = await ctx.get('/api/games/wheel/info');
  let alive = true, busy = false, rot = 0;
  let risk = 'medium';
  try { risk = localStorage.getItem('casino.wheel.risk') || 'medium'; } catch { /* egal */ }
  if (!wheels[risk]) risk = 'medium';

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <label class="field">Risiko<div class="risk-slot"></div></label>
      <button class="btn btn-gold btn-big spin-btn">DREHEN</button>
      <div class="wheel-legend"></div>
    </div>
    <div class="game-stage">
      <div class="gw-wrap">
        <div class="wheel-wrap gw">
          <div class="wheel-pointer"></div>
          <div class="wheel-rot"></div>
          <div class="gw-center">?</div>
        </div>
      </div>
      <div class="result-msg"></div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'wheel', initial: 100 });
  el.querySelector('.bet-slot').appendChild(bet.el);
  const rotEl = el.querySelector('.wheel-rot');
  const center = el.querySelector('.gw-center');
  const legend = el.querySelector('.wheel-legend');
  const msg = el.querySelector('.result-msg');
  const spinBtn = el.querySelector('.spin-btn');

  function paintWheel() {
    rotEl.innerHTML = wheelSvg(wheels[risk]);
    const counts = {};
    wheels[risk].forEach((m) => (counts[m] = (counts[m] || 0) + 1));
    legend.innerHTML = Object.entries(counts).sort((a, b) => b[0] - a[0]).map(([m, c]) =>
      `<div class="kv"><span><i class="lg-dot" style="background:${color(Number(m))}"></i>${Number(m).toLocaleString('de-DE')}×</span><span>${c} von ${wheels[risk].length} Feldern</span></div>`).join('');
  }
  const riskSeg = segmented([{ value: 'low', label: 'Niedrig' }, { value: 'medium', label: 'Mittel' }, { value: 'high', label: 'Hoch' }], risk, (v) => {
    risk = v;
    try { localStorage.setItem('casino.wheel.risk', v); } catch { /* egal */ }
    paintWheel();
  });
  el.querySelector('.risk-slot').appendChild(riskSeg.el);
  paintWheel();

  async function spin() {
    if (busy) return;
    busy = true;
    spinBtn.disabled = true;
    riskSeg.setDisabled(true);
    bet.setDisabled(true);
    msg.className = 'result-msg';
    msg.textContent = '';
    center.textContent = '…';
    try {
      const r = await ctx.post('/api/games/wheel/spin', { bet: bet.value, risk });
      ctx.setBalance(r.balance - r.payout);
      const seg = 360 / wheels[risk].length;
      const norm = (x) => ((x % 360) + 360) % 360;
      const jitter = (Math.random() - 0.5) * seg * 0.7;
      rot += 360 * 5 + norm(-r.index * seg + jitter - rot);
      rotEl.style.transition = `transform ${SPIN_MS}ms cubic-bezier(.15,.6,.12,1)`;
      rotEl.style.transform = `rotate(${rot}deg)`;
      let t = 0, gap = 35;
      while (t < SPIN_MS - 300 && alive) { await sleep(gap); t += gap; gap *= 1.07; sfx.tick(); }
      await sleep(Math.max(0, SPIN_MS - t));
      if (!alive) return;
      ctx.setBalance(r.balance);
      center.textContent = `${r.multiplier.toLocaleString('de-DE')}×`;
      center.style.color = r.multiplier ? color(r.multiplier) : 'var(--red)';
      if (r.payout > 0) {
        msg.className = 'result-msg ' + (r.payout > r.bet ? 'win' : 'push');
        msg.textContent = `${r.multiplier.toLocaleString('de-DE')}× – ${fmt(r.payout)} Chips`;
        celebrate(r.payout, r.bet);
      } else {
        msg.className = 'result-msg lose';
        msg.textContent = `0× – −${fmt(r.bet)} Chips`;
        sfx.lose();
      }
    } catch (e) {
      ctx.toast(e.message, 'err');
      center.textContent = '?';
    } finally {
      busy = false;
      spinBtn.disabled = false;
      riskSeg.setDisabled(false);
      bet.setDisabled(false);
    }
  }
  spinBtn.addEventListener('click', spin);
  const onKey = (e) => {
    if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName)) { e.preventDefault(); spin(); }
  };
  document.addEventListener('keydown', onKey);
  return () => { alive = false; document.removeEventListener('keydown', onKey); };
}
