// Sic Bo – Frontend.
import { h, fmt, celebrate } from '../ui.js';
import { sfx } from '../sound.js';
import { rollDice, dieEl } from '../dice-face.js';
import { chipTable } from '../chip-table.js';

export default async function mount(root, ctx) {
  const { totals } = await ctx.get('/api/games/sicbo/info');
  let alive = true, busy = false;
  const pips = (v) => `<span class="sb-mini">${dieEl(v).outerHTML}</span>`;

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <div class="kv"><span>Einsatz auf dem Tisch</span><span class="sb-total">0</span></div>
      <div class="row" style="flex-wrap:wrap"><button class="btn btn-sm" data-c="undo">↶ Zurück</button><button class="btn btn-sm" data-c="double">2× alles</button><button class="btn btn-sm" data-c="clear">Leeren</button></div>
      <button class="btn btn-gold btn-big roll-btn">WÜRFELN</button>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">Drei Würfel. Klein/Groß/Gerade/Ungerade verlieren bei drei gleichen Würfeln. Einzelzahl zahlt 1:1 pro passendem Würfel.</p>
    </div>
    <div class="game-stage">
      <div class="felt sb-table">
        <div class="sb-dice"></div>
        <div class="result-msg"></div>
        <div class="sb-board">
          <div class="sb-row sb-main">
            <button class="ct-spot" data-k="small"><b>KLEIN</b><small>4–10 · 1:1</small></button>
            <button class="ct-spot" data-k="odd"><b>UNGERADE</b><small>1:1</small></button>
            <button class="ct-spot" data-k="anytriple"><b>BELIEBIGER DREIER</b><small>30:1</small></button>
            <button class="ct-spot" data-k="even"><b>GERADE</b><small>1:1</small></button>
            <button class="ct-spot" data-k="big"><b>GROSS</b><small>11–17 · 1:1</small></button>
          </div>
          <div class="sb-label">Summe der drei Würfel</div>
          <div class="sb-row sb-totals">${Object.keys(totals).map((t) => `<button class="ct-spot" data-k="total:${t}"><b>${t}</b><small>${totals[t]}:1</small></button>`).join('')}</div>
          <div class="sb-label">Einzelzahl (1:1 · 2:1 · 3:1)</div>
          <div class="sb-row sb-six">${[1, 2, 3, 4, 5, 6].map((v) => `<button class="ct-spot" data-k="single:${v}">${pips(v)}</button>`).join('')}</div>
          <div class="sb-label">Bestimmter Zweier (10:1)</div>
          <div class="sb-row sb-six">${[1, 2, 3, 4, 5, 6].map((v) => `<button class="ct-spot" data-k="double:${v}">${pips(v)}${pips(v)}</button>`).join('')}</div>
          <div class="sb-label">Bestimmter Dreier (180:1)</div>
          <div class="sb-row sb-six">${[1, 2, 3, 4, 5, 6].map((v) => `<button class="ct-spot" data-k="triple:${v}">${pips(v)}${pips(v)}${pips(v)}</button>`).join('')}</div>
        </div>
      </div>
    </div></div>`);
  root.appendChild(el);

  const chip = ctx.bet({ game: 'sicbo', initial: 10, label: 'Chip-Wert' });
  el.querySelector('.bet-slot').appendChild(chip.el);
  const spots = new Map([...el.querySelectorAll('[data-k]')].map((s) => [s.dataset.k, s]));
  const totalEl = el.querySelector('.sb-total');
  const rollBtn = el.querySelector('.roll-btn');
  const diceBox = el.querySelector('.sb-dice');
  const msg = el.querySelector('.result-msg');
  diceBox.replaceChildren(dieEl(1), dieEl(3), dieEl(5));

  const table = chipTable({
    spots, getChip: () => chip.value, getBalance: ctx.getBalance, toast: ctx.toast,
    onChange: (t) => { totalEl.textContent = fmt(t); rollBtn.disabled = busy || !t; },
  });
  el.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
    if (busy) return;
    if (b.dataset.c === 'undo') table.undo();
    else if (b.dataset.c === 'double') table.double();
    else table.clear();
    sfx.click();
  }));

  async function roll() {
    if (busy || !table.total()) return;
    busy = true;
    rollBtn.disabled = true;
    table.setDisabled(true);
    chip.setDisabled(true);
    table.highlight([]);
    try {
      const bets = [...table.bets].map(([k, amount]) => {
        const [type, v] = k.split(':');
        return { type, value: v === undefined ? undefined : Number(v), amount };
      });
      const r = await ctx.post('/api/games/sicbo/roll', { bets });
      ctx.setBalance(r.balance - r.payout);
      await rollDice(diceBox, r.dice, () => alive);
      if (!alive) return;
      ctx.setBalance(r.balance);
      table.highlight(r.results.filter((x) => x.won).map((x) => (x.value === null || x.value === undefined ? x.type : `${x.type}:${x.value}`)));
      const net = r.payout - r.totalBet;
      msg.className = 'result-msg ' + (net > 0 ? 'win' : r.payout > 0 ? '' : 'lose');
      msg.textContent = `${r.dice.join(' · ')} = ${r.sum}  —  ${r.payout ? `Auszahlung ${fmt(r.payout)} (${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))})` : `−${fmt(r.totalBet)}`}`;
      if (r.payout > 0) celebrate(r.payout, r.totalBet); else sfx.lose();
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      table.setDisabled(false);
      chip.setDisabled(false);
      table.paint();
    }
  }
  rollBtn.addEventListener('click', roll);
  table.paint();
  return () => { alive = false; };
}
