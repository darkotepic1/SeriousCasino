// Drache & Tiger – Frontend.
import { h, fmt, sleep, celebrate, cardEl } from '../ui.js';
import { sfx } from '../sound.js';
import { chipTable } from '../chip-table.js';

export default async function mount(root, ctx) {
  let alive = true, busy = false;
  const road = [];

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <div class="kv"><span>Einsatz gesamt</span><span class="dt-total">0</span></div>
      <div class="row"><button class="btn btn-sm" data-c="clear">Leeren</button><button class="btn btn-sm" data-c="double">2× alles</button></div>
      <button class="btn btn-gold btn-big deal-btn">KARTEN GEBEN</button>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">Eine Karte für den Drachen, eine für den Tiger – die höhere gewinnt (Ass = 1, König = 13). Drache/Tiger 1:1, Unentschieden 11:1. Bei Gleichstand gibt es auf Drache/Tiger die Hälfte zurück.</p>
    </div>
    <div class="game-stage">
      <div class="felt dt-table">
        <div class="dt-hands">
          <div class="dt-hand" data-h="dragon"><div class="dt-name">🐉 DRACHE</div><div class="bj-cards dt-card"></div></div>
          <div class="dt-hand" data-h="tiger"><div class="dt-name">🐅 TIGER</div><div class="bj-cards dt-card"></div></div>
        </div>
        <div class="result-msg"></div>
        <div class="bac-spots">
          <button class="ct-spot dt-dragon" data-k="dragon"><b>DRACHE</b><small>1:1</small></button>
          <button class="ct-spot dt-tie" data-k="tie"><b>UNENTSCHIEDEN</b><small>11:1</small></button>
          <button class="ct-spot dt-tiger" data-k="tiger"><b>TIGER</b><small>1:1</small></button>
        </div>
      </div>
      <div class="bac-road dt-road"></div>
    </div></div>`);
  root.appendChild(el);

  const chip = ctx.bet({ game: 'dragontiger', initial: 100, label: 'Chip-Wert' });
  el.querySelector('.bet-slot').appendChild(chip.el);
  const spots = new Map([...el.querySelectorAll('[data-k]')].map((s) => [s.dataset.k, s]));
  const hands = Object.fromEntries([...el.querySelectorAll('[data-h]')].map((x) => [x.dataset.h, x]));
  const dealBtn = el.querySelector('.deal-btn');
  const totalEl = el.querySelector('.dt-total');
  const msg = el.querySelector('.result-msg');
  const roadEl = el.querySelector('.dt-road');
  Object.values(hands).forEach((x) => x.querySelector('.dt-card').replaceChildren(cardEl(null)));

  const table = chipTable({
    spots, getChip: () => chip.value, getBalance: ctx.getBalance, toast: ctx.toast,
    onChange: (t) => { totalEl.textContent = fmt(t); dealBtn.disabled = busy || !t; },
  });
  el.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
    if (busy) return;
    if (b.dataset.c === 'clear') table.clear(); else table.double();
  }));

  async function deal() {
    if (busy || !table.total()) return;
    busy = true;
    dealBtn.disabled = true;
    table.setDisabled(true);
    chip.setDisabled(true);
    table.highlight([]);
    Object.values(hands).forEach((x) => { x.classList.remove('win'); x.querySelector('.dt-card').replaceChildren(cardEl(null)); });
    msg.className = 'result-msg';
    msg.textContent = '';
    try {
      const r = await ctx.post('/api/games/dragontiger/play', Object.fromEntries(table.bets));
      ctx.setBalance(r.balance - r.payout);
      await sleep(250);
      hands.dragon.querySelector('.dt-card').replaceChildren(cardEl(r.dragon, 'flip')); sfx.card(); await sleep(500);
      hands.tiger.querySelector('.dt-card').replaceChildren(cardEl(r.tiger, 'flip')); sfx.card(); await sleep(350);
      if (!alive) return;
      ctx.setBalance(r.balance);
      if (r.winner !== 'tie') hands[r.winner].classList.add('win');
      table.highlight([r.winner]);
      road.unshift(r.winner);
      if (road.length > 30) road.pop();
      roadEl.innerHTML = road.map((w) => `<span class="road-${w === 'dragon' ? 'banker' : w === 'tiger' ? 'player' : 'tie'}">${w === 'dragon' ? 'D' : w === 'tiger' ? 'T' : 'U'}</span>`).join('');
      const net = r.payout - r.totalBet;
      const names = { dragon: 'Drache gewinnt', tiger: 'Tiger gewinnt', tie: 'Unentschieden' };
      msg.className = 'result-msg ' + (net > 0 ? 'win' : net < 0 ? 'lose' : 'push');
      msg.textContent = `${names[r.winner]} · ${net > 0 ? '+' + fmt(net) : net < 0 ? '−' + fmt(-net) : '±0'}`;
      if (net > 0) celebrate(r.payout, r.totalBet); else if (net < 0) sfx.lose();
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      table.setDisabled(false);
      chip.setDisabled(false);
      table.paint();
    }
  }
  dealBtn.addEventListener('click', deal);
  table.paint();
  return () => { alive = false; };
}
