// Roulette (europäisch) – Frontend mit animiertem Rad.
import { h, fmt, sleep, celebrate } from '../ui.js';
import { sfx } from '../sound.js';

const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const color = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
const SEG = 360 / 37;
const SPIN_MS = 5000;

const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'M' : n >= 1e4 ? Math.round(n / 1000) + 'K' : n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'K' : String(n));

function wheelSvg() {
  const cx = 150, cy = 150, ro = 142, ri = 98;
  const pt = (r, deg) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)].map((v) => v.toFixed(2)).join(' ');
  };
  const fills = { red: '#c0262d', black: '#151515', green: '#138a4a' };
  const pockets = ORDER.map((n, i) => {
    const a0 = (i - 0.5) * SEG, a1 = (i + 0.5) * SEG;
    return `<path d="M ${pt(ri, a0)} L ${pt(ro, a0)} A ${ro} ${ro} 0 0 1 ${pt(ro, a1)} L ${pt(ri, a1)} A ${ri} ${ri} 0 0 0 ${pt(ri, a0)} Z" fill="${fills[color(n)]}" stroke="#d9b45a" stroke-width=".6"/>
      <text x="150" y="${cy - 124}" transform="rotate(${i * SEG} 150 150)" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="11" font-weight="700">${n}</text>`;
  }).join('');
  const spokes = [0, 45, 90, 135].map((d) => `<rect x="146" y="70" width="8" height="160" rx="4" fill="url(#hub)" transform="rotate(${d} 150 150)"/>`).join('');
  return `<svg viewBox="0 0 300 300" class="wheel-svg">
    <defs>
      <radialGradient id="hub"><stop offset="0" stop-color="#f6d77a"/><stop offset="1" stop-color="#9c7414"/></radialGradient>
      <radialGradient id="cone"><stop offset="0" stop-color="#3b2a10"/><stop offset="1" stop-color="#1a1206"/></radialGradient>
    </defs>
    <circle cx="150" cy="150" r="149" fill="#5a3b12" stroke="#d9b45a" stroke-width="2"/>
    ${pockets}
    <circle cx="150" cy="150" r="${ri}" fill="url(#cone)" stroke="#d9b45a" stroke-width="1.5"/>
    ${spokes}
    <circle cx="150" cy="150" r="18" fill="url(#hub)"/>
  </svg>`;
}

export default async function mount(root, ctx) {
  let alive = true;
  let spinning = false;
  let bets = new Map(); // key -> Betrag
  let undo = [];
  let wheelRot = 0, ballRot = 0;
  let recent = [];

  // Tisch aufbauen
  const spots = [];
  spots.push(`<button class="rt-spot rt-green" data-k="straight:0" style="grid-column:1;grid-row:1/4">0</button>`);
  for (let n = 1; n <= 36; n++) {
    const col = Math.ceil(n / 3) + 1;
    const row = 3 - ((n - 1) % 3);
    spots.push(`<button class="rt-spot rt-${color(n)}" data-k="straight:${n}" style="grid-column:${col};grid-row:${row}">${n}</button>`);
  }
  [3, 2, 1].forEach((c, i) => spots.push(`<button class="rt-spot rt-out" data-k="column:${c}" style="grid-column:14;grid-row:${i + 1}">2:1</button>`));
  ['1–12', '13–24', '25–36'].forEach((t, i) => spots.push(`<button class="rt-spot rt-out" data-k="dozen:${i + 1}" style="grid-column:${2 + i * 4}/span 4;grid-row:4">${t}</button>`));
  [['low', '1–18'], ['even', 'Gerade'], ['red', '<span class="rt-diamond red"></span>'], ['black', '<span class="rt-diamond black"></span>'], ['odd', 'Ungerade'], ['high', '19–36']]
    .forEach(([k, t], i) => spots.push(`<button class="rt-spot rt-out" data-k="${k}" style="grid-column:${2 + i * 2}/span 2;grid-row:5">${t}</button>`));

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <p class="muted" style="margin:0;font-size:.8rem">Klick auf ein Feld legt einen Chip. Rechtsklick entfernt ihn.</p>
      <div class="kv"><span>Einsatz auf dem Tisch</span><span class="rt-total">0</span></div>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn btn-sm" data-c="undo">↶ Zurück</button>
        <button class="btn btn-sm" data-c="double">2× alles</button>
        <button class="btn btn-sm" data-c="clear">Leeren</button>
      </div>
      <button class="btn btn-gold btn-big spin-btn">DREHEN</button>
      <div class="muted" style="font-size:.8rem;line-height:1.5">Zahl 35:1 · Dutzend/Kolonne 2:1 · Rot/Schwarz, Gerade/Ungerade, 1–18/19–36 1:1</div>
    </div>
    <div class="game-stage">
      <div class="rt-top">
        <div class="wheel-wrap">
          <div class="wheel-pointer"></div>
          <div class="wheel-rot">${wheelSvg()}</div>
          <div class="ball-rot"><div class="ball"></div></div>
        </div>
        <div class="rt-info">
          <div class="rt-last"><span class="muted">Letzte Zahlen</span><div class="rt-recent"></div></div>
          <div class="rt-number"></div>
          <div class="result-msg"></div>
        </div>
      </div>
      <div class="felt rt-board-wrap"><div class="rt-board">${spots.join('')}</div></div>
    </div></div>`);
  root.appendChild(el);

  const chip = ctx.bet({ game: 'roulette', initial: 10, label: 'Chip-Wert' });
  el.querySelector('.bet-slot').appendChild(chip.el);
  const totalEl = el.querySelector('.rt-total');
  const spinBtn = el.querySelector('.spin-btn');
  const wheelRotEl = el.querySelector('.wheel-rot');
  const ballRotEl = el.querySelector('.ball-rot');
  const msg = el.querySelector('.result-msg');
  const numEl = el.querySelector('.rt-number');
  const recentEl = el.querySelector('.rt-recent');
  const spotEls = new Map([...el.querySelectorAll('.rt-spot')].map((s) => [s.dataset.k, s]));

  const total = () => [...bets.values()].reduce((a, b) => a + b, 0);

  function paintBets() {
    spotEls.forEach((s, k) => {
      s.querySelector('.rt-chip')?.remove();
      const amt = bets.get(k);
      if (amt) s.appendChild(h(`<span class="rt-chip">${short(amt)}</span>`));
    });
    totalEl.textContent = fmt(total());
    spinBtn.disabled = spinning || total() === 0;
  }

  function place(k, amount) {
    if (spinning) return;
    if (total() + amount > ctx.getBalance()) return ctx.toast('Nicht genug Chips.', 'err');
    undo.push(new Map(bets));
    bets.set(k, (bets.get(k) || 0) + amount);
    sfx.chip();
    clearWinHighlight();
    paintBets();
  }

  function clearWinHighlight() {
    spotEls.forEach((s) => s.classList.remove('rt-hit'));
  }

  spotEls.forEach((s, k) => {
    s.addEventListener('click', () => place(k, Math.max(1, chip.value)));
    s.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (spinning || !bets.has(k)) return;
      undo.push(new Map(bets));
      const left = bets.get(k) - Math.max(1, chip.value);
      if (left > 0) bets.set(k, left); else bets.delete(k);
      sfx.click();
      paintBets();
    });
  });

  el.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
    if (spinning) return;
    const c = b.dataset.c;
    if (c === 'undo' && undo.length) bets = undo.pop();
    if (c === 'clear' && bets.size) { undo.push(new Map(bets)); bets = new Map(); }
    if (c === 'double' && bets.size) {
      if (total() * 2 > ctx.getBalance()) return ctx.toast('Nicht genug Chips zum Verdoppeln.', 'err');
      undo.push(new Map(bets));
      bets = new Map([...bets].map(([k, v]) => [k, v * 2]));
    }
    sfx.click();
    paintBets();
  }));

  function paintRecent() {
    recentEl.innerHTML = recent.map((n) => `<span class="rt-ball rt-${color(n)}">${n}</span>`).join('');
  }

  async function spin() {
    if (spinning || !bets.size) return;
    if (total() > ctx.getBalance()) return ctx.toast('Nicht genug Chips.', 'err');
    spinning = true;
    chip.setDisabled(true);
    paintBets();
    clearWinHighlight();
    msg.className = 'result-msg';
    msg.textContent = 'Nichts geht mehr …';
    numEl.className = 'rt-number';
    numEl.textContent = '';
    try {
      const payload = [...bets].map(([k, amount]) => {
        const [type, value] = k.split(':');
        return { type, value: value === undefined ? undefined : Number(value), amount };
      });
      const res = await ctx.post('/api/games/roulette/spin', { bets: payload });
      ctx.setBalance(res.balance - res.payout);

      const idx = ORDER.indexOf(res.number);
      const norm = (x) => ((x % 360) + 360) % 360;
      wheelRot += 360 * 4 + norm(-idx * SEG - wheelRot);
      ballRot -= 360 * 6 + norm(ballRot);
      wheelRotEl.style.transition = `transform ${SPIN_MS}ms cubic-bezier(.15,.55,.15,1)`;
      ballRotEl.style.transition = `transform ${SPIN_MS}ms cubic-bezier(.2,.6,.1,1)`;
      wheelRotEl.style.transform = `rotate(${wheelRot}deg)`;
      ballRotEl.style.transform = `rotate(${ballRot}deg)`;
      ballRotEl.classList.add('spinning');
      // Klick-Geräusche, die langsamer werden
      let t = 0, gap = 40;
      while (t < SPIN_MS - 400 && alive) {
        await sleep(gap);
        t += gap;
        gap *= 1.06;
        sfx.tick();
      }
      await sleep(Math.max(0, SPIN_MS - t));
      if (!alive) return;
      ballRotEl.classList.remove('spinning');

      const colName = { red: 'Rot', black: 'Schwarz', green: 'Grün' }[res.color];
      numEl.className = `rt-number rt-${res.color} pop`;
      numEl.innerHTML = `${res.number}<small>${colName}</small>`;
      recent = [res.number, ...recent].slice(0, 12);
      paintRecent();
      res.results.filter((r) => r.won).forEach((r) => spotEls.get(r.value === null ? r.type : `${r.type}:${r.value}`)?.classList.add('rt-hit'));
      spotEls.get(`straight:${res.number}`)?.classList.add('rt-hit');
      ctx.setBalance(res.balance);
      const net = res.payout - res.totalBet;
      if (res.payout > 0) {
        msg.className = 'result-msg ' + (net > 0 ? 'win' : net < 0 ? '' : 'push');
        msg.textContent = `Auszahlung ${fmt(res.payout)} (${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))})`;
        celebrate(res.payout, res.totalBet);
      } else {
        msg.className = 'result-msg lose';
        msg.textContent = `Leider nichts – −${fmt(res.totalBet)}`;
        sfx.lose();
      }
    } catch (e) {
      ctx.toast(e.message, 'err');
      msg.textContent = '';
    } finally {
      spinning = false;
      chip.setDisabled(false);
      paintBets();
    }
  }

  spinBtn.addEventListener('click', spin);
  paintBets();
  paintRecent();
  return () => { alive = false; };
}
