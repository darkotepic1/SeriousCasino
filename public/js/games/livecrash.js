// Live-Crash – eine gemeinsame Runde für alle Spieler.
import { h, esc, fmt, fmtMult, celebrate, payoutFor } from '../ui.js';
import { sfx } from '../sound.js';

export default async function mount(root, ctx) {
  let alive = true, busy = false;
  let st = null;
  let t0 = 0; // performance.now() beim Start der laufenden Runde (lokal geschätzt)
  let pollTimer = 0, raf = 0;
  let lastPhase = null, lastRound = null, lastTick = 1;
  const K = 0.00006;
  const multAt = (ms) => Math.floor(100 * Math.exp(K * Math.max(0, ms))) / 100;

  const el = h(`<div class="game-layout lc-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <label class="field">Auto-Cashout bei (optional)
        <input class="input auto-in" type="number" step="0.01" min="1.01" placeholder="z. B. 2,00" inputmode="decimal">
      </label>
      <button class="btn btn-gold btn-big main-btn" disabled>…</button>
      <div class="lc-mine muted"></div>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">Alle spielen dieselbe Runde: In der Wettphase setzen, dann steigt die Rakete – steig aus, bevor sie abstürzt! Rechts siehst du live, wer dabei ist.</p>
    </div>
    <div class="game-stage">
      <div class="crash-recent lc-recent"></div>
      <div class="crash-box lc-box">
        <canvas class="crash-canvas"></canvas>
        <div class="crash-mult">1,00×</div>
        <div class="crash-sub"></div>
        <div class="lc-countdown hidden"><div class="lc-bar"></div></div>
      </div>
      <div class="panel lc-players"><h3>Spieler in dieser Runde <span class="muted lc-count"></span></h3><div class="lc-list"></div></div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'livecrash', initial: 100 });
  el.querySelector('.bet-slot').appendChild(bet.el);
  const autoIn = el.querySelector('.auto-in');
  try { autoIn.value = localStorage.getItem('casino.livecrash.auto') || ''; } catch { /* egal */ }
  const mainBtn = el.querySelector('.main-btn');
  const mineEl = el.querySelector('.lc-mine');
  const multEl = el.querySelector('.crash-mult');
  const subEl = el.querySelector('.crash-sub');
  const recentEl = el.querySelector('.lc-recent');
  const listEl = el.querySelector('.lc-list');
  const countEl = el.querySelector('.lc-count');
  const cd = el.querySelector('.lc-countdown');
  const bar = el.querySelector('.lc-bar');
  const canvas = el.querySelector('.crash-canvas');
  const g = canvas.getContext('2d');

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
    const maxT = Math.max(8000, tMs * 1.15), maxM = Math.max(2, m * 1.15);
    const x = (t) => padL + (t / maxT) * (W - padL - padR);
    const y = (mm) => H - padB - ((mm - 1) / (maxM - 1)) * (H - padB - padT);
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.fillStyle = 'rgba(255,255,255,.45)'; g.font = '11px Segoe UI, system-ui, sans-serif';
    const stepM = maxM <= 3 ? 0.5 : maxM <= 6 ? 1 : maxM <= 20 ? 5 : Math.pow(10, Math.floor(Math.log10(maxM)));
    for (let v = 1; v <= maxM; v += stepM) { g.beginPath(); g.moveTo(padL, y(v)); g.lineTo(W - padR, y(v)); g.stroke(); g.fillText(v.toFixed(v < 10 ? 1 : 0) + '×', 6, y(v) + 4); }
    if (tMs <= 0) return;
    const col = crashed ? '#e5484d' : '#2ecc71';
    g.beginPath(); g.moveTo(x(0), y(1));
    for (let i = 1; i <= 80; i++) { const t = (tMs * i) / 80; g.lineTo(x(t), y(Math.min(m, Math.exp(K * t)))); }
    g.lineWidth = 4; g.strokeStyle = col; g.stroke();
    g.lineTo(x(tMs), y(1)); g.closePath();
    const grad = g.createLinearGradient(0, padT, 0, H - padB);
    grad.addColorStop(0, crashed ? 'rgba(229,72,77,.35)' : 'rgba(46,204,113,.35)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fill();
    // Ausgecashte Spieler als Markierung auf der Kurve
    if (st?.bets) {
      g.font = '700 11px Segoe UI, system-ui, sans-serif'; g.textAlign = 'center';
      for (const b of st.bets) if (b.cashedAt && b.cashedAt <= m) {
        const t = Math.log(b.cashedAt) / K;
        g.fillStyle = b.me ? '#f6d77a' : '#fff';
        g.beginPath(); g.arc(x(t), y(b.cashedAt), 4, 0, Math.PI * 2); g.fill();
        g.fillText(b.name, x(t), y(b.cashedAt) - 9);
      }
      g.textAlign = 'start';
    }
    g.font = '28px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(crashed ? '💥' : '🚀', x(tMs), y(Math.min(m, Math.exp(K * tMs))));
    g.textAlign = 'start'; g.textBaseline = 'alphabetic';
  }

  function paintPlayers() {
    const bets = st?.bets || [];
    countEl.textContent = bets.length ? `(${bets.length})` : '';
    listEl.innerHTML = bets.length ? bets.map((b) => {
      const state = b.cashedAt ? `<span class="pos">${fmtMult(b.cashedAt)} · +${fmt(b.payout - b.bet)}</span>`
        : st.phase === 'crashed' ? '<span class="neg">abgestürzt</span>' : st.phase === 'running' ? '<span class="muted">fliegt …</span>' : '<span class="muted">bereit</span>';
      return `<div class="lc-row ${b.me ? 'me' : ''} ${b.cashedAt ? 'out' : ''}"><span class="lc-name">${esc(b.name)}</span><span class="lc-bet"><span class="chip-icon"></span>${fmt(b.bet)}</span>${state}</div>`;
    }).join('') : '<p class="muted" style="margin:0">Noch niemand dabei – setz als Erste(r)!</p>';
  }

  function paintControls() {
    if (!st) return;
    const mine = st.mine;
    bet.setDisabled(st.phase !== 'betting' || !!mine || busy);
    autoIn.disabled = st.phase !== 'betting' || !!mine;
    mainBtn.classList.remove('btn-green', 'btn-gold', 'btn-red');
    if (st.phase === 'betting' && !mine) { mainBtn.textContent = 'SETZEN'; mainBtn.disabled = busy; mainBtn.classList.add('btn-gold'); }
    else if (st.phase === 'running' && mine && !mine.cashedAt) {
      mainBtn.textContent = `AUSCASHEN  ${fmt(payoutFor(mine.bet, currentMult()))}`; mainBtn.disabled = busy; mainBtn.classList.add('btn-green');
    } else {
      mainBtn.disabled = true; mainBtn.classList.add('btn-gold');
      mainBtn.textContent = st.phase === 'betting' ? 'GESETZT – warte auf Start' : st.phase === 'running' ? (mine?.cashedAt ? 'AUSGECASHT ✓' : 'Runde läuft – nächste Runde abwarten') : 'Nächste Runde gleich …';
    }
    mineEl.innerHTML = mine ? `Dein Einsatz: <b>${fmt(mine.bet)}</b>${mine.auto ? ` · Auto ${fmtMult(mine.auto)}` : ''}${mine.cashedAt ? ` · <span class="pos">+${fmt(mine.payout - mine.bet)}</span>` : ''}` : '';
  }

  const currentMult = () => (st?.phase === 'running' ? Math.min(multAt(performance.now() - t0), 1e6) : 1);

  function onState(s) {
    const newRound = s.id !== lastRound;
    const phaseChanged = s.phase !== lastPhase || newRound;
    st = s;
    if (s.phase === 'running') t0 = performance.now() - s.elapsed;
    if (s.balance !== null && s.balance !== undefined) ctx.setBalance(s.balance);
    if (phaseChanged) {
      if (s.phase === 'betting') { subEl.innerHTML = '<span class="muted">Wettphase – jetzt setzen!</span>'; lastTick = 1; }
      if (s.phase === 'running') { subEl.innerHTML = ''; sfx.spin(); }
      if (s.phase === 'crashed') {
        sfx.boom();
        const mine = s.mine;
        if (mine && !mine.cashedAt) subEl.innerHTML = `<span class="neg">Abgestürzt! −${fmt(mine.bet)}</span>`;
        else if (mine?.cashedAt) subEl.innerHTML = `<span class="pos">Du bist bei ${fmtMult(mine.cashedAt)} ausgestiegen: +${fmt(mine.payout - mine.bet)}</span>`;
        else subEl.innerHTML = '';
      }
    }
    lastPhase = s.phase;
    lastRound = s.id;
    recentEl.innerHTML = s.history.map((c) => `<span class="cr-pill ${c >= 10 ? 'gold' : c >= 2 ? 'good' : 'bad'}">${fmtMult(c)}</span>`).join('');
    paintPlayers();
    paintControls();
  }

  function loop() {
    if (!alive) return;
    if (st) {
      if (st.phase === 'running') {
        const t = performance.now() - t0;
        const m = multAt(t);
        draw(t, m, false);
        multEl.textContent = fmtMult(m);
        multEl.className = 'crash-mult live';
        if (m - lastTick >= (m < 2 ? 0.1 : m < 5 ? 0.5 : 1)) { lastTick = m; sfx.tick(); }
        if (st.mine && !st.mine.cashedAt) mainBtn.textContent = `AUSCASHEN  ${fmt(payoutFor(st.mine.bet, m))}`;
        cd.classList.add('hidden');
      } else if (st.phase === 'crashed') {
        const t = Math.log(st.crashPoint) / K;
        draw(t, st.crashPoint, true);
        multEl.textContent = fmtMult(st.crashPoint);
        multEl.className = 'crash-mult crashed';
        cd.classList.add('hidden');
      } else {
        draw(0, 1, false);
        const left = Math.max(0, st.timeLeft - (performance.now() - st._recv));
        multEl.textContent = `${(left / 1000).toFixed(1)} s`;
        multEl.className = 'crash-mult waiting';
        cd.classList.remove('hidden');
        bar.style.width = `${Math.min(100, (left / 8000) * 100)}%`;
      }
    }
    raf = requestAnimationFrame(loop);
  }

  async function poll() {
    if (!alive) return;
    try {
      const s = await ctx.get('/api/live/crash/state');
      s._recv = performance.now();
      onState(s);
    } catch { /* nächster Versuch */ }
    pollTimer = setTimeout(poll, 220);
  }

  async function main() {
    if (busy || !st) return;
    busy = true;
    paintControls();
    try {
      if (st.phase === 'betting' && !st.mine) {
        const auto = autoIn.value.trim() ? Number(autoIn.value.replace(',', '.')) : null;
        try { localStorage.setItem('casino.livecrash.auto', autoIn.value.trim()); } catch { /* egal */ }
        const s = await ctx.post('/api/live/crash/bet', { bet: bet.value, auto });
        s._recv = performance.now();
        sfx.chip();
        onState(s);
      } else if (st.phase === 'running' && st.mine && !st.mine.cashedAt) {
        const s = await ctx.post('/api/live/crash/cashout');
        s._recv = performance.now();
        sfx.cashout();
        celebrate(s.mine.payout, s.mine.bet);
        onState(s);
      }
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      paintControls();
    }
  }
  mainBtn.addEventListener('click', main);
  const onKey = (e) => { if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName)) { e.preventDefault(); main(); } };
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', resize);
  resize();
  await poll();
  loop();
  return () => { alive = false; clearTimeout(pollTimer); cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', resize); };
}
