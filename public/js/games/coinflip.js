// Münzwurf-Serie – Frontend.
import { h, fmt, fmtMult, sleep, celebrate } from '../ui.js';
import { sfx } from '../sound.js';

export default async function mount(root, ctx) {
  let alive = true, busy = false;
  let st = { running: false };
  let coinRot = 0;

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <div class="row"><button class="btn btn-big cf-pick" data-s="heads">👑 KOPF</button><button class="btn btn-big cf-pick" data-s="tails">⭐ ZAHL</button></div>
      <button class="btn btn-green btn-big cash-btn" disabled>AUSCASHEN</button>
      <div class="kv"><span>Serie</span><span class="cf-streak">0</span></div>
      <div class="kv"><span>Aktuell</span><span class="cf-mult">–</span></div>
      <div class="kv"><span>Nächster Treffer</span><span class="cf-next gold">1,98×</span></div>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">Tippe auf Kopf oder Zahl. Jeder Treffer verdoppelt fast deinen Gewinn (×1,98). Weiterspielen oder auscashen – ein Fehler und alles ist weg.</p>
    </div>
    <div class="game-stage">
      <div class="panel cf-stage">
        <div class="coin-wrap"><div class="coin"><div class="coin-face heads">👑</div><div class="coin-face tails">⭐</div></div></div>
        <div class="cf-flips"></div>
        <div class="result-msg"></div>
      </div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'coinflip', initial: 100 });
  el.querySelector('.bet-slot').appendChild(bet.el);
  const coin = el.querySelector('.coin');
  const picks = [...el.querySelectorAll('.cf-pick')];
  const cashBtn = el.querySelector('.cash-btn');
  const flipsEl = el.querySelector('.cf-flips');
  const msg = el.querySelector('.result-msg');
  const streakEl = el.querySelector('.cf-streak'), multEl = el.querySelector('.cf-mult'), nextEl = el.querySelector('.cf-next');

  function paint(flips = st.flips || []) {
    const r = st.running;
    bet.setDisabled(r || busy);
    picks.forEach((b) => (b.disabled = busy));
    cashBtn.disabled = busy || !r || !st.streak;
    cashBtn.textContent = r && st.streak ? `AUSCASHEN  ${fmt(st.payoutNow)}` : 'AUSCASHEN';
    streakEl.textContent = r ? st.streak : 0;
    multEl.textContent = r && st.streak ? fmtMult(st.multiplier) : '–';
    nextEl.textContent = fmtMult(r ? st.next : 1.98);
    flipsEl.innerHTML = flips.map((f) => `<span class="${f.side === f.result ? 'good' : 'bad'}">${f.result === 'heads' ? '👑' : '⭐'}</span>`).join('');
  }

  async function animateTo(result) {
    const target = result === 'heads' ? 0 : 180;
    coinRot += 360 * 4 + ((target - coinRot) % 360 + 360) % 360;
    coin.style.transform = `rotateY(${coinRot}deg)`;
    sfx.spin();
    await sleep(900);
  }

  async function choose(side) {
    if (busy) return;
    busy = true;
    paint();
    try {
      if (!st.running) {
        const s = await ctx.post('/api/games/coinflip/start', { bet: bet.value });
        ctx.setBalance(s.balance);
        st = s;
        msg.className = 'result-msg';
        msg.textContent = '';
      }
      const r = await ctx.post('/api/games/coinflip/flip', { side });
      await animateTo(r.result);
      if (!alive) return;
      ctx.setBalance(r.balance);
      if (r.running) {
        st = r;
        sfx.gem();
        msg.className = 'result-msg';
        msg.innerHTML = `<span class="pos">Richtig! ${r.streak}er-Serie</span>`;
      } else {
        st = { running: false };
        paint(r.flips);
        if (r.won) {
          msg.className = 'result-msg win';
          msg.textContent = `Maximale Serie! +${fmt(r.payout)} Chips`;
          celebrate(r.payout, r.bet);
        } else {
          msg.className = 'result-msg lose';
          msg.textContent = `${r.result === 'heads' ? 'Kopf' : 'Zahl'} – daneben! −${fmt(r.bet)} Chips`;
          sfx.lose();
        }
        return;
      }
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      if (st.running) paint(); else { bet.setDisabled(false); picks.forEach((b) => (b.disabled = false)); cashBtn.disabled = true; cashBtn.textContent = 'AUSCASHEN'; }
    }
  }

  async function cashout() {
    if (busy) return;
    busy = true;
    paint();
    try {
      const r = await ctx.post('/api/games/coinflip/cashout');
      ctx.setBalance(r.balance);
      st = { running: false };
      paint(r.flips);
      msg.className = 'result-msg win';
      msg.textContent = `${fmtMult(r.multiplier)} – +${fmt(r.payout)} Chips!`;
      sfx.cashout();
      celebrate(r.payout, r.bet);
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      paint(st.running ? undefined : []);
    }
  }

  picks.forEach((b) => b.addEventListener('click', () => choose(b.dataset.s)));
  cashBtn.addEventListener('click', cashout);
  st = await ctx.post('/api/games/coinflip/state');
  paint();
  return () => { alive = false; };
}
