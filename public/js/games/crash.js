// Crash – Frontend. Der Server entscheidet, wann es kracht; hier wird nur animiert.
import { h, fmt, fmtMult, celebrate, payoutFor } from '../ui.js';
import { sfx } from '../sound.js';

export default async function mount(root, ctx) {
  const { k: K } = await ctx.get('/api/games/crash/info');
  const multAt = (ms) => Math.floor(100 * Math.exp(K * Math.max(0, ms))) / 100;
  const timeFor = (m) => Math.log(m) / K;

  let alive = true;
  let running = false;
  let busy = false;
  let roundId = null;
  let t0 = 0; // performance.now() beim Rundenstart
  let bet0 = 0;
  let frozen = null; // {m, t, crashed}
  let after = null; // nach Cashout: {crash, until}
  let raf = 0, pollTimer = 0;
  let lastTickM = 1;

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <label class="field">Auto-Cashout bei (optional)
        <input class="input auto-in" type="number" step="0.01" min="1.01" placeholder="z. B. 2,00" inputmode="decimal">
      </label>
      <button class="btn btn-gold btn-big main-btn">START</button>
      <div class="kv"><span>Möglicher Gewinn</span><span class="pot">–</span></div>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">Der Multiplikator steigt, bis die Rakete abstürzt. Steig vorher aus! Leertaste = Start / Auscashen.</p>
    </div>
    <div class="game-stage">
      <div class="crash-recent"></div>
      <div class="crash-box">
        <canvas class="crash-canvas"></canvas>
        <div class="crash-mult">1,00×</div>
        <div class="crash-sub"></div>
      </div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'crash', initial: 100 });
  el.querySelector('.bet-slot').appendChild(bet.el);
  const autoIn = el.querySelector('.auto-in');
  try { autoIn.value = localStorage.getItem('casino.crash.auto') || ''; } catch { /* egal */ }
  const mainBtn = el.querySelector('.main-btn');
  const potEl = el.querySelector('.pot');
  const multEl = el.querySelector('.crash-mult');
  const subEl = el.querySelector('.crash-sub');
  const recentEl = el.querySelector('.crash-recent');
  const canvas = el.querySelector('.crash-canvas');
  const g = canvas.getContext('2d');

  function paintRecent(list) {
    recentEl.innerHTML = list.map((c) => `<span class="cr-pill ${c >= 10 ? 'gold' : c >= 2 ? 'good' : 'bad'}">${fmtMult(c)}</span>`).join('');
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(tMs, m, crashed) {
    const W = canvas.clientWidth, H = canvas.clientHeight;
    g.clearRect(0, 0, W, H);
    const padL = 44, padB = 26, padT = 16, padR = 16;
    const maxT = Math.max(8000, tMs * 1.15);
    const maxM = Math.max(2, m * 1.15);
    const x = (t) => padL + (t / maxT) * (W - padL - padR);
    const y = (mm) => H - padB - ((mm - 1) / (maxM - 1)) * (H - padB - padT);

    // Gitter
    g.strokeStyle = 'rgba(255,255,255,.07)';
    g.fillStyle = 'rgba(255,255,255,.45)';
    g.font = '11px Segoe UI, system-ui, sans-serif';
    g.lineWidth = 1;
    const stepM = maxM <= 3 ? 0.5 : maxM <= 6 ? 1 : maxM <= 20 ? 5 : Math.pow(10, Math.floor(Math.log10(maxM)));
    for (let v = 1; v <= maxM; v += stepM) {
      g.beginPath(); g.moveTo(padL, y(v)); g.lineTo(W - padR, y(v)); g.stroke();
      g.fillText(v.toFixed(v < 10 ? 1 : 0) + '×', 6, y(v) + 4);
    }
    const stepT = maxT <= 12000 ? 2000 : maxT <= 40000 ? 5000 : 20000;
    for (let t = 0; t <= maxT; t += stepT) g.fillText(Math.round(t / 1000) + 's', x(t) - 6, H - 8);

    if (tMs <= 0) return;
    // Kurve
    const col = crashed ? '#e5484d' : '#2ecc71';
    g.beginPath();
    g.moveTo(x(0), y(1));
    const N = 80;
    for (let i = 1; i <= N; i++) {
      const t = (tMs * i) / N;
      g.lineTo(x(t), y(Math.min(m, Math.exp(K * t))));
    }
    const grad = g.createLinearGradient(0, padT, 0, H - padB);
    grad.addColorStop(0, crashed ? 'rgba(229,72,77,.35)' : 'rgba(46,204,113,.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.lineWidth = 4;
    g.strokeStyle = col;
    g.stroke();
    g.lineTo(x(tMs), y(1));
    g.closePath();
    g.fillStyle = grad;
    g.fill();
    // Rakete
    g.font = '28px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(crashed ? '💥' : '🚀', x(tMs), y(Math.min(m, Math.exp(K * tMs))));
    g.textAlign = 'start';
    g.textBaseline = 'alphabetic';
  }

  function setMult(m, cls = '') {
    multEl.textContent = fmtMult(m);
    multEl.className = 'crash-mult ' + cls;
  }

  function loop() {
    if (!alive) return;
    if (frozen) {
      draw(frozen.t, frozen.m, frozen.crashed);
    } else if (running || after) {
      const t = performance.now() - t0;
      let m = multAt(t);
      if (after && (t >= timeFor(after.crash) || performance.now() > after.until)) {
        // Nach dem Auscashen: zeigen, wo es gekracht hätte
        frozen = { t: Math.min(t, timeFor(after.crash)), m: after.crash, crashed: true };
        subEl.innerHTML += ` <span class="neg">· Crash bei ${fmtMult(after.crash)}</span>`;
        after = null;
        draw(frozen.t, frozen.m, true);
      } else {
        draw(t, m, false);
        if (running) {
          setMult(m, 'live');
          potEl.textContent = fmt(payoutFor(bet0, m));
          mainBtn.textContent = `AUSCASHEN  ${fmt(payoutFor(bet0, m))}`;
          if (m - lastTickM >= (m < 2 ? 0.1 : m < 5 ? 0.5 : 1)) { lastTickM = m; sfx.tick(); }
        }
      }
    } else {
      draw(0, 1, false);
    }
    raf = requestAnimationFrame(loop);
  }

  function setIdle() {
    running = false;
    mainBtn.textContent = 'START';
    mainBtn.classList.remove('btn-green');
    mainBtn.classList.add('btn-gold');
    bet.setDisabled(false);
    autoIn.disabled = false;
    potEl.textContent = '–';
  }

  let finishedId = null;
  function finishRound(last, recent) {
    clearTimeout(pollTimer);
    paintRecent(recent);
    if (last && last.id === finishedId) return;
    finishedId = last?.id ?? null;
    const t = performance.now() - t0;
    if (!last || last.id !== roundId) { setIdle(); return; }
    if (last.status === 'lost') {
      frozen = { t: timeFor(last.crash), m: last.crash, crashed: true };
      setMult(last.crash, 'crashed');
      subEl.innerHTML = `<span class="neg">Abgestürzt! −${fmt(last.bet)} Chips</span>`;
      sfx.boom();
    } else {
      frozen = null;
      after = { crash: last.crash, until: performance.now() + 2500 };
      if (t > timeFor(last.crash)) after.until = 0;
      setMult(last.at, 'won');
      subEl.innerHTML = `<span class="pos">Ausgecasht bei ${fmtMult(last.at)}: +${fmt(last.payout)} Chips</span>`;
      celebrate(last.payout, last.bet);
    }
    setIdle();
  }

  async function poll() {
    if (!alive || !running) return;
    try {
      const s = await ctx.post('/api/games/crash/state');
      if (!running) return;
      if (!s.running) {
        ctx.setBalance(s.balance);
        finishRound(s.last, s.recent);
        return;
      }
      // Uhr leicht nachjustieren
      t0 = performance.now() - s.elapsed;
    } catch { /* nächster Versuch */ }
    pollTimer = setTimeout(poll, 100);
  }

  function beginRunning(s) {
    running = true;
    roundId = s.id;
    bet0 = s.bet;
    t0 = performance.now() - s.elapsed;
    frozen = null;
    after = null;
    lastTickM = 1;
    subEl.innerHTML = s.auto ? `<span class="muted">Auto-Cashout bei ${fmtMult(s.auto)}</span>` : '';
    mainBtn.classList.remove('btn-gold');
    mainBtn.classList.add('btn-green');
    bet.setDisabled(true);
    autoIn.disabled = true;
    poll();
  }

  async function main() {
    if (busy) return;
    busy = true;
    try {
      if (!running) {
        const auto = autoIn.value.trim() ? Number(autoIn.value.replace(',', '.')) : null;
        try { localStorage.setItem('casino.crash.auto', autoIn.value.trim()); } catch { /* egal */ }
        const s = await ctx.post('/api/games/crash/start', { bet: bet.value, auto });
        ctx.setBalance(s.balance);
        sfx.spin();
        if (s.running) beginRunning(s);
        else { roundId = s.last?.id; t0 = performance.now(); finishRound(s.last, s.recent); }
      } else {
        const s = await ctx.post('/api/games/crash/cashout');
        ctx.setBalance(s.balance);
        if (!s.running) { sfx.cashout(); finishRound(s.last, s.recent); }
      }
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
    }
  }

  mainBtn.addEventListener('click', main);
  const onKey = (e) => {
    if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName)) { e.preventDefault(); main(); }
  };
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', resize);
  resize();

  const s = await ctx.post('/api/games/crash/state');
  paintRecent(s.recent);
  if (s.running) beginRunning(s);
  loop();

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    clearTimeout(pollTimer);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', resize);
  };
}
