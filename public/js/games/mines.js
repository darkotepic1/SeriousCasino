// Mines – Frontend.
import { h, fmt, fmtMult, celebrate } from '../ui.js';
import { sfx } from '../sound.js';

export default async function mount(root, ctx) {
  let alive = true;
  let busy = false;
  let st = { running: false };
  let mineCount = 3;
  try { mineCount = Number(localStorage.getItem('casino.mines.count')) || 3; } catch { /* egal */ }

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <label class="field">Anzahl Minen
        <select class="input mines-sel">${Array.from({ length: 24 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select>
      </label>
      <button class="btn btn-gold btn-big main-btn">START</button>
      <div class="kv"><span>Aktueller Multiplikator</span><span class="m-now">–</span></div>
      <div class="kv"><span>Nächstes Feld</span><span class="m-next">–</span></div>
      <div class="kv"><span>Diamanten gefunden</span><span class="m-found">0</span></div>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">Deck Felder auf und sammle Diamanten. Jeder Diamant erhöht den Gewinn – aber eine Mine und alles ist weg. Du kannst jederzeit auscashen.</p>
    </div>
    <div class="game-stage">
      <div class="mines-wrap">
        <div class="mines-grid">${Array.from({ length: 25 }, (_, i) => `<button class="mine-tile" data-i="${i}" disabled></button>`).join('')}</div>
        <div class="result-msg"></div>
      </div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'mines', initial: 100 });
  el.querySelector('.bet-slot').appendChild(bet.el);
  const sel = el.querySelector('.mines-sel');
  sel.value = String(mineCount);
  sel.addEventListener('change', () => {
    mineCount = Number(sel.value);
    try { localStorage.setItem('casino.mines.count', sel.value); } catch { /* egal */ }
    paintInfo();
  });
  const mainBtn = el.querySelector('.main-btn');
  const tiles = [...el.querySelectorAll('.mine-tile')];
  const msg = el.querySelector('.result-msg');
  const nowEl = el.querySelector('.m-now'), nextEl = el.querySelector('.m-next'), foundEl = el.querySelector('.m-found');
  const { table } = await ctx.get('/api/games/mines/info');

  function paintInfo() {
    if (st.running) {
      nowEl.textContent = st.revealed.length ? fmtMult(st.multiplier) : '–';
      nextEl.textContent = st.next ? fmtMult(st.next) : '–';
      foundEl.textContent = `${st.revealed.length} / ${25 - st.mines}`;
    } else {
      nowEl.textContent = '–';
      nextEl.textContent = fmtMult(table[mineCount][1]);
      foundEl.textContent = '0';
    }
  }

  function paintControls() {
    const r = st.running;
    bet.setDisabled(r || busy);
    sel.disabled = r || busy;
    mainBtn.disabled = busy || (r && !st.revealed.length);
    if (r) {
      mainBtn.textContent = st.revealed.length ? `AUSCASHEN  ${fmt(st.payoutNow)}` : 'Feld wählen …';
      mainBtn.classList.replace('btn-gold', 'btn-green');
    } else {
      mainBtn.textContent = 'START';
      mainBtn.classList.replace('btn-green', 'btn-gold');
    }
    tiles.forEach((t, i) => (t.disabled = !r || busy || st.revealed.includes(i)));
    paintInfo();
  }

  function resetTiles() {
    tiles.forEach((t) => { t.className = 'mine-tile'; t.textContent = ''; });
  }

  function showRunning() {
    st.revealed.forEach((i) => {
      if (!tiles[i].classList.contains('gem')) { tiles[i].className = 'mine-tile gem open'; tiles[i].textContent = '💎'; }
    });
  }

  function showEnd(r) {
    r.positions.forEach((i) => {
      tiles[i].className = 'mine-tile bomb open ' + (i === r.hit ? 'hit' : 'dim');
      tiles[i].textContent = '💣';
    });
    tiles.forEach((t, i) => {
      if (!r.positions.includes(i) && !r.revealed.includes(i)) { t.className = 'mine-tile gem open dim'; t.textContent = '💎'; }
    });
  }

  async function main() {
    if (busy) return;
    busy = true;
    paintControls();
    try {
      if (!st.running) {
        const r = await ctx.post('/api/games/mines/start', { bet: bet.value, mines: mineCount });
        ctx.setBalance(r.balance);
        resetTiles();
        msg.className = 'result-msg';
        msg.textContent = '';
        st = r;
        sfx.chip();
      } else {
        const r = await ctx.post('/api/games/mines/cashout');
        ctx.setBalance(r.balance);
        finish(r);
      }
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      paintControls();
    }
  }

  function finish(r) {
    st = { running: false };
    showEnd(r);
    if (r.won) {
      msg.className = 'result-msg win';
      msg.textContent = `${fmtMult(r.multiplier)} – +${fmt(r.payout)} Chips!`;
      sfx.cashout();
      celebrate(r.payout, r.bet);
    } else {
      msg.className = 'result-msg lose';
      msg.textContent = `BOOM! −${fmt(r.bet)} Chips`;
      sfx.boom();
    }
  }

  tiles.forEach((t, i) => t.addEventListener('click', async () => {
    if (!st.running || busy || st.revealed.includes(i)) return;
    busy = true;
    t.classList.add('pending');
    paintControls();
    try {
      const r = await ctx.post('/api/games/mines/reveal', { index: i });
      if (!alive) return;
      t.classList.remove('pending');
      ctx.setBalance(r.balance);
      if (r.running) {
        st = r;
        showRunning();
        sfx.gem();
      } else {
        if (r.won) { tiles[i].className = 'mine-tile gem open'; tiles[i].textContent = '💎'; }
        finish(r);
      }
    } catch (e) {
      t.classList.remove('pending');
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      paintControls();
    }
  }));
  mainBtn.addEventListener('click', main);

  st = await ctx.post('/api/games/mines/state');
  if (st.running) { sel.value = String(st.mines); showRunning(); }
  paintControls();

  return () => { alive = false; };
}
