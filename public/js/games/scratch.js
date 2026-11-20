// Rubbellos – Frontend mit echtem Freirubbeln (Maus oder Finger).
import { h, fmt, celebrate } from '../ui.js';
import { sfx } from '../sound.js';

export default async function mount(root, ctx) {
  const { symbols } = await ctx.get('/api/games/scratch/info');
  let ticket = null; // aktuelles Los
  let revealed = new Set();
  let busy = false;

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <button class="btn btn-gold btn-big buy-btn">LOS KAUFEN</button>
      <button class="btn reveal-btn" disabled>Alles aufrubbeln</button>
      <h3 style="margin:6px 0 0;font-size:1rem">Gewinne bei 3 gleichen</h3>
      <div class="sc-prizes">${symbols.map((s) => `<div class="kv"><span class="sc-sym">${s.icon} ${s.icon} ${s.icon}</span><span class="gold">${s.pay}× Einsatz</span></div>`).join('')}</div>
    </div>
    <div class="game-stage">
      <div class="sc-ticket">
        <div class="sc-head">✨ GLÜCKS-LOS ✨<small>Rubble alle 9 Felder frei</small></div>
        <div class="sc-grid">${Array.from({ length: 9 }, (_, i) => `<div class="sc-cell" data-i="${i}"><span class="sc-icon"></span><canvas></canvas></div>`).join('')}</div>
      </div>
      <div class="result-msg"></div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'scratch', initial: 100, label: 'Lospreis' });
  el.querySelector('.bet-slot').appendChild(bet.el);
  const buyBtn = el.querySelector('.buy-btn');
  const revealBtn = el.querySelector('.reveal-btn');
  const msg = el.querySelector('.result-msg');
  const cells = [...el.querySelectorAll('.sc-cell')];

  function cover(cell) {
    const cv = cell.querySelector('canvas');
    const r = cell.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = 'source-over';
    const grad = g.createLinearGradient(0, 0, r.width, r.height);
    grad.addColorStop(0, '#c9ced3'); grad.addColorStop(0.5, '#eef0f2'); grad.addColorStop(1, '#a9b0b6');
    g.fillStyle = grad;
    g.fillRect(0, 0, r.width, r.height);
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.font = `800 ${r.width * 0.32}px Segoe UI, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('?', r.width / 2, r.height / 2);
    cv.style.opacity = 1;
    cv.style.pointerEvents = '';
  }

  function revealCell(i) {
    if (!ticket || revealed.has(i)) return;
    revealed.add(i);
    const cv = cells[i].querySelector('canvas');
    cv.style.opacity = 0;
    cv.style.pointerEvents = 'none';
    if (revealed.size === 9) finish();
  }

  function clearedRatio(cv) {
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let clear = 0, total = 0;
    for (let i = 3; i < d.length; i += 64) { total++; if (d[i] === 0) clear++; }
    return clear / total;
  }

  cells.forEach((cell, i) => {
    const cv = cell.querySelector('canvas');
    let down = false, moves = 0;
    const scratchAt = (e) => {
      if (!ticket || revealed.has(i)) return;
      const r = cv.getBoundingClientRect();
      const g = cv.getContext('2d');
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = '#000'; // volle Deckkraft, damit die Schicht wirklich verschwindet
      g.beginPath();
      g.arc(e.clientX - r.left, e.clientY - r.top, Math.max(10, r.width * 0.13), 0, Math.PI * 2);
      g.fill();
      if (++moves % 6 === 0) { sfx.tick(); if (clearedRatio(cv) > 0.45) revealCell(i); }
    };
    cv.addEventListener('pointerdown', (e) => {
      down = true;
      try { cv.setPointerCapture(e.pointerId); } catch { /* egal */ }
      scratchAt(e);
    });
    cv.addEventListener('pointermove', (e) => { if (down) scratchAt(e); });
    cv.addEventListener('pointerup', () => { down = false; });
    cv.addEventListener('pointercancel', () => { down = false; });
    cv.addEventListener('dblclick', () => revealCell(i));
  });

  function finish() {
    const t = ticket;
    ticket = null;
    revealBtn.disabled = true;
    ctx.setBalance(t.balance);
    if (t.win >= 0) {
      t.grid.forEach((s, i) => s === t.win && cells[i].classList.add('win'));
      msg.className = 'result-msg win';
      msg.textContent = `3× ${symbols[t.win].icon} – ${t.multiplier}× = ${fmt(t.payout)} Chips!`;
      celebrate(t.payout, t.bet);
    } else {
      msg.className = 'result-msg lose';
      msg.textContent = 'Leider eine Niete.';
      sfx.lose();
    }
  }

  async function buy() {
    if (busy) return;
    if (ticket) { for (let i = 0; i < 9; i++) revealCell(i); }
    busy = true;
    buyBtn.disabled = true;
    try {
      const r = await ctx.post('/api/games/scratch/buy', { bet: bet.value });
      ctx.setBalance(r.balance - r.payout);
      ticket = r;
      revealed = new Set();
      msg.className = 'result-msg';
      msg.textContent = 'Jetzt rubbeln! (Maus gedrückt halten oder mit dem Finger wischen)';
      cells.forEach((c, i) => {
        c.classList.remove('win');
        c.querySelector('.sc-icon').textContent = symbols[r.grid[i]].icon;
        cover(c);
      });
      revealBtn.disabled = false;
      sfx.coin();
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      buyBtn.disabled = false;
    }
  }

  buyBtn.addEventListener('click', buy);
  revealBtn.addEventListener('click', () => { for (let i = 0; i < 9; i++) revealCell(i); });
  cells.forEach(cover);
  return () => { if (ticket) ctx.setBalance(ticket.balance); };
}
