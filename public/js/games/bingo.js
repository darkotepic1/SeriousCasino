// Schnell-Bingo – Frontend.
import { h, fmt, sleep, celebrate } from '../ui.js';
import { sfx } from '../sound.js';

export default async function mount(root, ctx) {
  const info = await ctx.get('/api/games/bingo/info');
  let alive = true, busy = false;
  let card = (await ctx.post('/api/games/bingo/card')).card;

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <button class="btn btn-gold btn-big play-btn">${info.draws} KUGELN ZIEHEN</button>
      <button class="btn btn-sm new-btn">🔄 Neue Karte</button>
      <table class="tbl bg-pay"><thead><tr><th>Fertige Linien</th><th class="num">Gewinn</th></tr></thead><tbody>
        ${info.pays.map((m, i) => (i ? `<tr data-l="${i}"><td>${i === info.pays.length - 1 ? i + ' oder mehr' : i}</td><td class="num gold">${m.toLocaleString('de-DE')}×</td></tr>` : '')).reverse().join('')}
      </tbody></table>
      <p class="muted" style="margin:0;font-size:.78rem;line-height:1.5">Linien: 5 Reihen, 5 Spalten und 2 Diagonalen. Das Feld in der Mitte ist frei.</p>
    </div>
    <div class="game-stage">
      <div class="bg-card">
        <div class="bg-head">${'BINGO'.split('').map((c) => `<span>${c}</span>`).join('')}</div>
        <div class="bg-grid"></div>
      </div>
      <div class="bg-balls"></div>
      <div class="result-msg"></div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'bingo', initial: 100 });
  el.querySelector('.bet-slot').appendChild(bet.el);
  const grid = el.querySelector('.bg-grid');
  const balls = el.querySelector('.bg-balls');
  const playBtn = el.querySelector('.play-btn');
  const newBtn = el.querySelector('.new-btn');
  const msg = el.querySelector('.result-msg');
  const payRows = [...el.querySelectorAll('[data-l]')];

  function paintCard() {
    grid.innerHTML = card.map((n, i) => `<div class="bg-cell ${n === 0 ? 'free marked' : ''}" data-i="${i}">${n === 0 ? '★' : n}</div>`).join('');
  }
  paintCard();
  const letter = (n) => 'BINGO'[Math.floor((n - 1) / 15)];

  async function play() {
    if (busy) return;
    busy = true;
    playBtn.disabled = newBtn.disabled = true;
    bet.setDisabled(true);
    paintCard();
    balls.innerHTML = '';
    payRows.forEach((r) => r.classList.remove('hl'));
    msg.className = 'result-msg';
    msg.textContent = '';
    try {
      const r = await ctx.post('/api/games/bingo/play', { bet: bet.value });
      ctx.setBalance(r.balance - r.payout);
      const pos = new Map(card.map((n, i) => [n, i]));
      for (const n of r.drawn) {
        if (!alive) return;
        balls.appendChild(h(`<span class="bg-ball b-${letter(n)}">${n}</span>`));
        const i = pos.get(n);
        if (i !== undefined) { grid.children[i].classList.add('marked', 'pop'); sfx.gem(); } else sfx.tick();
        await sleep(75);
      }
      for (const line of r.lines) line.forEach((i) => grid.children[i].classList.add('line'));
      ctx.setBalance(r.balance);
      const L = r.lines.length;
      payRows.forEach((row) => row.classList.toggle('hl', Number(row.dataset.l) === Math.min(L, info.pays.length - 1)));
      if (r.payout > 0) {
        msg.className = 'result-msg ' + (r.payout > r.bet ? 'win' : 'push');
        msg.textContent = `${L} Linie${L === 1 ? '' : 'n'}! ${r.multiplier.toLocaleString('de-DE')}× = ${fmt(r.payout)} Chips`;
        celebrate(r.payout, r.bet);
      } else {
        msg.className = 'result-msg lose';
        msg.textContent = 'Keine fertige Linie – knapp daneben?';
        sfx.lose();
      }
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      playBtn.disabled = newBtn.disabled = false;
      bet.setDisabled(false);
    }
  }

  playBtn.addEventListener('click', play);
  newBtn.addEventListener('click', async () => {
    if (busy) return;
    card = (await ctx.post('/api/games/bingo/newcard')).card;
    balls.innerHTML = '';
    msg.textContent = '';
    sfx.chip();
    paintCard();
  });
  return () => { alive = false; };
}
