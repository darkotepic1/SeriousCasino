// Craps – Frontend.
import { h, fmt, celebrate } from '../ui.js';
import { sfx } from '../sound.js';
import { rollDice, dieEl } from '../dice-face.js';
import { chipTable } from '../chip-table.js';

const LINE = ['pass', 'dont'];
const ONE = ['field', 'any7', 'anycraps'];
const LABEL = { pass: 'Pass Line', dont: "Don't Pass", field: 'Field', any7: 'Any 7', anycraps: 'Any Craps' };

export default async function mount(root, ctx) {
  let alive = true, busy = false;
  let running = false, point = null;

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <div class="kv"><span>Einsatz auf dem Tisch</span><span class="cr-total">0</span></div>
      <div class="row" style="flex-wrap:wrap"><button class="btn btn-sm" data-c="undo">↶ Zurück</button><button class="btn btn-sm" data-c="clear">Leeren</button></div>
      <button class="btn btn-gold btn-big roll-btn">WÜRFELN</button>
      <div class="muted" style="font-size:.8rem;line-height:1.5">
        <b>Pass Line:</b> 1. Wurf 7/11 gewinnt, 2/3/12 verliert, sonst zählt der „Point“ – er muss vor der 7 nochmal fallen.<br>
        <b>Don't Pass:</b> genau umgekehrt (12 im 1. Wurf = unentschieden).<br>
        <b>Ein-Wurf-Wetten</b> gelten nur für den nächsten Wurf.
      </div>
    </div>
    <div class="game-stage">
      <div class="felt craps-table">
        <div class="craps-top">
          <div class="craps-dice"></div>
          <div class="craps-info"><div class="craps-point">COME-OUT</div><div class="craps-history"></div></div>
        </div>
        <div class="result-msg"></div>
        <div class="craps-spots">
          <button class="ct-spot cs-pass" data-k="pass"><b>PASS LINE</b><small>1:1</small></button>
          <button class="ct-spot cs-dont" data-k="dont"><b>DON'T PASS</b><small>1:1 · 12 = Push</small></button>
          <button class="ct-spot cs-field" data-k="field"><b>FIELD</b><small>2 · 3 · 4 · 9 · 10 · 11 · 12 — 2 zahlt 2:1, 12 zahlt 3:1, sonst 1:1</small></button>
          <button class="ct-spot cs-any7" data-k="any7"><b>ANY 7</b><small>4:1</small></button>
          <button class="ct-spot cs-craps" data-k="anycraps"><b>ANY CRAPS</b><small>2 · 3 · 12 — 7:1</small></button>
        </div>
      </div>
    </div></div>`);
  root.appendChild(el);

  const chip = ctx.bet({ game: 'craps', initial: 10, label: 'Chip-Wert' });
  el.querySelector('.bet-slot').appendChild(chip.el);
  const spots = new Map([...el.querySelectorAll('[data-k]')].map((s) => [s.dataset.k, s]));
  const totalEl = el.querySelector('.cr-total');
  const rollBtn = el.querySelector('.roll-btn');
  const diceBox = el.querySelector('.craps-dice');
  const pointEl = el.querySelector('.craps-point');
  const histEl = el.querySelector('.craps-history');
  const msg = el.querySelector('.result-msg');
  diceBox.replaceChildren(dieEl(6), dieEl(1));
  const history = [];

  const table = chipTable({
    spots, getChip: () => chip.value, getBalance: ctx.getBalance, toast: ctx.toast,
    locked: (k) => running && LINE.includes(k),
    onChange: (t) => { totalEl.textContent = fmt(t); paintBtn(); },
  });

  function paintBtn() {
    rollBtn.disabled = busy || (!running && table.total() === 0);
    rollBtn.textContent = running ? 'WEITERWÜRFELN' : 'WÜRFELN';
    pointEl.textContent = point ? `POINT: ${point}` : 'COME-OUT';
    pointEl.classList.toggle('on', !!point);
  }

  el.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
    if (busy) return;
    if (b.dataset.c === 'undo') table.undo();
    else table.clear(running ? ONE : null);
  }));

  async function roll() {
    if (busy) return;
    busy = true;
    table.setDisabled(true);
    chip.setDisabled(true);
    paintBtn();
    table.highlight([]);
    try {
      const bets = Object.fromEntries([...table.bets].filter(([k]) => running ? ONE.includes(k) : true));
      const r = await ctx.post(`/api/games/craps/${running ? 'roll' : 'start'}`, bets);
      ctx.setBalance(r.balance - r.payout);
      await rollDice(diceBox, r.dice, () => alive);
      if (!alive) return;
      ctx.setBalance(r.balance);
      history.unshift(r.sum);
      if (history.length > 12) history.pop();
      histEl.innerHTML = history.map((s) => `<span class="${s === 7 ? 'seven' : ''}">${s}</span>`).join('');
      // Gewonnene Felder hervorheben, abgerechnete Einsätze vom Tisch nehmen
      table.highlight(r.results.filter((x) => x.payout > 0).map((x) => x.bet));
      running = r.running;
      point = r.point;
      table.clear(running ? ONE : null);
      const won = r.results.filter((x) => x.payout > 0).map((x) => (x.payout === x.amount ? `${LABEL[x.bet]} (Einsatz zurück)` : `${LABEL[x.bet]} +${fmt(x.payout - x.amount)}`));
      const lost = r.results.filter((x) => x.payout === 0).map((x) => LABEL[x.bet]);
      let text = `Gewürfelt: ${r.sum}. `;
      if (r.comeOut && r.running) text += `Point ist ${r.point} – würfle die ${r.point} vor der 7!`;
      if (won.length) text += ` Gewonnen: ${won.join(', ')}.`;
      if (lost.length) text += ` Verloren: ${lost.join(', ')}.`;
      msg.className = 'result-msg ' + (won.length ? 'win' : lost.length ? 'lose' : '');
      msg.textContent = text;
      if (r.payout > 0) celebrate(r.payout, Math.max(1, r.results.reduce((a, x) => a + x.amount, 0)));
      else if (lost.length) sfx.lose();
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

  const st = await ctx.post('/api/games/craps/state');
  if (st.running) {
    running = true;
    point = st.point;
    if (st.pass) table.bets.set('pass', st.pass);
    if (st.dont) table.bets.set('dont', st.dont);
  }
  table.paint();
  return () => { alive = false; };
}
