// Live-Roulette – ein gemeinsames Rad für alle.
import { h, esc, fmt, sleep, celebrate } from '../ui.js';
import { sfx } from '../sound.js';
import { ORDER, color, wheelSvg } from './roulette.js';

const SEG = 360 / 37;
const short = (n) => (n >= 10000 ? Math.round(n / 1000) + 'K' : n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'K' : String(n));

export default async function mount(root, ctx) {
  let alive = true, pollTimer = 0, st = null, lastRound = null, lastPhase = null, busy = false;
  let wheelRot = 0, ballRot = 0;
  let pending = new Map(); // noch nicht abgeschickte Chips

  const spots = [`<button class="rt-spot rt-green" data-k="straight:0" style="grid-column:1;grid-row:1/4">0</button>`];
  for (let n = 1; n <= 36; n++) spots.push(`<button class="rt-spot rt-${color(n)}" data-k="straight:${n}" style="grid-column:${Math.ceil(n / 3) + 1};grid-row:${3 - ((n - 1) % 3)}">${n}</button>`);
  [3, 2, 1].forEach((c, i) => spots.push(`<button class="rt-spot rt-out" data-k="column:${c}" style="grid-column:14;grid-row:${i + 1}">2:1</button>`));
  ['1–12', '13–24', '25–36'].forEach((t, i) => spots.push(`<button class="rt-spot rt-out" data-k="dozen:${i + 1}" style="grid-column:${2 + i * 4}/span 4;grid-row:4">${t}</button>`));
  [['low', '1–18'], ['even', 'Gerade'], ['red', '<span class="rt-diamond red"></span>'], ['black', '<span class="rt-diamond black"></span>'], ['odd', 'Ungerade'], ['high', '19–36']]
    .forEach(([k, t], i) => spots.push(`<button class="rt-spot rt-out" data-k="${k}" style="grid-column:${2 + i * 2}/span 2;grid-row:5">${t}</button>`));

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <div class="kv"><span>Noch nicht gesetzt</span><span class="lr-pending">0</span></div>
      <div class="kv"><span>Dein Einsatz diese Runde</span><span class="lr-mine gold">0</span></div>
      <div class="row"><button class="btn btn-sm" data-c="clear">Auswahl leeren</button></div>
      <button class="btn btn-gold btn-big place-btn">EINSÄTZE SETZEN</button>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">Alle spielen am selben Tisch. Chips auf Felder legen, dann „Einsätze setzen“ – in einer Runde kannst du mehrmals nachlegen. Rechtsklick entfernt einen Chip.</p>
    </div>
    <div class="game-stage">
      <div class="rt-top">
        <div class="wheel-wrap"><div class="wheel-pointer"></div><div class="wheel-rot">${wheelSvg()}</div><div class="ball-rot"><div class="ball"></div></div></div>
        <div class="rt-info">
          <div class="lr-phase"></div>
          <div class="rt-number"></div>
          <div class="result-msg"></div>
          <div class="rt-last"><span class="muted">Letzte Zahlen</span><div class="rt-recent"></div></div>
        </div>
      </div>
      <div class="felt rt-board-wrap"><div class="rt-board">${spots.join('')}</div></div>
      <div class="panel lc-players"><h3>Spieler am Tisch <span class="muted lr-count"></span></h3><div class="lc-list"></div></div>
    </div></div>`);
  root.appendChild(el);

  const chip = ctx.bet({ game: 'liveroulette', initial: 10, label: 'Chip-Wert' });
  el.querySelector('.bet-slot').appendChild(chip.el);
  const spotEls = new Map([...el.querySelectorAll('.rt-spot')].map((s) => [s.dataset.k, s]));
  const pendEl = el.querySelector('.lr-pending'), mineEl = el.querySelector('.lr-mine');
  const placeBtn = el.querySelector('.place-btn');
  const phaseEl = el.querySelector('.lr-phase');
  const numEl = el.querySelector('.rt-number');
  const msg = el.querySelector('.result-msg');
  const recentEl = el.querySelector('.rt-recent');
  const listEl = el.querySelector('.lc-list');
  const wheelRotEl = el.querySelector('.wheel-rot'), ballRotEl = el.querySelector('.ball-rot');

  // Bereits gesetzte (eigene) Chips pro Feld
  const placed = () => {
    const m = new Map();
    for (const b of st?.mine?.list || []) { const k = b.value === null ? b.type : `${b.type}:${b.value}`; m.set(k, (m.get(k) || 0) + b.amount); }
    return m;
  };
  const pendTotal = () => [...pending.values()].reduce((a, b) => a + b, 0);

  function paintBoard() {
    const pl = placed();
    spotEls.forEach((s, k) => {
      s.querySelector('.rt-chip')?.remove();
      const total = (pl.get(k) || 0) + (pending.get(k) || 0);
      if (total) s.appendChild(h(`<span class="rt-chip ${pending.get(k) ? 'pending' : ''}">${short(total)}</span>`));
    });
    pendEl.textContent = fmt(pendTotal());
    mineEl.textContent = fmt(st?.mine?.total || 0);
    placeBtn.disabled = busy || !pendTotal() || st?.phase !== 'betting';
  }

  spotEls.forEach((s, k) => {
    s.addEventListener('click', () => {
      if (st?.phase !== 'betting') return ctx.toast('Gerade kann nicht gesetzt werden.', 'err');
      const add = Math.max(1, chip.value);
      if (pendTotal() + add > ctx.getBalance()) return ctx.toast('Nicht genug Chips.', 'err');
      pending.set(k, (pending.get(k) || 0) + add);
      sfx.chip();
      paintBoard();
    });
    s.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!pending.has(k)) return;
      const left = pending.get(k) - Math.max(1, chip.value);
      if (left > 0) pending.set(k, left); else pending.delete(k);
      paintBoard();
    });
  });
  el.querySelector('[data-c=clear]').addEventListener('click', () => { pending = new Map(); paintBoard(); });

  placeBtn.addEventListener('click', async () => {
    if (busy || !pendTotal()) return;
    busy = true;
    paintBoard();
    try {
      const bets = [...pending].map(([k, amount]) => { const [type, v] = k.split(':'); return { type, value: v === undefined ? undefined : Number(v), amount }; });
      const s = await ctx.post('/api/live/roulette/bet', { bets });
      pending = new Map();
      sfx.coin();
      onState(s);
    } catch (e) { ctx.toast(e.message, 'err'); }
    busy = false;
    paintBoard();
  });

  let spunRound = null;
  async function spinTo(n, ms, instant = false) {
    spunRound = lastRound;
    const idx = ORDER.indexOf(n);
    if (instant) {
      // Drehung verpasst (Tab im Hintergrund) → Rad direkt auf die Zahl stellen
      wheelRot = -idx * SEG; ballRot = 0;
      wheelRotEl.style.transition = ballRotEl.style.transition = 'none';
      wheelRotEl.style.transform = `rotate(${wheelRot}deg)`;
      ballRotEl.style.transform = 'rotate(0deg)';
      return;
    }
    const norm = (x) => ((x % 360) + 360) % 360;
    wheelRot += 360 * 4 + norm(-idx * SEG - wheelRot);
    ballRot -= 360 * 6 + norm(ballRot);
    wheelRotEl.style.transition = `transform ${ms}ms cubic-bezier(.15,.55,.15,1)`;
    ballRotEl.style.transition = `transform ${ms}ms cubic-bezier(.2,.6,.1,1)`;
    wheelRotEl.style.transform = `rotate(${wheelRot}deg)`;
    ballRotEl.style.transform = `rotate(${ballRot}deg)`;
    ballRotEl.classList.add('spinning');
    let t = 0, gap = 40;
    while (t < ms - 400 && alive) { await sleep(gap); t += gap; gap *= 1.06; sfx.tick(); }
    ballRotEl.classList.remove('spinning');
  }

  function onState(s) {
    const newRound = s.id !== lastRound;
    const changed = newRound || s.phase !== lastPhase;
    st = s;
    if (s.balance !== null && s.balance !== undefined && !busy) ctx.setBalance(s.balance - (s.phase !== 'result' ? 0 : 0));
    if (changed) {
      if (s.phase === 'betting') {
        msg.className = 'result-msg'; msg.textContent = '';
        numEl.className = 'rt-number'; numEl.textContent = '';
        spotEls.forEach((x) => x.classList.remove('rt-hit'));
      }
      if (s.phase === 'spinning') { lastRound = s.id; msg.className = 'result-msg'; msg.textContent = 'Nichts geht mehr …'; spinTo(s.number, Math.max(800, s.timeLeft - 200)); }
      if (s.phase === 'result') {
        if (spunRound !== s.id) spinTo(s.number, 0, true);
        numEl.className = `rt-number rt-${s.color} pop`;
        numEl.innerHTML = `${s.number}<small>${{ red: 'Rot', black: 'Schwarz', green: 'Grün' }[s.color]}</small>`;
        spotEls.get(`straight:${s.number}`)?.classList.add('rt-hit');
        if (s.mine) {
          const net = s.mine.payout - s.mine.total;
          msg.className = 'result-msg ' + (net > 0 ? 'win' : net < 0 ? 'lose' : 'push');
          msg.textContent = s.mine.payout ? `Auszahlung ${fmt(s.mine.payout)} (${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))})` : `Leider nichts – −${fmt(s.mine.total)}`;
          if (s.mine.payout > 0) celebrate(s.mine.payout, s.mine.total); else sfx.lose();
        }
      }
    }
    lastRound = s.id;
    lastPhase = s.phase;
    const secs = Math.ceil(s.timeLeft / 1000);
    phaseEl.innerHTML = s.phase === 'betting' ? `<span class="pos">Wettphase</span> – noch <b>${secs} s</b>` : s.phase === 'spinning' ? '<span class="gold">Das Rad dreht sich …</span>' : `Nächste Runde in ${secs} s`;
    recentEl.innerHTML = s.history.map((n) => `<span class="rt-ball rt-${color(n)}">${n}</span>`).join('');
    el.querySelector('.lr-count').textContent = s.players.length ? `(${s.players.length})` : '';
    listEl.innerHTML = s.players.map((p) => `<div class="lc-row ${p.me ? 'me' : ''}"><span class="lc-name">${esc(p.name)}</span><span class="lc-bet"><span class="chip-icon"></span>${fmt(p.total)}</span>${p.payout === null ? '<span class="muted">gesetzt</span>' : p.payout > 0 ? `<span class="pos">+${fmt(p.payout - p.total)}</span>` : '<span class="neg">verloren</span>'}</div>`).join('')
      || '<p class="muted" style="margin:0">Noch niemand am Tisch.</p>';
    if (s.phase !== 'betting' && pending.size) pending = new Map();
    paintBoard();
  }

  async function poll() {
    if (!alive) return;
    try { onState(await ctx.get('/api/live/roulette/state')); } catch { /* nächster Versuch */ }
    pollTimer = setTimeout(poll, 400);
  }
  await poll();
  return () => { alive = false; clearTimeout(pollTimer); };
}
