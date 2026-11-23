// Hütchenspiel – Frontend.
import { h, fmt, sleep, celebrate, segmented } from '../ui.js';
import { sfx } from '../sound.js';

export default async function mount(root, ctx) {
  const { mults } = await ctx.get('/api/games/cups/info');
  let alive = true, busy = false, phase = 'idle'; // idle | pick
  let cups = 3;
  try { cups = Number(localStorage.getItem('casino.cups.n')) || 3; } catch { /* egal */ }

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <label class="field">Anzahl Becher<div class="n-slot"></div></label>
      <div class="kv"><span>Gewinn bei Treffer</span><span class="cup-mult gold"></span></div>
      <button class="btn btn-gold btn-big shuffle-btn">BECHER MISCHEN</button>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">Die Kugel wird versteckt und die Becher gemischt. Dann tippst du auf den Becher, unter dem du die Kugel vermutest.</p>
    </div>
    <div class="game-stage">
      <div class="felt cup-table"><div class="cup-row"></div></div>
      <div class="result-msg"></div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'cups', initial: 100 });
  el.querySelector('.bet-slot').appendChild(bet.el);
  const row = el.querySelector('.cup-row');
  const multEl = el.querySelector('.cup-mult');
  const shuffleBtn = el.querySelector('.shuffle-btn');
  const msg = el.querySelector('.result-msg');
  const seg = segmented([{ value: 3, label: '3' }, { value: 4, label: '4' }, { value: 5, label: '5' }], cups, (v) => {
    cups = v;
    try { localStorage.setItem('casino.cups.n', String(v)); } catch { /* egal */ }
    build();
  });
  el.querySelector('.n-slot').appendChild(seg.el);

  function build(ballAt = -1) {
    multEl.textContent = `${mults[cups].toLocaleString('de-DE')}×`;
    row.innerHTML = Array.from({ length: cups }, (_, i) => `
      <div class="cup-slot" data-i="${i}">
        <div class="cup ${ballAt >= 0 ? 'up' : ''}">🥤</div>
        <div class="cup-ball ${ballAt === i ? 'show' : ''}"></div>
      </div>`).join('');
    row.querySelectorAll('.cup-slot').forEach((s) => s.addEventListener('click', () => pickCup(Number(s.dataset.i))));
  }
  build();

  async function shuffle() {
    if (busy) return;
    if (bet.value > ctx.getBalance()) return ctx.toast('Nicht genug Chips.', 'err');
    busy = true;
    shuffleBtn.disabled = true;
    seg.setDisabled(true);
    bet.setDisabled(true);
    msg.className = 'result-msg';
    msg.textContent = '';
    // Kugel kurz zeigen, Becher drüber, dann mischen (nur Show – das Ergebnis entscheidet der Server)
    const start = Math.floor(cups / 2);
    build(start);
    await sleep(700);
    row.querySelectorAll('.cup').forEach((c) => c.classList.remove('up'));
    await sleep(350);
    row.querySelector('.cup-ball.show')?.classList.remove('show');
    const slots = [...row.children];
    for (let k = 0; k < 7 + cups && alive; k++) {
      const a = Math.floor(Math.random() * cups);
      let b = Math.floor(Math.random() * (cups - 1));
      if (b >= a) b++;
      const dx = slots[b].offsetLeft - slots[a].offsetLeft;
      slots[a].style.transform = `translateX(${dx}px)`;
      slots[b].style.transform = `translateX(${-dx}px)`;
      sfx.tick();
      await sleep(230);
      slots[a].style.transition = slots[b].style.transition = 'none';
      slots[a].style.transform = slots[b].style.transform = '';
      void slots[a].offsetWidth;
      slots[a].style.transition = slots[b].style.transition = '';
    }
    if (!alive) return;
    phase = 'pick';
    row.classList.add('picking');
    msg.textContent = 'Wo ist die Kugel? Tippe auf einen Becher!';
    busy = false;
  }

  async function pickCup(i) {
    if (phase !== 'pick' || busy) return;
    busy = true;
    phase = 'idle';
    row.classList.remove('picking');
    try {
      const r = await ctx.post('/api/games/cups/play', { bet: bet.value, cups, pick: i });
      ctx.setBalance(r.balance - r.payout);
      const slots = [...row.children];
      slots[i].classList.add('picked');
      slots[r.ball].querySelector('.cup-ball').classList.add('show');
      slots[i].querySelector('.cup').classList.add('up');
      await sleep(500);
      slots.forEach((s) => s.querySelector('.cup').classList.add('up'));
      ctx.setBalance(r.balance);
      if (r.won) {
        msg.className = 'result-msg win';
        msg.textContent = `Gefunden! +${fmt(r.payout - r.bet)} Chips`;
        celebrate(r.payout, r.bet);
      } else {
        msg.className = 'result-msg lose';
        msg.textContent = `Leer! Die Kugel war unter Becher ${r.ball + 1}.`;
        sfx.lose();
      }
    } catch (e) {
      ctx.toast(e.message, 'err');
      build();
    } finally {
      busy = false;
      shuffleBtn.disabled = false;
      seg.setDisabled(false);
      bet.setDisabled(false);
    }
  }

  shuffleBtn.addEventListener('click', shuffle);
  return () => { alive = false; };
}
