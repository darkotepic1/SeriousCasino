// Turm – Frontend.
import { h, fmt, fmtMult, celebrate, segmented } from '../ui.js';
import { sfx } from '../sound.js';

export default async function mount(root, ctx) {
  const info = await ctx.get('/api/games/tower/info');
  let busy = false;
  let st = { running: false };
  let mode = 'medium';
  try { mode = localStorage.getItem('casino.tower.mode') || 'medium'; } catch { /* egal */ }
  if (!info.modes[mode]) mode = 'medium';

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <label class="field">Schwierigkeit<div class="mode-slot"></div></label>
      <button class="btn btn-gold btn-big main-btn">START</button>
      <div class="kv"><span>Multiplikator</span><span class="t-mult">–</span></div>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">Steig Stockwerk für Stockwerk nach oben. In jeder Reihe verstecken sich Fallen. Je höher, desto mehr Gewinn – steig rechtzeitig aus!</p>
    </div>
    <div class="game-stage">
      <div class="tower"></div>
      <div class="result-msg"></div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'tower', initial: 100 });
  el.querySelector('.bet-slot').appendChild(bet.el);
  const towerEl = el.querySelector('.tower');
  const mainBtn = el.querySelector('.main-btn');
  const msg = el.querySelector('.result-msg');
  const multEl = el.querySelector('.t-mult');
  const modeSeg = segmented(
    Object.entries(info.modes).map(([k, m]) => ({ value: k, label: m.name[0].toUpperCase() + m.name.slice(1) })), mode, (v) => {
      mode = v;
      try { localStorage.setItem('casino.tower.mode', v); } catch { /* egal */ }
      build();
    });
  el.querySelector('.mode-slot').appendChild(modeSeg.el);

  let rows = [];
  function build(end = null) {
    const m = info.modes[st.running ? st.mode : end ? end.mode : mode];
    towerEl.innerHTML = '';
    rows = [];
    for (let lvl = info.levels - 1; lvl >= 0; lvl--) {
      const row = h(`<div class="tw-row" style="--cols:${m.cols}">
        <div class="tw-tiles">${Array.from({ length: m.cols }, (_, c) => `<button class="tw-tile" data-c="${c}"></button>`).join('')}</div>
        <span class="tw-mult">${fmtMult(m.mults[lvl + 1])}</span></div>`);
      row.querySelectorAll('.tw-tile').forEach((b) => b.addEventListener('click', () => pick(lvl, Number(b.dataset.c))));
      rows[lvl] = row;
      towerEl.appendChild(row);
    }
    paint(end);
  }

  function paint(end = null) {
    const level = st.running ? st.level : -1;
    const picks = st.running ? st.picks : end ? end.picks : [];
    rows.forEach((row, lvl) => {
      row.classList.toggle('current', st.running && lvl === level);
      row.classList.toggle('done', lvl < picks.length);
      row.querySelectorAll('.tw-tile').forEach((b, c) => {
        b.disabled = !st.running || busy || lvl !== level;
        b.className = 'tw-tile';
        b.textContent = '';
        if (picks[lvl] === c) { b.classList.add('safe'); b.textContent = '⭐'; }
        if (end) {
          if (end.traps[lvl].includes(c)) {
            b.classList.add('trap');
            b.textContent = '💀';
            if (end.trapAt && end.trapAt.level === lvl && end.trapAt.col === c) b.classList.add('hit');
          } else if (picks[lvl] !== c) b.classList.add('dim');
        }
      });
    });
    const r = st.running;
    bet.setDisabled(r || busy);
    modeSeg.setDisabled(r || busy);
    mainBtn.disabled = busy || (r && !st.level);
    mainBtn.textContent = r ? (st.level ? `AUSCASHEN  ${fmt(st.payoutNow)}` : 'Feld wählen …') : 'START';
    mainBtn.classList.toggle('btn-green', r);
    mainBtn.classList.toggle('btn-gold', !r);
    multEl.textContent = r && st.level ? fmtMult(st.multiplier) : '–';
  }

  function finish(r) {
    st = { running: false };
    build(r);
    if (r.won) {
      msg.className = 'result-msg win';
      msg.textContent = `${r.top ? 'Ganz oben! ' : ''}${fmtMult(r.multiplier)} – +${fmt(r.payout)} Chips`;
      sfx.cashout();
      celebrate(r.payout, r.bet);
    } else {
      msg.className = 'result-msg lose';
      msg.textContent = `Falle! −${fmt(r.bet)} Chips`;
      sfx.boom();
    }
  }

  async function call(action, body) {
    if (busy) return;
    busy = true;
    paint();
    try {
      const r = await ctx.post(`/api/games/tower/${action}`, body);
      ctx.setBalance(r.balance);
      if (r.running) {
        const fresh = action === 'start';
        st = r;
        if (fresh) { msg.className = 'result-msg'; msg.textContent = ''; build(); } else sfx.gem();
      } else finish(r);
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      if (st.running) paint();
      else { bet.setDisabled(false); modeSeg.setDisabled(false); mainBtn.disabled = false; }
    }
  }
  function pick(lvl, col) {
    if (!st.running || lvl !== st.level) return;
    call('pick', { col });
  }
  mainBtn.addEventListener('click', () => (st.running ? call('cashout', {}) : call('start', { bet: bet.value, mode })));

  st = await ctx.post('/api/games/tower/state');
  if (st.running) modeSeg.set(st.mode);
  build();
}
