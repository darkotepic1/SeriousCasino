// Keno – Frontend.
import { h, fmt, sleep, celebrate } from '../ui.js';
import { sfx } from '../sound.js';

export default async function mount(root, ctx) {
  const info = await ctx.get('/api/games/keno/info');
  let alive = true, busy = false;
  let picks = new Set();
  try { (JSON.parse(localStorage.getItem('casino.keno.picks')) || []).forEach((n) => picks.add(n)); } catch { /* egal */ }

  const el = h(`<div class="game-layout">
    <div class="game-controls panel">
      <div class="bet-slot"></div>
      <div class="row"><button class="btn btn-sm" data-c="random">🎲 Zufällig</button><button class="btn btn-sm" data-c="clear">Leeren</button></div>
      <button class="btn btn-gold btn-big play-btn">SPIELEN</button>
      <div class="kv"><span>Gewählt</span><span class="k-count"></span></div>
      <div class="keno-pay"></div>
      <p class="muted" style="margin:0;font-size:.8rem;line-height:1.5">Wähle 1–10 Zahlen. Es werden 10 von 40 Zahlen gezogen – je mehr Treffer, desto mehr Gewinn.</p>
    </div>
    <div class="game-stage">
      <div class="panel keno-board">${Array.from({ length: info.numbers }, (_, i) => `<button class="keno-n" data-n="${i + 1}">${i + 1}</button>`).join('')}</div>
      <div class="result-msg"></div>
    </div></div>`);
  root.appendChild(el);

  const bet = ctx.bet({ game: 'keno', initial: 100 });
  el.querySelector('.bet-slot').appendChild(bet.el);
  const cells = new Map([...el.querySelectorAll('.keno-n')].map((b) => [Number(b.dataset.n), b]));
  const payEl = el.querySelector('.keno-pay');
  const countEl = el.querySelector('.k-count');
  const msg = el.querySelector('.result-msg');
  const playBtn = el.querySelector('.play-btn');

  function save() { try { localStorage.setItem('casino.keno.picks', JSON.stringify([...picks])); } catch { /* egal */ } }

  function paint(hitCount = null) {
    cells.forEach((b, n) => b.classList.toggle('picked', picks.has(n)));
    countEl.textContent = `${picks.size} / ${info.maxPicks}`;
    const t = info.tables[picks.size];
    payEl.innerHTML = t ? `<table class="tbl"><thead><tr><th>Treffer</th><th class="num">Gewinn</th></tr></thead><tbody>${
      t.map((m, k) => (m > 0 ? `<tr class="${k === hitCount ? 'hl' : ''}"><td>${k}</td><td class="num gold">${m.toLocaleString('de-DE')}×</td></tr>` : '')).reverse().join('')}</tbody></table>` : '<p class="muted" style="margin:0">Wähle Zahlen auf dem Brett.</p>';
    playBtn.disabled = busy || !picks.size;
  }

  function clearDraw() {
    cells.forEach((b) => b.classList.remove('drawn', 'hit'));
  }

  cells.forEach((b, n) => b.addEventListener('click', () => {
    if (busy) return;
    clearDraw();
    if (picks.has(n)) picks.delete(n);
    else if (picks.size < info.maxPicks) picks.add(n);
    else return ctx.toast(`Maximal ${info.maxPicks} Zahlen.`, 'err');
    sfx.click();
    save();
    paint();
  }));
  el.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
    if (busy) return;
    clearDraw();
    if (b.dataset.c === 'clear') picks.clear();
    else {
      const n = picks.size || 5;
      const all = [...cells.keys()].sort(() => Math.random() - 0.5);
      picks = new Set(all.slice(0, n));
    }
    sfx.chip();
    save();
    paint();
  }));

  async function play() {
    if (busy || !picks.size) return;
    busy = true;
    paint();
    clearDraw();
    msg.className = 'result-msg';
    msg.textContent = '';
    try {
      const r = await ctx.post('/api/games/keno/play', { bet: bet.value, picks: [...picks] });
      ctx.setBalance(r.balance - r.payout);
      for (const n of r.drawn) {
        if (!alive) return;
        const b = cells.get(n);
        b.classList.add('drawn');
        if (picks.has(n)) { b.classList.add('hit'); sfx.gem(); } else sfx.tick();
        await sleep(140);
      }
      ctx.setBalance(r.balance);
      paint(r.hits.length);
      if (r.payout > 0) {
        msg.className = 'result-msg ' + (r.payout > r.bet ? 'win' : 'push');
        msg.textContent = `${r.hits.length} Treffer – ${r.multiplier.toLocaleString('de-DE')}× = ${fmt(r.payout)} Chips`;
        celebrate(r.payout, r.bet);
      } else {
        msg.className = 'result-msg lose';
        msg.textContent = `${r.hits.length} Treffer – leider kein Gewinn`;
        sfx.lose();
      }
    } catch (e) {
      ctx.toast(e.message, 'err');
    } finally {
      busy = false;
      paint(null);
    }
  }
  playBtn.addEventListener('click', play);
  const onKey = (e) => {
    if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName)) { e.preventDefault(); play(); }
  };
  document.addEventListener('keydown', onKey);
  paint();
  return () => { alive = false; document.removeEventListener('keydown', onKey); };
}
