// Schere-Stein-Papier – Frontend.
import { h, fmt, sleep, celebrate } from '../ui.js';
import { sfx } from '../sound.js';

const ICON = { rock: '✊', paper: '✋', scissors: '✌️' };
const NAME = { rock: 'Stein', paper: 'Papier', scissors: 'Schere' };

export default async function mount(root, ctx) {
  let alive = true, busy = false;
  const score = { win: 0, draw: 0, lose: 0 };

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <div class="kv"><span>Sieg zahlt</span><span class="gold">1,97×</span></div>
      <div class="kv"><span>Unentschieden</span><span>Einsatz zurück</span></div>
      <div class="kv"><span>Bilanz (S/U/N)</span><span class="rps-score">0 / 0 / 0</span></div>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">Stein schlägt Schere, Schere schlägt Papier, Papier schlägt Stein. Tasten: 1 = Stein, 2 = Papier, 3 = Schere.</p>
    </div>
    <div class="game-stage">
      <div class="panel rps-stage">
        <div class="rps-duel">
          <div class="rps-side"><div class="rps-label">Du</div><div class="rps-hand me">❔</div></div>
          <div class="rps-vs">VS</div>
          <div class="rps-side"><div class="rps-label">Haus</div><div class="rps-hand house">❔</div></div>
        </div>
        <div class="result-msg"></div>
        <div class="rps-choices">
          ${['rock', 'paper', 'scissors'].map((c) => `<button class="btn rps-btn" data-c="${c}"><span>${ICON[c]}</span>${NAME[c]}</button>`).join('')}
        </div>
      </div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'rps', initial: 100 });
  el.querySelector('.bet-slot').appendChild(bet.el);
  const me = el.querySelector('.me'), house = el.querySelector('.house');
  const msg = el.querySelector('.result-msg');
  const scoreEl = el.querySelector('.rps-score');
  const btns = [...el.querySelectorAll('.rps-btn')];

  async function play(choice) {
    if (busy) return;
    busy = true;
    btns.forEach((b) => (b.disabled = true));
    msg.className = 'result-msg';
    try {
      const r = await ctx.post('/api/games/rps/play', { bet: bet.value, choice });
      ctx.setBalance(r.balance - r.payout);
      me.textContent = house.textContent = '✊';
      me.classList.add('shake'); house.classList.add('shake');
      for (const word of ['Schere …', 'Stein …', 'Papier!']) {
        if (!alive) return;
        msg.textContent = word;
        sfx.tick();
        await sleep(330);
      }
      me.classList.remove('shake'); house.classList.remove('shake');
      me.textContent = ICON[r.choice];
      house.textContent = ICON[r.house];
      ctx.setBalance(r.balance);
      score[r.result]++;
      scoreEl.textContent = `${score.win} / ${score.draw} / ${score.lose}`;
      if (r.result === 'win') {
        msg.className = 'result-msg win';
        msg.textContent = `${NAME[r.choice]} schlägt ${NAME[r.house]}! +${fmt(r.payout - r.bet)}`;
        celebrate(r.payout, r.bet);
      } else if (r.result === 'draw') {
        msg.className = 'result-msg push';
        msg.textContent = 'Unentschieden – Einsatz zurück.';
        sfx.coin();
      } else {
        msg.className = 'result-msg lose';
        msg.textContent = `${NAME[r.house]} schlägt ${NAME[r.choice]}. −${fmt(r.bet)}`;
        sfx.lose();
      }
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      btns.forEach((b) => (b.disabled = false));
    }
  }

  btns.forEach((b) => b.addEventListener('click', () => play(b.dataset.c)));
  const onKey = (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    const c = { 1: 'rock', 2: 'paper', 3: 'scissors' }[e.key];
    if (c) play(c);
  };
  document.addEventListener('keydown', onKey);
  return () => { alive = false; document.removeEventListener('keydown', onKey); };
}
