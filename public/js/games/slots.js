// Slots – Frontend. Ergebnis kommt immer vom Server.
import { h, esc, fmt, sleep, celebrate } from '../ui.js';
import { sfx } from '../sound.js';

const LINE_COLORS = ['#f6d77a', '#2ecc71', '#4dabf7', '#ff6b6b', '#c084fc', '#ffa94d', '#63e6be', '#f783ac', '#a9e34b', '#74c0fc'];

export default async function mount(root, ctx) {
  const info = await ctx.get('/api/games/slots/info');
  const S = info.symbols;
  const randSym = () => Math.floor(Math.random() * S.length);
  let grid = Array.from({ length: 5 }, () => [randSym(), randSym(), randSym()]);
  let spinning = false;
  let auto = false;
  let alive = true;

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <div class="kv"><span>Gewinnlinien</span><span>10</span></div>
      <div class="kv"><span>Einsatz pro Linie</span><span class="per-line">–</span></div>
      <button class="btn btn-gold btn-big spin-btn">DREHEN</button>
      <button class="btn auto-btn">Auto-Spin: AUS</button>
      <p class="muted" style="margin:0;font-size:.8rem">Tipp: Leertaste dreht auch.</p>
    </div>
    <div class="game-stage">
      <div class="slot-machine">
        <div class="slot-reels">
          ${[0, 1, 2, 3, 4].map((i) => `<div class="reel" data-reel="${i}"><div class="reel-strip"></div></div>`).join('')}
          <svg class="slot-lines-svg"></svg>
        </div>
      </div>
      <div class="slot-win-banner"></div>
      <div class="win-lines"></div>
      <div class="panel section">
        <h2>Gewinntabelle <span class="muted" style="font-size:.8rem;font-weight:500">(× Einsatz pro Linie, von links)</span></h2>
        <div class="paytable">${S.slice().reverse().map((s) => `
          <div class="pay-item"><span class="pi-sym">${s.icon}</span>
            <span class="pi-vals">5× <b>${fmt(s.pays[2])}</b><br>4× <b>${fmt(s.pays[1])}</b><br>3× <b>${fmt(s.pays[0])}</b></span></div>`).join('')}
        </div>
        <h2 style="margin-top:18px">Gewinnlinien</h2>
        <div class="lines-grid">${info.lines.map((line, li) => `
          <div class="line-mini"><span>${li + 1}</span>${[0, 1, 2].map((row) => [0, 1, 2, 3, 4].map((reel) => `<i class="${line[reel] === row ? 'on' : ''}"></i>`).join('')).join('')}</div>`).join('')}
        </div>
      </div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'slots', min: info.minBet, initial: 100 });
  el.querySelector('.bet-slot').appendChild(bet.el);
  const perLine = el.querySelector('.per-line');
  bet.onChange = (v) => (perLine.textContent = (v / 10).toLocaleString('de-DE', { maximumFractionDigits: 1 }));
  bet.onChange(bet.value);

  const reels = [...el.querySelectorAll('.reel')];
  const svg = el.querySelector('.slot-lines-svg');
  const bannerEl = el.querySelector('.slot-win-banner');
  const linesEl = el.querySelector('.win-lines');
  const spinBtn = el.querySelector('.spin-btn');
  const autoBtn = el.querySelector('.auto-btn');

  const symHtml = (i) => `<div class="sym">${S[i].icon}</div>`;
  function paintStatic() {
    reels.forEach((r, i) => {
      const strip = r.firstElementChild;
      strip.style.transition = 'none';
      strip.style.transform = 'translateY(0)';
      strip.classList.remove('blur');
      strip.innerHTML = grid[i].map(symHtml).join('');
    });
  }
  paintStatic();

  function clearWins() {
    svg.innerHTML = '';
    el.querySelectorAll('.sym.win').forEach((s) => s.classList.remove('win'));
    linesEl.textContent = '';
  }

  function showWins(wins) {
    const r0 = reels[0].getBoundingClientRect();
    const cell = r0.width;
    const gap = reels[1].getBoundingClientRect().left - r0.right;
    const W = 5 * cell + 4 * gap, H = 3 * cell;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.width = W + 'px';
    svg.style.height = H + 'px';
    svg.innerHTML = wins.map((w) => {
      const line = info.lines[w.line];
      const pts = line.map((row, reel) => `${reel * (cell + gap) + cell / 2},${row * cell + cell / 2}`).join(' ');
      return `<polyline points="${pts}" stroke="${LINE_COLORS[w.line]}"/>`;
    }).join('');
    wins.forEach((w) => w.cells.forEach(([reel, row]) => reels[reel].firstElementChild.children[row]?.classList.add('win')));
    linesEl.innerHTML = wins.map((w) => `<span style="color:${LINE_COLORS[w.line]}">Linie ${w.line + 1}: ${w.count}× ${S[w.symbol].icon} = ${fmt(w.amount)}</span>`).join(' &nbsp;·&nbsp; ');
  }

  async function animateTo(newGrid) {
    const cell = reels[0].clientHeight / 3;
    const stops = reels.map((r, i) => new Promise((resolve) => {
      const strip = r.firstElementChild;
      const fillers = 14 + i * 5;
      const syms = [...newGrid[i], ...Array.from({ length: fillers }, randSym), ...grid[i]];
      strip.innerHTML = syms.map(symHtml).join('');
      strip.style.transition = 'none';
      strip.style.transform = `translateY(${-(fillers + 3) * cell}px)`;
      strip.classList.add('blur');
      void strip.offsetHeight;
      const dur = 0.9 + i * 0.28;
      strip.style.transition = `transform ${dur}s cubic-bezier(.12,.62,.22,1)`;
      strip.style.transform = 'translateY(0)';
      setTimeout(() => strip.classList.remove('blur'), dur * 1000 - 220);
      setTimeout(() => { sfx.reelStop(); resolve(); }, dur * 1000);
    }));
    await Promise.all(stops);
    grid = newGrid;
    paintStatic();
  }

  async function spin() {
    if (spinning) return;
    const amount = bet.value;
    if (amount > ctx.getBalance()) { ctx.toast('Nicht genug Chips.', 'err'); stopAuto(); return; }
    spinning = true;
    spinBtn.disabled = true;
    bet.setDisabled(true);
    clearWins();
    bannerEl.className = 'slot-win-banner';
    bannerEl.textContent = '';
    sfx.spin();
    try {
      const res = await ctx.post('/api/games/slots/spin', { bet: amount });
      ctx.setBalance(res.balance - res.payout);
      await animateTo(res.grid);
      if (!alive) return;
      ctx.setBalance(res.balance);
      if (res.payout > 0) {
        bannerEl.className = 'slot-win-banner win';
        bannerEl.textContent = `GEWINN: ${fmt(res.payout)} Chips!`;
        showWins(res.wins);
        celebrate(res.payout, res.bet);
      } else {
        bannerEl.innerHTML = '<span class="muted">Kein Gewinn – nochmal?</span>';
      }
    } catch (e) {
      ctx.toast(e.message, 'err');
      stopAuto();
    } finally {
      spinning = false;
      spinBtn.disabled = false;
      bet.setDisabled(auto);
    }
    if (auto && alive) {
      await sleep(900);
      if (auto && alive) spin();
    }
  }

  function stopAuto() {
    auto = false;
    autoBtn.textContent = 'Auto-Spin: AUS';
    autoBtn.classList.remove('btn-green');
    bet.setDisabled(spinning);
  }

  spinBtn.addEventListener('click', spin);
  autoBtn.addEventListener('click', () => {
    if (auto) return stopAuto();
    auto = true;
    autoBtn.textContent = 'Auto-Spin: AN (stoppen)';
    autoBtn.classList.add('btn-green');
    bet.setDisabled(true);
    spin();
  });
  const onKey = (e) => {
    if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName)) {
      e.preventDefault();
      spin();
    }
  };
  document.addEventListener('keydown', onKey);

  return () => {
    alive = false;
    auto = false;
    document.removeEventListener('keydown', onKey);
  };
}
