// Video Poker (Jacks or Better) – Frontend.
import { h, fmt, sleep, celebrate, cardEl } from '../ui.js';
import { sfx } from '../sound.js';

export default async function mount(root, ctx) {
  const { paytable } = await ctx.get('/api/games/poker/info');
  let alive = true;
  let busy = false;
  let hand = null; // aktuelle 5 Karten
  let held = [false, false, false, false, false];
  let phase = 'idle'; // idle | dealt

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <button class="btn btn-gold btn-big main-btn">GEBEN</button>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">1. Geben · 2. Karten zum Halten anklicken (oder Tasten 1–5) · 3. Ziehen.<br>Gewinn ab einem Paar Buben.</p>
    </div>
    <div class="game-stage">
      <div class="panel vp-pay"><table class="tbl"><tbody>
        ${paytable.map((p) => `<tr data-id="${p.id}"><td>${p.name}</td><td class="num muted">${p.pay}×</td><td class="num gold vp-amt"></td></tr>`).join('')}
      </tbody></table></div>
      <div class="felt vp-table">
        <div class="vp-cards">${[0, 1, 2, 3, 4].map((i) => `<div class="vp-slot" data-i="${i}"><div class="vp-card"></div><div class="vp-held">GEHALTEN</div></div>`).join('')}</div>
        <div class="result-msg"></div>
      </div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'poker', initial: 100 });
  el.querySelector('.bet-slot').appendChild(bet.el);
  const mainBtn = el.querySelector('.main-btn');
  const slots = [...el.querySelectorAll('.vp-slot')];
  const msg = el.querySelector('.result-msg');
  const rows = Object.fromEntries([...el.querySelectorAll('[data-id]')].map((r) => [r.dataset.id, r]));

  const paintAmounts = (b) => paytable.forEach((p) => (rows[p.id].querySelector('.vp-amt').textContent = fmt(p.pay * b)));
  bet.onChange = (v) => phase === 'idle' && paintAmounts(v);
  paintAmounts(bet.value);

  const highlight = (id) => Object.entries(rows).forEach(([k, r]) => r.classList.toggle('hl', k === id));

  let visible = [true, true, true, true, true];
  function paintCards() {
    slots.forEach((s, i) => {
      const c = hand && visible[i] ? hand[i] : null;
      s.querySelector('.vp-card').replaceChildren(cardEl(c));
      s.classList.toggle('held', held[i]);
      s.classList.toggle('clickable', phase === 'dealt');
    });
  }
  paintCards();

  function toggle(i) {
    if (phase !== 'dealt' || busy) return;
    held[i] = !held[i];
    sfx.click();
    paintCards();
  }
  slots.forEach((s, i) => s.addEventListener('click', () => toggle(i)));

  async function revealSequential(indices) {
    indices.forEach((i) => (visible[i] = false));
    paintCards();
    await sleep(150);
    for (const i of indices) {
      if (!alive) return;
      visible[i] = true;
      slots[i].querySelector('.vp-card').replaceChildren(cardEl(hand[i], 'flip'));
      sfx.card();
      await sleep(110);
    }
    paintCards();
  }

  async function main() {
    if (busy) return;
    busy = true;
    mainBtn.disabled = true;
    try {
      if (phase === 'idle') {
        const r = await ctx.post('/api/games/poker/deal', { bet: bet.value });
        ctx.setBalance(r.balance);
        held = [false, false, false, false, false];
        msg.className = 'result-msg';
        msg.textContent = '';
        highlight(null);
        paintAmounts(r.bet);
        phase = 'dealt';
        hand = r.hand;
        await revealSequential([0, 1, 2, 3, 4]);
        highlight(r.current);
        if (r.current) msg.innerHTML = `<span class="gold">Auf der Hand: ${paytable.find((p) => p.id === r.current).name}</span>`;
        mainBtn.textContent = 'ZIEHEN';
        bet.setDisabled(true);
      } else {
        const r = await ctx.post('/api/games/poker/draw', { hold: held });
        const replaced = [0, 1, 2, 3, 4].filter((i) => !held[i]);
        hand = r.hand;
        await revealSequential(replaced);
        phase = 'idle';
        paintCards();
        highlight(r.result);
        ctx.setBalance(r.balance);
        if (r.payout > 0) {
          msg.className = 'result-msg win';
          msg.textContent = `${r.resultName}! +${fmt(r.payout)} Chips`;
          celebrate(r.payout, r.bet);
        } else {
          msg.className = 'result-msg lose';
          msg.textContent = 'Leider nichts.';
          sfx.lose();
        }
        mainBtn.textContent = 'GEBEN';
        bet.setDisabled(false);
      }
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      mainBtn.disabled = false;
    }
  }
  mainBtn.addEventListener('click', main);

  const onKey = (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    if (/^[1-5]$/.test(e.key)) toggle(Number(e.key) - 1);
    if ((e.code === 'Space' || e.key === 'Enter') && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); main(); }
  };
  document.addEventListener('keydown', onKey);

  // Laufende Runde fortsetzen
  const st = await ctx.post('/api/games/poker/state');
  if (!st.none) {
    hand = st.hand;
    phase = 'dealt';
    mainBtn.textContent = 'ZIEHEN';
    bet.setDisabled(true);
    paintAmounts(st.bet);
    highlight(st.current);
    paintCards();
  }

  return () => { alive = false; document.removeEventListener('keydown', onKey); };
}
