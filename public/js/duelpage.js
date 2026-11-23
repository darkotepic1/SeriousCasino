// Duelle: Übersicht (Herausfordern/Annehmen) und die vier Duell-Spiele.
import { h, esc, fmt, sleep, toast, confirmDialog, confetti } from './ui.js';
import { sfx } from './sound.js';

const GAME_INFO = {
  reaction: { icon: '⚡', text: '3 Runden: Klicke, sobald das Feld grün wird. Die kleinste Gesamtzeit gewinnt. Zu früh = 1000 ms Strafe.' },
  math: { icon: '🧮', text: '30 Sekunden Kopfrechnen. Wer mehr Aufgaben richtig löst, gewinnt.' },
  connect4: { icon: '🔴', text: 'Abwechselnd Steine einwerfen – wer zuerst 4 in einer Reihe hat, gewinnt. 2 Minuten pro Zug.' },
  rps: { icon: '✌️', text: 'Schere, Stein, Papier – wer zuerst 3 Runden gewinnt. 2 Minuten pro Runde.' },
};
const RPS = { rock: '✊', paper: '✋', scissors: '✌️' };
const RESULT = { win: ['🏆 Gewonnen', 'pos'], lose: ['Verloren', 'neg'], draw: ['Unentschieden', ''] };
const timeLeft = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ===================== Übersicht =====================
export async function duels(root, ctx) {
  let alive = true;
  let timer = 0;
  let game = 'reaction';
  try { game = localStorage.getItem('casino.duel.game') || 'reaction'; } catch { /* egal */ }

  const el = h(`<div>
    <div class="page-head"><h1>⚔️ Duelle – 1 gegen 1</h1></div>
    <p class="muted" style="margin-top:-6px">Beide setzen gleich viel, der Gewinner bekommt den ganzen Topf – das Casino nimmt nichts. Bei Unentschieden oder Abbruch gibt es den Einsatz zurück.</p>
    <div class="duel-grid">
      <div class="panel">
        <h2>Neues Duell</h2>
        <div class="duel-games"></div>
        <label class="field" style="margin-top:12px">Gegner
          <select class="input duel-to"><option value="">🌍 Offen – jeder darf annehmen</option></select>
        </label>
        <div class="stake-slot" style="margin-top:12px"></div>
        <button class="btn btn-gold btn-big create-btn" style="margin-top:12px">HERAUSFORDERN</button>
      </div>
      <div class="duel-lists"></div>
    </div></div>`);
  root.appendChild(el);
  const stake = ctx.bet({ game: 'duel', initial: 500, min: 10, label: 'Einsatz pro Spieler' });
  el.querySelector('.stake-slot').appendChild(stake.el);
  const gamesEl = el.querySelector('.duel-games');
  const toSel = el.querySelector('.duel-to');
  const lists = el.querySelector('.duel-lists');

  function paintGames(names) {
    gamesEl.innerHTML = Object.entries(names).map(([id, name]) => `
      <button class="duel-game ${id === game ? 'on' : ''}" data-g="${id}">
        <span class="dg-icon">${GAME_INFO[id].icon}</span><b>${esc(name)}</b><small>${esc(GAME_INFO[id].text)}</small>
      </button>`).join('');
    gamesEl.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => {
      game = b.dataset.g;
      try { localStorage.setItem('casino.duel.game', game); } catch { /* egal */ }
      sfx.click();
      paintGames(names);
    }));
  }

  const row = (d, buttons) => `
    <div class="duel-row">
      <span class="dg-icon">${GAME_INFO[d.game].icon}</span>
      <div class="dr-main"><b>${esc(d.gameName)}</b><small>${buttons.who}</small></div>
      <span class="dr-stake"><span class="chip-icon"></span>${fmt(d.stake)}</span>
      <div class="dr-actions">${buttons.html}</div>
    </div>`;

  async function refresh(first = false) {
    let r;
    try { r = await ctx.post('/api/duels/list'); } catch (e) { if (first) toast(e.message, 'err'); return; }
    if (!alive) return;
    if (first) {
      paintGames(r.games);
      toSel.innerHTML = '<option value="">🌍 Offen – jeder darf annehmen</option>' + r.players.map((n) => `<option>${esc(n)}</option>`).join('');
    }
    const section = (title, items, render, empty) => `<div class="panel section"><h2>${title}</h2>${items.length ? items.map(render).join('') : `<p class="muted" style="margin:0">${empty}</p>`}</div>`;
    lists.innerHTML =
      (r.incoming.length ? section('📨 Herausforderungen an dich', r.incoming, (d) => row(d, { who: `von <b>${esc(d.fromName)}</b>`, html: `<button class="btn btn-sm btn-green" data-a="accept" data-id="${d.id}">Annehmen</button><button class="btn btn-sm" data-a="decline" data-id="${d.id}">Ablehnen</button>` }), '') : '') +
      section('▶️ Laufende Duelle', r.active, (d) => row(d, { who: `gegen <b>${esc(d.opponent)}</b>`, html: `<a class="btn btn-sm btn-gold" href="#/duel?id=${d.id}">Öffnen</a>` }), 'Keine laufenden Duelle.') +
      section('🌍 Offene Duelle von anderen', r.open, (d) => row(d, { who: `von <b>${esc(d.fromName)}</b> – jeder darf annehmen`, html: `<button class="btn btn-sm btn-green" data-a="accept" data-id="${d.id}">Annehmen</button>` }), 'Gerade keine offenen Duelle.') +
      section('⏳ Deine Herausforderungen', r.outgoing, (d) => row(d, { who: d.toName ? `an <b>${esc(d.toName)}</b> · wartet auf Antwort` : 'offen für alle · wartet', html: `<button class="btn btn-sm" data-a="cancel" data-id="${d.id}">Zurückziehen</button>` }), 'Keine offenen Herausforderungen.') +
      section('📜 Letzte Ergebnisse', r.recent, (d) => row(d, {
        who: `gegen <b>${esc(d.opponent || '–')}</b> · <span class="${RESULT[d.result][1]}">${RESULT[d.result][0]}</span>${d.reason ? ` · ${esc(d.reason)}` : ''}`,
        html: `<a class="btn btn-sm btn-ghost" href="#/duel?id=${d.id}">Ansehen</a>`,
      }), 'Noch keine Duelle gespielt.');
    lists.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', async () => {
      const a = b.dataset.a;
      try {
        if (a === 'decline' && !(await confirmDialog('Herausforderung ablehnen?', 'Der Herausforderer bekommt seinen Einsatz zurück.', 'Ablehnen'))) return;
        const res = await ctx.post(`/api/duels/${a}`, { id: b.dataset.id });
        ctx.setBalance(res.balance);
        if (a === 'accept') { sfx.coin(); location.hash = `#/duel?id=${res.id}`; return; }
        refresh();
      } catch (e) { toast(e.message, 'err'); refresh(); }
    }));
  }

  el.querySelector('.create-btn').addEventListener('click', async () => {
    try {
      const r = await ctx.post('/api/duels/create', { game, stake: stake.value, to: toSel.value });
      ctx.setBalance(r.balance);
      sfx.chip();
      toast(r.toName ? `Herausforderung an ${r.toName} gesendet!` : 'Offenes Duell erstellt – wartet auf einen Gegner.', 'ok');
      refresh();
    } catch (e) { toast(e.message, 'err'); }
  });

  await refresh(true);
  const loop = async () => { if (!alive) return; await refresh(); timer = setTimeout(loop, 3000); };
  timer = setTimeout(loop, 3000);
  return () => { alive = false; clearTimeout(timer); };
}

// ===================== Ein Duell =====================
export async function duel(root, ctx) {
  const id = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
  let alive = true;
  let timer = 0;
  let last = null;
  let local = {}; // Zustand nur im Browser (z. B. Reaktionszeiten während des Spielens)
  let celebrated = false;

  const el = h(`<div>
    <div class="page-head"><a class="back-link" href="#/duels">← Duelle</a><h1 class="duel-title">Duell</h1></div>
    <div class="panel duel-head"></div>
    <div class="duel-stage"></div>
  </div>`);
  root.appendChild(el);
  const head = el.querySelector('.duel-head');
  const stage = el.querySelector('.duel-stage');

  const act = async (body) => {
    const r = await ctx.post('/api/duels/act', { id, ...body });
    ctx.setBalance(r.balance);
    return r;
  };

  function paintHead(d) {
    el.querySelector('.duel-title').textContent = `${GAME_INFO[d.game].icon} ${d.gameName}`;
    const status = d.status === 'active' ? '<span class="pos">läuft</span>' : d.status === 'done' ? `<span class="${RESULT[d.result][1]}">${RESULT[d.result][0]}</span>` : d.status === 'pending' ? 'wartet auf Gegner' : 'beendet';
    head.innerHTML = `<div class="dh-vs"><b>${esc(d.fromName)}</b> <span class="muted">vs</span> <b>${esc(d.toName || '?')}</b></div>
      <div class="dh-info"><span>Topf: <b class="gold">${fmt(d.stake * 2)}</b></span><span>Status: ${status}</span>${d.reason ? `<span class="muted">${esc(d.reason)}</span>` : ''}</div>`;
  }

  function resultBanner(d) {
    if (d.status !== 'done') return '';
    if (!celebrated) {
      celebrated = true;
      if (d.result === 'win') { sfx.bigWin(); confetti(); } else if (d.result === 'lose') sfx.lose(); else sfx.coin();
      ctx.refreshMe();
    }
    const [txt, cls] = RESULT[d.result];
    const amount = d.result === 'win' ? `+${fmt(d.stake)} Chips (Topf ${fmt(d.stake * 2)})` : d.result === 'lose' ? `−${fmt(d.stake)} Chips` : 'Einsatz zurück';
    return `<div class="duel-result ${cls}"><b>${txt}!</b><span>${amount}</span><a class="btn btn-gold" href="#/duels">Zu den Duellen</a></div>`;
  }

  // ---------- Reaktionstest ----------
  function renderReaction(d) {
    const v = d.view;
    if (d.status === 'done' || v.mine) {
      const fmtT = (t) => (t >= v.penalty ? `<span class="neg">zu früh</span>` : `${t} ms`);
      const mine = v.mine ? `<div class="kv"><span>Deine Zeiten</span><span>${v.mine.times.map(fmtT).join(' · ')} = <b>${v.mine.total} ms</b></span></div>` : '';
      const opp = v.opp ? `<div class="kv"><span>Gegner</span><span>${v.opp.times.map(fmtT).join(' · ')} = <b>${v.opp.total} ms</b></span></div>` : '';
      stage.innerHTML = `<div class="panel">${resultBanner(d)}${mine}${opp}${d.status !== 'done' ? `<p class="muted">${v.oppDone ? 'Gegner ist fertig – Auswertung …' : 'Warte auf deinen Gegner …'}</p>` : ''}</div>`;
      return;
    }
    if (local.reactionRunning) return; // Spiel läuft gerade im Browser – nicht neu zeichnen
    stage.innerHTML = `<div class="panel" style="text-align:center"><p>${esc(GAME_INFO.reaction.text)}</p>
      <button class="react-pad idle">Klick hier zum Starten</button></div>`;
    const pad = stage.querySelector('.react-pad');
    pad.addEventListener('click', () => runReaction(pad, v), { once: true });
  }

  async function runReaction(pad, v) {
    local.reactionRunning = true;
    const times = [];
    for (let round = 0; round < v.rounds && alive; round++) {
      pad.className = 'react-pad wait';
      pad.textContent = `Runde ${round + 1}/${v.rounds} – warte auf Grün …`;
      let early = false, clicked = null, greenAt = 0;
      const onClick = () => { if (!greenAt) early = true; else if (clicked === null) clicked = performance.now() - greenAt; };
      pad.addEventListener('pointerdown', onClick);
      const t0 = performance.now();
      while (alive && !early && performance.now() - t0 < v.delays[round]) await sleep(10);
      if (!early) {
        greenAt = performance.now();
        pad.className = 'react-pad go';
        pad.textContent = 'JETZT!';
        while (alive && clicked === null && performance.now() - greenAt < 3000) await sleep(5);
      }
      pad.removeEventListener('pointerdown', onClick);
      const t = early ? null : clicked === null ? 3000 : Math.round(clicked);
      times.push(t);
      pad.className = 'react-pad idle';
      pad.textContent = early ? 'Zu früh! +1000 ms' : `${t} ms`;
      if (early) sfx.lose(); else sfx.tick();
      await sleep(1100);
    }
    if (!alive) return;
    try { const r = await act({ type: 'submit', times }); local.reactionRunning = false; update(r); } catch (e) { toast(e.message, 'err'); local.reactionRunning = false; }
  }

  // ---------- Kopfrechnen ----------
  function renderMath(d) {
    const v = d.view;
    if (d.status === 'done' || (v.started && v.timeLeft <= 0)) {
      stage.innerHTML = `<div class="panel">${resultBanner(d)}
        <div class="kv"><span>Deine richtigen Antworten</span><span><b>${v.score}</b></span></div>
        ${v.oppScore !== null ? `<div class="kv"><span>Gegner</span><span><b>${v.oppScore}</b></span></div>` : `<p class="muted">${v.oppStarted ? 'Dein Gegner rechnet noch …' : 'Warte auf deinen Gegner …'}</p>`}</div>`;
      return;
    }
    if (!v.started) {
      stage.innerHTML = `<div class="panel" style="text-align:center"><p>${esc(GAME_INFO.math.text)}</p><button class="btn btn-gold btn-big math-go">START (30 Sekunden)</button></div>`;
      stage.querySelector('.math-go').addEventListener('click', async () => { try { update(await act({ type: 'begin' })); } catch (e) { toast(e.message, 'err'); } });
      return;
    }
    if (local.mathIndex === v.index && stage.querySelector('.math-q')) {
      stage.querySelector('.math-time').textContent = timeLeft(v.timeLeft);
      return;
    }
    local.mathIndex = v.index;
    stage.innerHTML = `<div class="panel math-box">
      <div class="row" style="justify-content:space-between"><span>⏱️ <b class="math-time">${timeLeft(v.timeLeft)}</b></span><span>Richtig: <b class="math-score">${v.score}</b></span></div>
      <div class="math-q">${esc(v.problem || '')} = ?</div>
      <form class="row math-form"><input class="input" name="a" inputmode="numeric" autocomplete="off" autofocus><button class="btn btn-gold" type="submit">OK</button></form></div>`;
    const form = stage.querySelector('.math-form');
    form.a.focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await act({ type: 'answer', index: v.index, value: form.a.value });
        r.correct ? sfx.gem() : sfx.lose();
        update(r);
      } catch (err) { toast(err.message, 'err'); }
    });
  }

  // ---------- Vier gewinnt ----------
  function renderConnect4(d) {
    const v = d.view;
    const cells = v.board.map((x, i) => `<div class="c4-cell ${x ? 'p' + x : ''} ${x && x === v.me ? 'mine' : x ? 'theirs' : ''} ${v.winLine?.includes(i) ? 'win' : ''}"></div>`).join('');
    const status = d.status === 'done' ? resultBanner(d) : `<p class="c4-turn ${v.myTurn ? 'pos' : ''}">${v.myTurn ? `Du bist dran! (${timeLeft(v.timeLeft)})` : `Gegner ist dran … (${timeLeft(v.timeLeft)})`}</p>`;
    stage.innerHTML = `<div class="panel c4-wrap">${status}
      <div class="c4-legend"><span><i class="c4-dot mine"></i>Du</span><span><i class="c4-dot theirs"></i>Gegner</span></div>
      <div class="c4-board ${v.myTurn ? 'active' : ''}">${cells}<div class="c4-cols">${[0, 1, 2, 3, 4, 5, 6].map((c) => `<button data-c="${c}" aria-label="Spalte ${c + 1}"></button>`).join('')}</div></div></div>`;
    stage.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', async () => {
      if (!v.myTurn || d.status !== 'active') return;
      try { sfx.chip(); update(await act({ type: 'move', col: Number(b.dataset.c) })); } catch (e) { toast(e.message, 'err'); }
    }));
  }

  // ---------- Schere-Stein-Papier Best of 5 ----------
  function renderRps(d) {
    const v = d.view;
    const hist = v.history.map((r, i) => `<div class="rps-round ${r.winner}"><span>Runde ${i + 1}</span><span>${RPS[r.mine]} vs ${RPS[r.opp]}</span><b>${r.winner === 'me' ? 'Punkt für dich' : r.winner === 'opp' ? 'Punkt Gegner' : 'unentschieden'}</b></div>`).join('');
    const body = d.status === 'done' ? resultBanner(d) : v.myPick
      ? `<p class="muted">Du hast ${RPS[v.myPick]} gewählt – warte auf deinen Gegner … (${timeLeft(v.timeLeft)})</p>`
      : `<p>${v.oppPicked ? '<b>Dein Gegner hat schon gewählt!</b> ' : ''}Wähle (${timeLeft(v.timeLeft)}):</p>
         <div class="rps-choices">${Object.entries(RPS).map(([k, i]) => `<button class="btn rps-btn" data-p="${k}"><span>${i}</span></button>`).join('')}</div>`;
    stage.innerHTML = `<div class="panel rps-duel-box">
      <div class="rps-score-big"><span>Du <b>${v.myScore}</b></span><span class="muted">:</span><span><b>${v.oppScore}</b> Gegner</span></div>
      <p class="muted" style="margin:0">Wer zuerst 3 Punkte hat, gewinnt.</p>
      ${body}<div class="rps-hist">${hist}</div></div>`;
    stage.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', async () => {
      try { sfx.click(); update(await act({ type: 'pick', choice: b.dataset.p })); } catch (e) { toast(e.message, 'err'); }
    }));
  }

  function update(d) {
    if (!alive || !d) return;
    const changed = JSON.stringify(d) !== JSON.stringify(last);
    last = d;
    paintHead(d);
    if (d.status === 'pending') { stage.innerHTML = '<div class="panel"><p class="muted">Dieses Duell wartet noch auf einen Gegner.</p></div>'; return; }
    if (['cancelled', 'declined', 'expired'].includes(d.status)) { stage.innerHTML = '<div class="panel"><p class="muted">Dieses Duell wurde nicht gespielt – der Einsatz wurde zurückgebucht.</p></div>'; return; }
    if (!d.view) return;
    if (d.game === 'reaction') { if (changed) renderReaction(d); }
    else if (d.game === 'math') renderMath(d);
    else if (d.game === 'connect4') renderConnect4(d);
    else if (d.game === 'rps') renderRps(d);
  }

  async function poll() {
    if (!alive) return;
    try { update(await ctx.post('/api/duels/get', { id })); } catch (e) { stage.innerHTML = `<div class="panel"><p class="neg">${esc(e.message)}</p></div>`; return; }
    const fast = last && last.status === 'active' && (last.game === 'math' && last.view?.started && last.view.timeLeft > 0);
    timer = setTimeout(poll, fast ? 500 : last?.status === 'active' ? 1200 : 4000);
  }
  await poll();
  return () => { alive = false; clearTimeout(timer); };
}
