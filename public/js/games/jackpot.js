// Jackpot – alle zahlen in einen Topf, das Rad zieht den Gewinner (Chance = Anteil am Topf).
import { h, esc, fmt, sleep, celebrate } from '../ui.js';
import { sfx } from '../sound.js';

function donut(entries) {
  if (!entries.length) return '<svg viewBox="0 0 300 300" class="jp-svg"><circle cx="150" cy="150" r="120" fill="none" stroke="#22364a" stroke-width="44"/></svg>';
  const R = 120, C = 2 * Math.PI * R;
  let off = 0;
  const parts = entries.map((e) => {
    const len = e.chance * C;
    const s = `<circle cx="150" cy="150" r="${R}" fill="none" stroke="${e.color}" stroke-width="44" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 150 150)"/>`;
    off += len;
    return s;
  });
  return `<svg viewBox="0 0 300 300" class="jp-svg">${parts.join('')}</svg>`;
}

export default async function mount(root, ctx) {
  let alive = true, pollTimer = 0, st = null, lastRound = null, lastPhase = null, busy = false, rot = 0, lastKey = '';

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <button class="btn btn-gold btn-big dep-btn">IN DEN TOPF</button>
      <button class="btn btn-sm wd-btn hidden">Einzahlung zurücknehmen</button>
      <div class="kv"><span>Deine Chance</span><span class="jp-mychance gold">–</span></div>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">Alle zahlen in einen Topf. Sind mindestens 2 Spieler dabei, läuft ein 30-Sekunden-Countdown. Dann dreht das Rad: Je mehr du eingezahlt hast, desto größer dein Stück – und deine Chance auf den <b>ganzen Topf</b>.</p>
    </div>
    <div class="game-stage">
      <div class="jp-top">
        <div class="jp-wheel"><div class="jp-pointer"></div><div class="jp-rot"></div><div class="jp-center"><small>Topf</small><b class="jp-pot">0</b><span class="jp-timer"></span></div></div>
        <div class="jp-side">
          <div class="result-msg"></div>
          <div class="panel jp-list"></div>
          <div class="jp-hist"></div>
        </div>
      </div>
    </div></div>`);
  root.appendChild(el);

  const amount = ctx.bet({ game: 'jackpot', initial: 500, min: 10, label: 'Einzahlung' });
  el.querySelector('.bet-slot').appendChild(amount.el);
  const depBtn = el.querySelector('.dep-btn'), wdBtn = el.querySelector('.wd-btn');
  const rotEl = el.querySelector('.jp-rot');
  const potEl = el.querySelector('.jp-pot'), timerEl = el.querySelector('.jp-timer');
  const listEl = el.querySelector('.jp-list'), histEl = el.querySelector('.jp-hist');
  const msg = el.querySelector('.result-msg');
  const chanceEl = el.querySelector('.jp-mychance');

  function paint(s) {
    const key = s.entries.map((e) => e.name + e.amount).join('|');
    if (key !== lastKey && s.phase === 'open') { rotEl.innerHTML = donut(s.entries); lastKey = key; }
    potEl.textContent = fmt(s.pot);
    timerEl.textContent = s.phase === 'open' ? (s.timeLeft !== null ? `${Math.ceil(s.timeLeft / 1000)} s` : s.entries.length ? 'wartet auf 2. Spieler' : 'leer') : s.phase === 'drawing' ? 'Ziehung …' : '';
    const mine = s.entries.find((e) => e.me);
    chanceEl.textContent = mine ? `${(mine.chance * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} % (${fmt(mine.amount)})` : '–';
    listEl.innerHTML = `<h3 style="margin:0 0 8px">Im Topf (${s.entries.length})</h3>` + (s.entries.map((e) => `<div class="lc-row ${e.me ? 'me' : ''}"><span class="lc-name"><i class="jp-dot" style="background:${e.color}"></i>${esc(e.name)}</span><span class="lc-bet"><span class="chip-icon"></span>${fmt(e.amount)}</span><span class="muted">${(e.chance * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %</span></div>`).join('')
      || '<p class="muted" style="margin:0">Noch leer – sei der Erste!</p>');
    histEl.innerHTML = s.history.length ? `<h3 style="margin:14px 0 6px">Letzte Gewinner</h3>${s.history.map((x) => `<div class="kv"><span>🏆 ${esc(x.name)} <small class="muted">(${x.chance.toLocaleString('de-DE')} % Chance)</small></span><span class="gold">${fmt(x.pot)}</span></div>`).join('')}` : '';
    depBtn.disabled = busy || s.phase !== 'open';
    wdBtn.classList.toggle('hidden', !(s.phase === 'open' && s.entries.length === 1 && mine));
  }

  let spunRound = null;
  async function spin(s) {
    spunRound = s.id;
    rotEl.innerHTML = donut(s.entries);
    const target = 360 * 6 - s.ticket * 360;
    rot = Math.ceil(rot / 360) * 360 + target;
    rotEl.style.transition = `transform ${Math.max(1000, s.timeLeft - 300)}ms cubic-bezier(.12,.6,.1,1)`;
    rotEl.style.transform = `rotate(${rot}deg)`;
    let t = 0, gap = 40;
    while (t < s.timeLeft - 500 && alive) { await sleep(gap); t += gap; gap *= 1.07; sfx.tick(); }
  }

  function onState(s) {
    const changed = s.id !== lastRound || s.phase !== lastPhase;
    if (s.balance !== null && s.balance !== undefined && !busy) ctx.setBalance(s.balance);
    if (changed) {
      if (s.phase === 'open') { msg.className = 'result-msg'; msg.textContent = ''; rotEl.style.transition = 'none'; rotEl.style.transform = `rotate(${(rot = 0)}deg)`; lastKey = ''; }
      if (s.phase === 'drawing') { msg.className = 'result-msg'; msg.textContent = 'Das Rad dreht sich …'; spin(s); }
      if (s.phase === 'result') {
        // Ziehung verpasst (z. B. Tab im Hintergrund)? Dann Rad direkt auf den Gewinner stellen
        if (spunRound !== s.id && s.ticket !== null) {
          rotEl.innerHTML = donut(s.entries);
          rotEl.style.transition = 'none';
          rotEl.style.transform = `rotate(${(rot = 360 - s.ticket * 360)}deg)`;
        }
        const w = s.entries[s.winner];
        if (w?.me) { msg.className = 'result-msg win'; msg.textContent = `🏆 Du gewinnst ${fmt(s.pot)} Chips!`; celebrate(s.pot, w.amount); }
        else { msg.className = 'result-msg ' + (s.entries.some((e) => e.me) ? 'lose' : ''); msg.textContent = `🏆 ${w?.name} gewinnt ${fmt(s.pot)} Chips`; if (s.entries.some((e) => e.me)) sfx.lose(); }
      }
    }
    st = s;
    lastRound = s.id;
    lastPhase = s.phase;
    paint(s);
  }

  depBtn.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    try { const s = await ctx.post('/api/live/jackpot/deposit', { amount: amount.value }); sfx.coin(); busy = false; onState(s); } catch (e) { busy = false; ctx.toast(e.message, 'err'); }
  });
  wdBtn.addEventListener('click', async () => {
    try { onState(await ctx.post('/api/live/jackpot/withdraw')); sfx.click(); } catch (e) { ctx.toast(e.message, 'err'); }
  });

  async function poll() {
    if (!alive) return;
    try { onState(await ctx.get('/api/live/jackpot/state')); } catch { /* nächster Versuch */ }
    pollTimer = setTimeout(poll, 500);
  }
  await poll();
  return () => { alive = false; clearTimeout(pollTimer); };
}
