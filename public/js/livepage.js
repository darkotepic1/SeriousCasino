// Live-Bereich (wer spielt gerade wo + große Gewinne), Cases öffnen und Case Battles.
import { h, esc, fmt, sleep, toast, celebrate, confetti, segmented } from './ui.js';
import { sfx } from './sound.js';
import { GAMES } from './app.js';

const PAGE_NAMES = { home: 'Startseite', live: 'Live', duels: 'Duelle', duel: 'Duell', cases: 'Cases', battle: 'Case Battle', stats: 'Statistik', leaderboard: 'Rangliste', settings: 'Einstellungen', admin: 'Admin' };
const whereName = (w) => GAMES.find((g) => g.id === w)?.name || PAGE_NAMES[w] || w;
const whereIcon = (w) => GAMES.find((g) => g.id === w)?.icon || { duels: '⚔️', duel: '⚔️', cases: '📦', battle: '📦', live: '🟢' }[w] || '🏠';
const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `vor ${s} s` : `vor ${Math.round(s / 60)} min`; };

// ===================== Live =====================
export async function live(root, ctx) {
  let alive = true, timer = 0;
  const el = h(`<div>
    <div class="page-head"><h1>🟢 Live</h1></div>
    <div class="live-grid">
      <div class="panel"><h2>Gerade online</h2><div class="live-online"></div></div>
      <div class="panel"><h2>🔥 Große Gewinne</h2><div class="live-feed"></div></div>
    </div>
    <a class="tile live-crash-tile" href="#/livecrash" style="--tile-a:#7a1f3d;--tile-b:#2a0614;margin-top:18px">
      <span class="tile-tag is-new">LIVE · Multiplayer</span><span class="tile-icon">🚀</span>
      <h3>Live-Crash</h3><p>Eine Rakete für alle – spring rein und spiel mit den anderen in derselben Runde.</p>
    </a></div>`);
  root.appendChild(el);
  const onEl = el.querySelector('.live-online'), feedEl = el.querySelector('.live-feed');

  async function refresh() {
    try {
      const r = await ctx.post('/api/live/ping', { where: 'live' });
      onEl.innerHTML = r.online.map((o) => {
        const canJoin = GAMES.some((g) => g.id === o.where) || ['duels', 'cases'].includes(o.where);
        return `<div class="live-row"><span class="avatar">${esc(o.name.slice(0, 1).toUpperCase())}</span>
          <span class="lr-name">${esc(o.name)}${o.name === ctx.state.me?.name ? ' <span class="muted">(du)</span>' : ''}</span>
          <span class="lr-where">${whereIcon(o.where)} ${esc(whereName(o.where))}</span>
          ${canJoin && o.name !== ctx.state.me?.name ? `<a class="btn btn-sm btn-gold" href="#/${esc(o.where)}">Dazu</a>` : ''}</div>`;
      }).join('') || '<p class="muted">Niemand online.</p>';
      feedEl.innerHTML = r.feed.map((f) => `<div class="live-row feed"><span class="lr-icon">${whereIcon(f.game)}</span>
        <span class="lr-name"><b>${esc(f.name)}</b> gewinnt <b class="gold">+${fmt(f.net)}</b> bei ${esc(whereName(f.game))} (${f.mult.toLocaleString('de-DE')}×)</span><span class="muted">${ago(f.at)}</span></div>`).join('')
        || '<p class="muted">Noch keine großen Gewinne – ab 10× Einsatz und 1.000 Chips Gewinn landet man hier.</p>';
    } catch { /* egal */ }
    if (alive) timer = setTimeout(refresh, 3000);
  }
  await refresh();
  return () => { alive = false; clearTimeout(timer); };
}

// ===================== Case-Bausteine =====================
let INFO = null;
async function caseInfo(ctx) { if (!INFO) INFO = await ctx.post('/api/cases/info'); return INFO; }

function itemCard(it, rarities, cls = '') {
  const r = rarities[it.rarity];
  return `<div class="skin ${cls}" style="--rc:${r.color}"><span class="skin-icon">${it.icon}</span>
    <span class="skin-name">${esc(it.weapon)}</span><span class="skin-finish">${esc(it.finish)}</span><span class="skin-val">${fmt(it.value)}</span></div>`;
}

function pickWeighted(items) {
  let r = Math.random();
  for (const it of items) { r -= it.chance; if (r < 0) return it; }
  return items[0];
}

/** Lässt einen Streifen voller Skins laufen und hält beim Ziel an (axis 'x' = waagerecht, 'y' = senkrecht) */
function spin(box, caseObj, rarities, target, { duration = 4200, axis = 'x' } = {}) {
  return new Promise((resolve) => {
    const N = 42, T = 36;
    const items = Array.from({ length: N }, (_, i) => (i === T ? target : pickWeighted(caseObj.items)));
    box.innerHTML = `<div class="reel-track ${axis}">${items.map((it, i) => itemCard(it, rarities, i === T ? 'target' : '')).join('')}</div><div class="reel-marker ${axis}"></div>`;
    const track = box.firstElementChild;
    const card = track.children[T];
    const boxSize = axis === 'x' ? box.clientWidth : box.clientHeight;
    const pos = axis === 'x' ? card.offsetLeft + card.offsetWidth / 2 : card.offsetTop + card.offsetHeight / 2;
    const jitter = (Math.random() - 0.5) * (axis === 'x' ? card.offsetWidth : card.offsetHeight) * 0.6;
    const dist = pos - boxSize / 2 + jitter;
    track.style.transform = 'translate(0,0)';
    void track.offsetWidth;
    track.style.transition = `transform ${duration}ms cubic-bezier(.08,.6,.12,1)`;
    track.style.transform = axis === 'x' ? `translateX(${-dist}px)` : `translateY(${-dist}px)`;
    // Tick-Geräusch beim Vorbeiziehen
    const t0 = performance.now();
    let last = 0;
    const step = () => {
      const k = (performance.now() - t0) / duration;
      if (k >= 1) return;
      const e = 1 - Math.pow(1 - k, 3.2);
      const idx = Math.floor((e * dist) / (axis === 'x' ? card.offsetWidth + 6 : card.offsetHeight + 6));
      if (idx !== last) { last = idx; sfx.tick(); }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(() => {
      track.style.transition = 'transform .35s ease-out';
      track.style.transform = axis === 'x' ? `translateX(${-(pos - boxSize / 2)}px)` : `translateY(${-(pos - boxSize / 2)}px)`;
      card.classList.add('landed');
      sfx.reelStop();
      setTimeout(resolve, 380);
    }, duration + 50);
  });
}

// ===================== Cases (Öffnen + Battles) =====================
export async function cases(root, ctx) {
  const info = await caseInfo(ctx);
  let alive = true, timer = 0, tab = 'battles', sel = info.cases[0].id, busy = false;
  try { tab = localStorage.getItem('casino.cases.tab') || 'battles'; sel = localStorage.getItem('casino.cases.sel') || sel; } catch { /* egal */ }
  if (!info.cases.some((c) => c.id === sel)) sel = info.cases[0].id;
  const caseById = (id) => info.cases.find((c) => c.id === id);

  const el = h(`<div>
    <div class="page-head"><h1>📦 Cases</h1></div>
    <div class="tab-row"><button class="btn" data-t="battles">⚔️ Case Battles</button><button class="btn" data-t="open">📦 Case öffnen</button></div>
    <div class="case-picker"></div>
    <div class="cases-body"></div></div>`);
  root.appendChild(el);
  const picker = el.querySelector('.case-picker');
  const body = el.querySelector('.cases-body');

  function paintPicker() {
    picker.innerHTML = info.cases.map((c) => `<button class="case-box ${c.id === sel ? 'on' : ''}" data-c="${c.id}" style="--cc:${c.color}">
      <span class="case-ico">📦</span><b>${esc(c.name)}</b><span class="gold">${fmt(c.price)}</span></button>`).join('');
    picker.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
      if (busy) return;
      sel = b.dataset.c;
      try { localStorage.setItem('casino.cases.sel', sel); } catch { /* egal */ }
      sfx.click();
      paintPicker();
      paintBody();
    }));
  }

  function contents(c) {
    return `<details class="case-contents"><summary>Inhalt & Chancen</summary><div class="skin-grid">${
      [...c.items].sort((a, b) => b.value - a.value).map((it) => `<div>${itemCard(it, info.rarities)}<small class="muted">${(it.chance * 100).toLocaleString('de-DE', { maximumFractionDigits: 3 })} %</small></div>`).join('')}</div></details>`;
  }

  // ---------- Öffnen ----------
  function paintOpen() {
    const c = caseById(sel);
    body.innerHTML = `<div class="panel">
      <div class="reel-box solo"></div>
      <div class="result-msg"></div>
      <div class="row" style="justify-content:center"><button class="btn btn-gold btn-big open-btn" style="max-width:360px">${esc(c.name)} öffnen – ${fmt(c.price)}</button></div>
      ${contents(c)}</div>`;
    const box = body.querySelector('.reel-box');
    box.innerHTML = `<div class="reel-track x">${c.items.slice(0, 8).map((it) => itemCard(it, info.rarities)).join('')}</div><div class="reel-marker x"></div>`;
    body.querySelector('.open-btn').addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      const btn = body.querySelector('.open-btn');
      btn.disabled = true;
      const msg = body.querySelector('.result-msg');
      msg.className = 'result-msg';
      msg.textContent = '';
      try {
        const r = await ctx.post('/api/cases/open', { caseId: c.id });
        ctx.setBalance(r.balance - r.item.value);
        await spin(box, c, info.rarities, r.item);
        if (!alive) return;
        ctx.setBalance(r.balance);
        const net = r.item.value - c.price;
        msg.className = 'result-msg ' + (net > 0 ? 'win' : 'lose');
        msg.innerHTML = `${esc(r.item.weapon)} | ${esc(r.item.finish)} <span style="color:${info.rarities[r.item.rarity].color}">(${esc(info.rarities[r.item.rarity].name)})</span> – ${fmt(r.item.value)} Chips`;
        if (net > 0) celebrate(r.item.value, c.price); else sfx.lose();
      } catch (e) { toast(e.message, 'err'); }
      busy = false;
      btn.disabled = false;
    });
  }

  // ---------- Battles ----------
  let rounds = 1, slots = 2;
  try { rounds = Number(localStorage.getItem('casino.cases.rounds')) || 1; slots = Number(localStorage.getItem('casino.cases.slots')) || 2; } catch { /* egal */ }

  function paintBattles() {
    const c = caseById(sel);
    body.innerHTML = `<div class="duel-grid">
      <div class="panel">
        <h2>Neues Battle</h2>
        <p class="muted" style="margin-top:0">Alle öffnen dieselben Cases. Wer den höchsten Gesamtwert zieht, bekommt <b>alle</b> Skins (als Chips).</p>
        <label class="field">Runden (Cases pro Spieler)<div class="r-seg"></div></label>
        <label class="field" style="margin-top:10px">Spieler<div class="s-seg"></div></label>
        <div class="kv" style="margin-top:10px"><span>Kosten pro Spieler</span><span class="gold cost">${fmt(c.price * rounds)}</span></div>
        <button class="btn btn-gold btn-big create-btn" style="margin-top:10px">BATTLE ERSTELLEN</button>
        ${contents(c)}
      </div>
      <div class="battle-lists"></div></div>`;
    const rSeg = segmented([1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) })), rounds, (v) => { rounds = v; save(); body.querySelector('.cost').textContent = fmt(c.price * rounds); });
    const sSeg = segmented([2, 3, 4].map((v) => ({ value: v, label: `${v} Spieler` })), slots, (v) => { slots = v; save(); });
    body.querySelector('.r-seg').appendChild(rSeg.el);
    body.querySelector('.s-seg').appendChild(sSeg.el);
    function save() { try { localStorage.setItem('casino.cases.rounds', rounds); localStorage.setItem('casino.cases.slots', slots); } catch { /* egal */ } }
    body.querySelector('.create-btn').addEventListener('click', async () => {
      try {
        const r = await ctx.post('/api/cases/create', { caseId: sel, rounds, slots });
        ctx.setBalance(r.balance);
        sfx.chip();
        location.hash = `#/battle?id=${r.id}`;
      } catch (e) { toast(e.message, 'err'); }
    });
    refreshBattles();
  }

  async function refreshBattles() {
    clearTimeout(timer);
    if (!alive || tab !== 'battles') return;
    const lists = body.querySelector('.battle-lists');
    if (!lists) return;
    try {
      const r = await ctx.post('/api/cases/list');
      const row = (b, btns) => `<div class="duel-row"><span class="dg-icon">📦</span>
        <div class="dr-main"><b>${esc(b.caseName)} × ${b.rounds}</b><small>${b.players.map((p) => esc(p.name)).join(' · ')} ${b.status === 'waiting' ? `(${b.players.length}/${b.slots})` : ''}</small></div>
        <span class="dr-stake"><span class="chip-icon"></span>${fmt(b.cost)}</span><div class="dr-actions">${btns}</div></div>`;
      const sec = (title, arr, fn, empty) => `<div class="panel section"><h2>${title}</h2>${arr.length ? arr.map(fn).join('') : `<p class="muted" style="margin:0">${empty}</p>`}</div>`;
      lists.innerHTML =
        sec('⏳ Offene Battles', r.waiting, (b) => row(b, b.mine
          ? `<button class="btn btn-sm btn-green" data-a="bots" data-id="${b.id}">Mit Bots starten</button><button class="btn btn-sm" data-a="cancel" data-id="${b.id}">Abbrechen</button>`
          : b.joined ? '<span class="muted">dabei</span>' : `<button class="btn btn-sm btn-gold" data-a="join" data-id="${b.id}">Beitreten</button>`), 'Keine offenen Battles – erstell eins!') +
        sec('▶️ Laufende Battles', r.running, (b) => row(b, `<a class="btn btn-sm btn-gold" href="#/battle?id=${b.id}">Zuschauen</a>`), 'Gerade läuft kein Battle.') +
        sec('📜 Letzte Battles', r.done, (b) => row(b, `<span class="${b.players.find((p) => p.me)?.winner ? 'pos' : 'muted'}">${b.players.filter((p) => p.winner).map((p) => esc(p.name)).join(' & ')} gewinnt ${fmt(b.pot)}</span><a class="btn btn-sm btn-ghost" href="#/battle?id=${b.id}">Ansehen</a>`), 'Noch keine Battles.');
      lists.querySelectorAll('[data-a]').forEach((btn) => btn.addEventListener('click', async () => {
        try {
          const res = await ctx.post(`/api/cases/${btn.dataset.a}`, { id: btn.dataset.id });
          ctx.setBalance(res.balance);
          if (btn.dataset.a === 'cancel') { refreshBattles(); return; }
          location.hash = `#/battle?id=${res.id}`;
        } catch (e) { toast(e.message, 'err'); refreshBattles(); }
      }));
    } catch { /* egal */ }
    timer = setTimeout(refreshBattles, 3000);
  }

  function paintBody() {
    el.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('btn-gold', b.dataset.t === tab));
    if (tab === 'open') paintOpen(); else paintBattles();
  }
  el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => {
    if (busy) return;
    tab = b.dataset.t;
    try { localStorage.setItem('casino.cases.tab', tab); } catch { /* egal */ }
    sfx.click();
    paintBody();
  }));
  paintPicker();
  paintBody();
  return () => { alive = false; clearTimeout(timer); };
}

// ===================== Ein Battle =====================
export async function battle(root, ctx) {
  const info = await caseInfo(ctx);
  const id = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
  let alive = true, timer = 0, offset = 0, shown = -1, data = null, finished = false;

  const el = h(`<div>
    <div class="page-head"><a class="back-link" href="#/cases">← Cases</a><h1 class="bt-title">📦 Case Battle</h1></div>
    <div class="panel bt-head"></div>
    <div class="bt-cols"></div>
  </div>`);
  root.appendChild(el);
  const head = el.querySelector('.bt-head');
  const cols = el.querySelector('.bt-cols');

  function build(b) {
    cols.style.setProperty('--n', b.slots);
    cols.innerHTML = Array.from({ length: b.slots }, (_, i) => `<div class="bt-col" data-i="${i}">
      <div class="bt-player"></div><div class="reel-box vertical"></div><div class="bt-items"></div><div class="bt-total">0</div></div>`).join('');
  }

  function paintPlayers(b) {
    [...cols.children].forEach((col, i) => {
      const p = b.players[i];
      col.querySelector('.bt-player').innerHTML = p ? `<span class="avatar">${p.bot ? '🤖' : esc(p.name.slice(0, 1).toUpperCase())}</span><b>${esc(p.name)}</b>${p.me ? ' <span class="muted">(du)</span>' : ''}` : '<span class="muted">wartet auf Spieler …</span>';
      col.classList.toggle('me', !!p?.me);
    });
  }

  function paintHead(b, now) {
    let status = '';
    if (b.status === 'waiting') status = `Wartet auf Spieler (${b.players.length}/${b.slots})`;
    if (b.status === 'running') {
      const t = now - b.startAt;
      status = t < 0 ? `Start in ${Math.ceil(-t / 1000)} …` : `Runde ${Math.min(b.rounds, Math.floor(t / b.roundMs) + 1)} von ${b.rounds}`;
    }
    if (b.status === 'done') status = `Topf: <b class="gold">${fmt(b.pot)}</b> – Sieger: <b>${b.players.filter((p) => p.winner).map((p) => esc(p.name)).join(' & ')}</b>`;
    if (b.status === 'cancelled') status = 'Abgebrochen – Einsätze zurückgebucht.';
    el.querySelector('.bt-title').textContent = `📦 ${b.caseName} × ${b.rounds}`;
    head.innerHTML = `<div>${status}</div><div class="dh-info"><span>Einsatz pro Spieler: <b class="gold">${fmt(b.cost)}</b></span>
      ${b.status === 'waiting' && b.mine ? `<button class="btn btn-sm btn-green" data-a="bots">Mit Bots auffüllen & starten</button>` : ''}
      ${b.status === 'waiting' && !b.joined ? `<button class="btn btn-sm btn-gold" data-a="join">Beitreten (${fmt(b.cost)})</button>` : ''}</div>`;
    head.querySelectorAll('[data-a]').forEach((btn) => btn.addEventListener('click', async () => {
      try { const r = await ctx.post(`/api/cases/${btn.dataset.a}`, { id }); ctx.setBalance(r.balance); poll(); } catch (e) { toast(e.message, 'err'); }
    }));
  }

  async function playRound(b, r) {
    const c = info.cases.find((x) => x.id === b.caseId);
    const tasks = [...cols.children].map(async (col, i) => {
      const it = b.players[i]?.items[r];
      if (!it) return;
      await spin(col.querySelector('.reel-box'), c, info.rarities, it, { duration: Math.max(1500, b.roundMs - 1200), axis: 'y' });
      col.querySelector('.bt-items').insertAdjacentHTML('beforeend', itemCard(it, info.rarities, 'small pop'));
      const total = b.players[i].items.slice(0, r + 1).reduce((a, x) => a + x.value, 0);
      col.querySelector('.bt-total').textContent = fmt(total);
    });
    await Promise.all(tasks);
  }

  function finish(b) {
    if (finished) return;
    finished = true;
    [...cols.children].forEach((col, i) => {
      const p = b.players[i];
      col.classList.toggle('winner', !!p?.winner);
      col.classList.toggle('loser', p && !p.winner);
      col.querySelector('.bt-total').textContent = fmt(p?.total ?? 0);
    });
    const me = b.players.find((p) => p.me);
    if (me?.winner) { sfx.bigWin(); confetti(); } else if (me) sfx.lose();
    ctx.refreshMe();
  }

  async function poll() {
    if (!alive) return;
    try {
      const b = await ctx.post('/api/cases/get', { id });
      offset = b.now - Date.now();
      if (!data) build(b);
      data = b;
      paintPlayers(b);
      paintHead(b, Date.now() + offset);
      if (b.status === 'running' || b.status === 'done') {
        const now = Date.now() + offset;
        const target = b.status === 'done' ? b.rounds - 1 : Math.min(b.rounds - 1, Math.floor((now - b.startAt) / b.roundMs));
        // Bei "Ansehen" eines fertigen Battles: alles sofort zeigen statt animieren
        if (b.status === 'done' && shown < 0) {
          [...cols.children].forEach((col, i) => {
            col.querySelector('.bt-items').innerHTML = (b.players[i]?.items || []).map((it) => itemCard(it, info.rarities, 'small')).join('');
          });
          shown = b.rounds - 1;
        }
        while (shown < target && alive) {
          shown++;
          await playRound(b, shown);
        }
        if (b.status === 'done') finish(b);
      }
    } catch (e) {
      cols.innerHTML = `<div class="panel"><p class="neg">${esc(e.message)}</p></div>`;
      return;
    }
    timer = setTimeout(poll, data?.status === 'done' ? 5000 : 700);
  }
  await poll();
  return () => { alive = false; clearTimeout(timer); };
}
