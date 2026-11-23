// Pferderennen – Frontend mit animiertem Rennen.
import { h, esc, fmt, sleep, celebrate } from '../ui.js';
import { sfx } from '../sound.js';

const RACE_MS = 6500;

export default async function mount(root, ctx) {
  let alive = true, busy = false;
  let card = await ctx.post('/api/games/horses/card');
  let pick = 0;
  let raf = 0;

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <div class="hr-list"></div>
      <button class="btn btn-gold btn-big race-btn">RENNEN STARTEN</button>
      <button class="btn btn-sm new-btn">🔄 Andere Pferde</button>
      <p class="muted" style="margin:0;font-size:.78rem;line-height:1.5">Wähle ein Pferd. Gewinnt es, bekommst du Einsatz × Quote. Favoriten (niedrige Quote) gewinnen öfter, Außenseiter zahlen mehr.</p>
    </div>
    <div class="game-stage">
      <div class="hr-track"></div>
      <div class="result-msg"></div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'horses', initial: 100 });
  el.querySelector('.bet-slot').appendChild(bet.el);
  const list = el.querySelector('.hr-list');
  const track = el.querySelector('.hr-track');
  const raceBtn = el.querySelector('.race-btn');
  const newBtn = el.querySelector('.new-btn');
  const msg = el.querySelector('.result-msg');

  function paintCard() {
    list.innerHTML = card.horses.map((x, i) => `
      <button class="hr-pick ${i === pick ? 'on' : ''}" data-i="${i}">
        <span class="hr-no" style="background:${x.color}">${i + 1}</span>
        <span class="hr-name">${esc(x.name)}</span>
        <span class="hr-odds">${x.mult.toLocaleString('de-DE')}×</span>
      </button>`).join('');
    list.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
      if (busy) return;
      pick = Number(b.dataset.i);
      sfx.click();
      paintCard();
    }));
    track.innerHTML = card.horses.map((x, i) => `
      <div class="hr-lane ${i === pick ? 'mine' : ''}">
        <span class="hr-lane-no" style="background:${x.color}">${i + 1}</span>
        <div class="hr-runner" data-r="${i}"><span class="hr-horse">🏇</span></div>
      </div>`).join('') + '<div class="hr-finish"></div>';
  }
  paintCard();

  function animate(order) {
    return new Promise((resolve) => {
      const runners = [...track.querySelectorAll('[data-r]')];
      // Zielzeit je Platz: Sieger zuerst, Abstände 0,25–0,5 s
      const finish = {};
      order.forEach((idx, place) => { finish[idx] = RACE_MS - 900 + place * (250 + Math.random() * 250); });
      const wobble = runners.map(() => [Math.random() * 6, 0.6 + Math.random() * 0.8]);
      const t0 = performance.now();
      let lastTick = 0;
      const step = (now) => {
        if (!alive) return resolve();
        const t = now - t0;
        runners.forEach((r, i) => {
          const k = Math.min(1, t / finish[i]);
          const wob = k < 1 ? Math.sin(t / 300 * wobble[i][1] + wobble[i][0]) * 0.02 * (1 - k) : 0;
          const x = Math.min(1, Math.max(0, k + wob));
          r.style.left = `calc(${x * 100}% - ${x * 44}px)`;
        });
        if (t - lastTick > 180) { lastTick = t; sfx.tick(); }
        if (t < RACE_MS + 1200) raf = requestAnimationFrame(step); else resolve();
      };
      raf = requestAnimationFrame(step);
    });
  }

  async function race() {
    if (busy) return;
    busy = true;
    raceBtn.disabled = newBtn.disabled = true;
    bet.setDisabled(true);
    msg.className = 'result-msg';
    msg.textContent = 'Und los geht’s!';
    try {
      const r = await ctx.post('/api/games/horses/race', { cardId: card.id, horse: pick, bet: bet.value });
      ctx.setBalance(r.balance - r.payout);
      sfx.spin();
      await animate(r.order);
      if (!alive) return;
      ctx.setBalance(r.balance);
      const w = r.horses[r.winner];
      track.querySelector(`[data-r="${r.winner}"]`)?.classList.add('winner');
      if (r.payout > 0) {
        msg.className = 'result-msg win';
        msg.textContent = `🏆 ${w.name} gewinnt! +${fmt(r.payout - r.bet)} Chips`;
        celebrate(r.payout, r.bet);
      } else {
        msg.className = 'result-msg lose';
        msg.textContent = `🏆 ${w.name} gewinnt – dein Pferd ${r.horses[r.pick].name} wurde ${r.order.indexOf(r.pick) + 1}.`;
        sfx.lose();
      }
      await sleep(1800);
      if (!alive) return;
      card = r.next;
      paintCard();
    } catch (e) {
      ctx.toast(e.message, 'err');
      card = await ctx.post('/api/games/horses/card');
      paintCard();
    } finally {
      busy = false;
      raceBtn.disabled = newBtn.disabled = false;
      bet.setDisabled(false);
    }
  }

  raceBtn.addEventListener('click', race);
  newBtn.addEventListener('click', async () => {
    if (busy) return;
    card = await ctx.post('/api/games/horses/shuffle');
    sfx.chip();
    paintCard();
  });
  return () => { alive = false; cancelAnimationFrame(raf); };
}
