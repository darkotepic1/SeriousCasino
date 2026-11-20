// Baccarat – Frontend.
import { h, fmt, sleep, celebrate, cardEl } from '../ui.js';
import { sfx } from '../sound.js';

const NAMES = { player: 'Spieler', banker: 'Bank', tie: 'Unentschieden' };

export default async function mount(root, ctx) {
  let alive = true, busy = false;
  let bets = { player: 0, banker: 0, tie: 0 };
  const road = [];

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <p class="muted" style="margin:0;font-size:.8rem">Klick auf ein Wettfeld legt einen Chip.</p>
      <div class="kv"><span>Einsatz gesamt</span><span class="b-total">0</span></div>
      <div class="row"><button class="btn btn-sm" data-c="clear">Leeren</button><button class="btn btn-sm" data-c="double">2× alles</button></div>
      <button class="btn btn-gold btn-big deal-btn">KARTEN GEBEN</button>
      <div class="muted" style="font-size:.8rem;line-height:1.5">Wer näher an 9 ist, gewinnt. Bildkarten und 10 zählen 0, Ass zählt 1.<br>Spieler 1:1 · Bank 0,95:1 · Unentschieden 8:1</div>
    </div>
    <div class="game-stage">
      <div class="felt bac-table">
        <div class="bac-hands">
          <div class="bac-hand" data-h="player"><div class="bac-label">SPIELER <span class="bj-val"></span></div><div class="bj-cards"></div></div>
          <div class="bac-hand" data-h="banker"><div class="bac-label">BANK <span class="bj-val"></span></div><div class="bj-cards"></div></div>
        </div>
        <div class="result-msg"></div>
        <div class="bac-spots">
          <button class="bac-spot player" data-b="player"><b>SPIELER</b><small>1:1</small><span class="bac-chip"></span></button>
          <button class="bac-spot tie" data-b="tie"><b>UNENTSCHIEDEN</b><small>8:1</small><span class="bac-chip"></span></button>
          <button class="bac-spot banker" data-b="banker"><b>BANK</b><small>0,95:1</small><span class="bac-chip"></span></button>
        </div>
      </div>
      <div class="bac-road"></div>
    </div></div>`);
  root.appendChild(el);

  const chip = ctx.bet({ game: 'baccarat', initial: 100, label: 'Chip-Wert' });
  el.querySelector('.bet-slot').appendChild(chip.el);
  const totalEl = el.querySelector('.b-total');
  const dealBtn = el.querySelector('.deal-btn');
  const msg = el.querySelector('.result-msg');
  const roadEl = el.querySelector('.bac-road');
  const hands = Object.fromEntries([...el.querySelectorAll('[data-h]')].map((x) => [x.dataset.h, x]));
  const spots = Object.fromEntries([...el.querySelectorAll('[data-b]')].map((x) => [x.dataset.b, x]));
  const total = () => bets.player + bets.banker + bets.tie;

  function paintBets() {
    for (const [k, s] of Object.entries(spots)) {
      const c = s.querySelector('.bac-chip');
      c.textContent = bets[k] ? fmt(bets[k]) : '';
      c.classList.toggle('on', !!bets[k]);
    }
    totalEl.textContent = fmt(total());
    dealBtn.disabled = busy || !total();
  }

  for (const [k, s] of Object.entries(spots)) {
    s.addEventListener('click', () => {
      if (busy) return;
      const add = Math.max(1, chip.value);
      if (total() + add > ctx.getBalance()) return ctx.toast('Nicht genug Chips.', 'err');
      bets[k] += add;
      sfx.chip();
      paintBets();
    });
  }
  el.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
    if (busy) return;
    if (b.dataset.c === 'clear') bets = { player: 0, banker: 0, tie: 0 };
    else {
      if (total() * 2 > ctx.getBalance()) return ctx.toast('Nicht genug Chips.', 'err');
      bets = { player: bets.player * 2, banker: bets.banker * 2, tie: bets.tie * 2 };
    }
    sfx.click();
    paintBets();
  }));

  const val = (c) => (c.r === 14 ? 1 : c.r >= 10 ? 0 : c.r);
  const sum = (cards) => cards.reduce((a, c) => a + val(c), 0) % 10;

  async function deal() {
    if (busy || !total()) return;
    busy = true;
    paintBets();
    chip.setDisabled(true);
    msg.className = 'result-msg';
    msg.textContent = '';
    Object.values(hands).forEach((x) => { x.classList.remove('win'); x.querySelector('.bj-cards').innerHTML = ''; x.querySelector('.bj-val').textContent = ''; });
    Object.values(spots).forEach((s) => s.classList.remove('win'));
    try {
      const r = await ctx.post('/api/games/baccarat/play', bets);
      ctx.setBalance(r.balance - r.payout);
      const order = [['player', 0], ['banker', 0], ['player', 1], ['banker', 1]];
      if (r.player[2]) order.push(['player', 2]);
      if (r.banker[2]) order.push(['banker', 2]);
      const shown = { player: [], banker: [] };
      for (const [side, i] of order) {
        if (!alive) return;
        if (i === 2) await sleep(400);
        const card = r[side][i];
        shown[side].push(card);
        hands[side].querySelector('.bj-cards').appendChild(cardEl(card, 'deal'));
        hands[side].querySelector('.bj-val').textContent = sum(shown[side]);
        sfx.card();
        await sleep(450);
      }
      ctx.setBalance(r.balance);
      if (r.winner !== 'tie') hands[r.winner].classList.add('win');
      spots[r.winner].classList.add('win');
      road.unshift(r.winner);
      if (road.length > 30) road.pop();
      roadEl.innerHTML = road.map((w) => `<span class="road-${w}">${w === 'player' ? 'S' : w === 'banker' ? 'B' : 'U'}</span>`).join('');
      const net = r.payout - r.totalBet;
      const head = r.winner === 'tie' ? `Unentschieden ${r.playerTotal}:${r.bankerTotal}` : `${NAMES[r.winner]} gewinnt ${Math.max(r.playerTotal, r.bankerTotal)}:${Math.min(r.playerTotal, r.bankerTotal)}`;
      msg.className = 'result-msg ' + (net > 0 ? 'win' : net < 0 ? 'lose' : 'push');
      msg.textContent = `${head} · ${net > 0 ? '+' + fmt(net) : net < 0 ? '−' + fmt(-net) : '±0'}`;
      if (net > 0) celebrate(r.payout, r.totalBet); else if (net < 0) sfx.lose();
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      chip.setDisabled(false);
      paintBets();
    }
  }
  dealBtn.addEventListener('click', deal);
  paintBets();
  return () => { alive = false; };
}
