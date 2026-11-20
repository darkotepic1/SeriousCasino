// Plinko – Frontend. Der Server bestimmt den Weg der Kugel, hier wird er animiert.
import { h, fmt, celebrate, segmented } from '../ui.js';
import { sfx } from '../sound.js';

const STEP_MS = 115;

function slotColor(m) {
  if (m >= 100) return '#ff3b5c';
  if (m >= 10) return '#ff6b3d';
  if (m >= 3) return '#ffa23d';
  if (m >= 1.5) return '#f6c945';
  if (m >= 1) return '#c9d84a';
  return '#7bbf5a';
}

export default async function mount(root, ctx) {
  const { tables } = await ctx.get('/api/games/plinko/info');
  let alive = true;
  let rows = 16, risk = 'medium';
  try {
    rows = Number(localStorage.getItem('casino.plinko.rows')) || 16;
    risk = localStorage.getItem('casino.plinko.risk') || 'medium';
  } catch { /* egal */ }
  if (!tables[rows]) rows = 16;
  if (!tables[rows][risk]) risk = 'medium';

  const balls = []; // {path, slot, t0, payout, bet, mult, done}
  let serverBalance = ctx.getBalance();
  let pending = 0; // Gewinne von Kugeln, die noch fallen
  let raf = 0;
  const flashes = {}; // slot -> Zeitstempel
  const recent = [];

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <label class="field">Risiko<div class="risk-slot"></div></label>
      <label class="field">Reihen<div class="rows-slot"></div></label>
      <button class="btn btn-gold btn-big drop-btn">KUGEL FALLEN LASSEN</button>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">Du kannst mehrere Kugeln gleichzeitig fallen lassen. Leertaste = Kugel.</p>
    </div>
    <div class="game-stage">
      <div class="plinko-box">
        <canvas class="plinko-canvas"></canvas>
        <div class="plinko-recent"></div>
      </div>
      <div class="result-msg"></div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'plinko', initial: 10 });
  el.querySelector('.bet-slot').appendChild(bet.el);
  const riskSeg = segmented([{ value: 'low', label: 'Niedrig' }, { value: 'medium', label: 'Mittel' }, { value: 'high', label: 'Hoch' }], risk, (v) => {
    risk = v;
    try { localStorage.setItem('casino.plinko.risk', v); } catch { /* egal */ }
  });
  const rowsSeg = segmented([{ value: 8, label: '8' }, { value: 12, label: '12' }, { value: 16, label: '16' }], rows, (v) => {
    rows = v;
    try { localStorage.setItem('casino.plinko.rows', String(v)); } catch { /* egal */ }
  });
  el.querySelector('.risk-slot').appendChild(riskSeg.el);
  el.querySelector('.rows-slot').appendChild(rowsSeg.el);
  const dropBtn = el.querySelector('.drop-btn');
  const msg = el.querySelector('.result-msg');
  const recentEl = el.querySelector('.plinko-recent');
  const canvas = el.querySelector('.plinko-canvas');
  const g = canvas.getContext('2d');

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function geom() {
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const slotH = Math.max(26, H * 0.07);
    const s = Math.min((W - 20) / (rows + 2), (H - slotH - 40) / (rows + 0.5));
    const top = 22;
    return { W, H, s, top, cx: W / 2, slotY: top + rows * s + s * 0.2, slotH };
  }

  // Position der Kugel nach k Entscheidungen (zwischen den Stiftreihen)
  function ballPos(path, k, G) {
    let sum = 0;
    for (let i = 0; i < k; i++) sum += path[i];
    return { x: G.cx + (sum - k / 2) * G.s, y: G.top + k * G.s - G.s * 0.5 };
  }

  function draw(now) {
    const G = geom();
    g.clearRect(0, 0, G.W, G.H);
    // Stifte
    g.fillStyle = 'rgba(255,255,255,.85)';
    const pr = Math.max(2, G.s * 0.09);
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < i + 3; j++) {
        g.beginPath();
        g.arc(G.cx + (j - (i + 2) / 2) * G.s, G.top + i * G.s, pr, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Fächer mit Multiplikatoren
    const mults = tables[rows][risk];
    const w = G.s * 0.92;
    g.font = `800 ${Math.max(8, Math.min(13, G.s * 0.32))}px Segoe UI, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    mults.forEach((m, i) => {
      const x = G.cx + (i - rows / 2) * G.s;
      const fl = flashes[i] && now - flashes[i] < 400 ? 1 - (now - flashes[i]) / 400 : 0;
      const y = G.slotY + fl * 6;
      g.fillStyle = slotColor(m);
      g.beginPath();
      g.roundRect(x - w / 2, y, w, G.slotH, 5);
      g.fill();
      if (fl) { g.fillStyle = `rgba(255,255,255,${fl * 0.6})`; g.fill(); }
      g.fillStyle = '#1a1206';
      g.fillText(m >= 100 ? String(m) : m + '×', x, y + G.slotH / 2 + 1);
    });
    // Kugeln
    for (const b of balls) {
      const t = (now - b.t0) / STEP_MS;
      const k = Math.min(Math.floor(t), b.path.length);
      let x, y;
      if (k >= b.path.length) {
        const p = ballPos(b.path, b.path.length, G);
        x = p.x; y = Math.min(p.y + (t - b.path.length) * G.s, G.slotY + G.slotH / 2);
      } else {
        const a = ballPos(b.path, k, G), c = ballPos(b.path, k + 1, G);
        const f = t - k;
        x = a.x + (c.x - a.x) * f;
        y = a.y + (c.y - a.y) * f - Math.sin(f * Math.PI) * G.s * 0.35;
        if (k !== b.lastK) { b.lastK = k; if (k > 0) sfx.peg(); }
      }
      g.fillStyle = '#ff4fa3';
      g.shadowColor = '#ff4fa3';
      g.shadowBlur = 10;
      g.beginPath();
      g.arc(x, y, Math.max(4, G.s * 0.22), 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      if (!b.done && t >= b.path.length + 0.5) land(b, now);
    }
    for (let i = balls.length - 1; i >= 0; i--) if (balls[i].done) balls.splice(i, 1);
    g.textAlign = 'start';
    g.textBaseline = 'alphabetic';
  }

  function land(b, now) {
    b.done = true;
    flashes[b.slot] = now;
    pending -= b.payout;
    ctx.setBalance(serverBalance - pending);
    recent.unshift(b.mult);
    if (recent.length > 10) recent.pop();
    recentEl.innerHTML = recent.map((m) => `<span style="background:${slotColor(m)}">${m}×</span>`).join('');
    if (b.payout > b.bet) {
      msg.className = 'result-msg win';
      msg.textContent = `${b.mult}× – ${fmt(b.payout)} Chips (+${fmt(b.payout - b.bet)})`;
      celebrate(b.payout, b.bet);
    } else {
      msg.className = 'result-msg';
      msg.textContent = `${b.mult}× – ${fmt(b.payout)} zurück`;
      sfx.coin();
    }
    if (!balls.some((x) => !x.done)) { riskSeg.setDisabled(false); rowsSeg.setDisabled(false); }
  }

  function loop(now) {
    if (!alive) return;
    draw(now);
    raf = requestAnimationFrame(loop);
  }

  let inFlightReq = 0;
  async function drop() {
    if (inFlightReq >= 3) return;
    if (bet.value > ctx.getBalance()) return ctx.toast('Nicht genug Chips.', 'err');
    inFlightReq++;
    riskSeg.setDisabled(true);
    rowsSeg.setDisabled(true);
    try {
      const r = await ctx.post('/api/games/plinko/drop', { bet: bet.value, rows, risk });
      if (!alive) return;
      serverBalance = r.balance;
      pending += r.payout;
      ctx.setBalance(serverBalance - pending);
      balls.push({ path: r.path, slot: r.slot, payout: r.payout, bet: r.bet, mult: r.multiplier, t0: performance.now(), done: false, lastK: -1 });
      sfx.click();
    } catch (e) {
      ctx.toast(e.message, 'err');
      if (!balls.some((x) => !x.done)) { riskSeg.setDisabled(false); rowsSeg.setDisabled(false); }
    } finally {
      inFlightReq--;
    }
  }

  dropBtn.addEventListener('click', drop);
  const onKey = (e) => {
    if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName)) { e.preventDefault(); drop(); }
  };
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', resize);
  resize();
  raf = requestAnimationFrame(loop);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', resize);
    if (pending) ctx.setBalance(serverBalance); // Gewinne der noch fallenden Kugeln sofort anzeigen
  };
}
