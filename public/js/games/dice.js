// Würfel (Dice) – Frontend.
import { h, fmt, sleep, celebrate, segmented, payoutFor } from '../ui.js';
import { sfx } from '../sound.js';

const multFor = (chance) => Math.floor(99000000 / Math.round(chance * 100)) / 10000;
const fmt2 = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function mount(root, ctx) {
  const { minChance, maxChance } = await ctx.get('/api/games/dice/info');
  let alive = true;
  let busy = false;
  let chance = 49.5, mode = 'under';
  try {
    chance = Number(localStorage.getItem('casino.dice.chance')) || 49.5;
    mode = localStorage.getItem('casino.dice.mode') === 'over' ? 'over' : 'under';
  } catch { /* egal */ }
  const recent = [];

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <label class="field">Wette<div class="mode-slot"></div></label>
      <label class="field">Gewinnchance (%)
        <input class="input chance-in" type="number" min="${minChance}" max="${maxChance}" step="0.01">
      </label>
      <div class="kv"><span>Multiplikator</span><span class="d-mult gold"></span></div>
      <div class="kv"><span>Gewinn bei Treffer</span><span class="d-win"></span></div>
      <button class="btn btn-gold btn-big roll-btn">WÜRFELN</button>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">Es wird eine Zahl von 0,00 bis 99,99 gewürfelt. Je kleiner die Chance, desto höher der Gewinn. Leertaste = Würfeln.</p>
    </div>
    <div class="game-stage">
      <div class="panel dice-stage">
        <div class="dice-recent"></div>
        <div class="dice-number">–</div>
        <div class="dice-target"></div>
        <div class="dice-bar-wrap">
          <div class="dice-bar"><div class="dice-zone"></div><div class="dice-marker hidden"><span></span></div></div>
          <div class="dice-scale"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
        </div>
        <input type="range" class="dice-range" min="${minChance}" max="${maxChance}" step="0.5" aria-label="Gewinnchance">
        <div class="result-msg"></div>
      </div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'dice', initial: 100 });
  el.querySelector('.bet-slot').appendChild(bet.el);
  const modeSeg = segmented([{ value: 'under', label: 'Unter ▼' }, { value: 'over', label: 'Über ▲' }], mode, (v) => { mode = v; save(); paint(); });
  el.querySelector('.mode-slot').appendChild(modeSeg.el);
  const chanceIn = el.querySelector('.chance-in');
  const range = el.querySelector('.dice-range');
  const multEl = el.querySelector('.d-mult'), winEl = el.querySelector('.d-win');
  const zone = el.querySelector('.dice-zone');
  const marker = el.querySelector('.dice-marker');
  const numEl = el.querySelector('.dice-number');
  const targetEl = el.querySelector('.dice-target');
  const msg = el.querySelector('.result-msg');
  const recentEl = el.querySelector('.dice-recent');
  const rollBtn = el.querySelector('.roll-btn');

  function save() {
    try {
      localStorage.setItem('casino.dice.chance', String(chance));
      localStorage.setItem('casino.dice.mode', mode);
    } catch { /* egal */ }
  }

  function setChance(v, fromRange = false) {
    v = Math.round(Math.min(maxChance, Math.max(minChance, Number(v) || minChance)) * 100) / 100;
    chance = v;
    if (!fromRange) range.value = v;
    chanceIn.value = v;
    save();
    paint();
  }

  function paint() {
    const m = multFor(chance);
    multEl.textContent = m.toLocaleString('de-DE', { maximumFractionDigits: 4 }) + '×';
    winEl.textContent = fmt(payoutFor(bet.value, m));
    const target = mode === 'under' ? chance : 100 - chance;
    targetEl.innerHTML = `Gewinn wenn <b>${mode === 'under' ? 'unter' : 'mindestens'} ${fmt2(target)}</b>`;
    zone.style.left = mode === 'under' ? '0%' : `${100 - chance}%`;
    zone.style.width = `${chance}%`;
  }

  chanceIn.addEventListener('change', () => setChance(chanceIn.value));
  range.addEventListener('input', () => { setChance(range.value, true); sfx.tick(); });
  bet.onChange = () => paint();
  setChance(chance);

  async function roll() {
    if (busy) return;
    busy = true;
    rollBtn.disabled = true;
    try {
      const r = await ctx.post('/api/games/dice/roll', { bet: bet.value, chance, mode });
      ctx.setBalance(r.balance - r.payout);
      // kurzes "Durchrollen"
      numEl.className = 'dice-number rolling';
      for (let i = 0; i < 8 && alive; i++) {
        numEl.textContent = fmt2(Math.random() * 100);
        sfx.tick();
        await sleep(40);
      }
      if (!alive) return;
      numEl.textContent = fmt2(r.roll);
      numEl.className = 'dice-number ' + (r.won ? 'win' : 'lose');
      marker.classList.remove('hidden');
      marker.style.left = `${r.roll}%`;
      marker.className = 'dice-marker ' + (r.won ? 'win' : 'lose');
      marker.firstElementChild.textContent = fmt2(r.roll);
      ctx.setBalance(r.balance);
      recent.unshift(r);
      if (recent.length > 12) recent.pop();
      recentEl.innerHTML = recent.map((x) => `<span class="${x.won ? 'good' : 'bad'}">${fmt2(x.roll)}</span>`).join('');
      if (r.won) {
        msg.className = 'result-msg win';
        msg.textContent = `Treffer! +${fmt(r.payout - r.bet)} Chips`;
        celebrate(r.payout, r.bet);
      } else {
        msg.className = 'result-msg lose';
        msg.textContent = `Daneben – −${fmt(r.bet)}`;
        sfx.lose();
      }
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      rollBtn.disabled = false;
    }
  }

  rollBtn.addEventListener('click', roll);
  const onKey = (e) => {
    if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName)) { e.preventDefault(); roll(); }
  };
  document.addEventListener('keydown', onKey);
  return () => { alive = false; document.removeEventListener('keydown', onKey); };
}
