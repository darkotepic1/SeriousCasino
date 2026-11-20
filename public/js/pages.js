// Seiten: Startseite, Statistik, Rangliste, Einstellungen.
import { h, esc, fmt, fmtSigned, toast, confirmDialog } from './ui.js';
import { sfx } from './sound.js';
import { session } from './api.js';

const signCls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

// ---------- Startseite ----------
export function home(root, ctx) {
  const name = ctx.state.me?.name ?? '';
  root.appendChild(h(`<div>
    <section class="hero">
      <h1>Hallo ${esc(name)}, worauf hast du Lust? 🍀</h1>
      <p>Nur Spaß-Chips – kein echtes Geld. Viel Glück!</p>
    </section>
    <div class="tiles">${ctx.GAMES.map((g) => `
      <a class="tile" href="#/${g.id}" style="--tile-a:${g.a};--tile-b:${g.b}">
        <span class="tile-tag ${g.isNew ? 'is-new' : ''}">${g.isNew ? 'NEU · ' : ''}${esc(g.tag)}</span>
        <span class="tile-icon">${g.icon}</span>
        <h3>${esc(g.name)}</h3>
        <p>${esc(g.desc)}</p>
      </a>`).join('')}
    </div></div>`));
}

// ---------- Statistik ----------
export async function stats(root, ctx) {
  const data = await ctx.get('/api/me/stats');
  const s = data.stats;
  const names = data.gameNames;
  const net = s.paid - s.wagered;
  const games = Object.entries(s.perGame).map(([id, g]) => ({ id, ...g, net: g.paid - g.wagered })).sort((a, b) => b.rounds - a.rounds);
  const maxAbs = Math.max(1, ...games.map((g) => Math.abs(g.net)));
  const hist = data.history;

  root.appendChild(h(`<div>
    <div class="page-head"><h1>📊 Statistik</h1></div>
    <div class="stat-cards">
      <div class="stat-card"><div class="sc-label">Gewinn / Verlust gesamt</div><div class="sc-val ${signCls(net)}">${fmtSigned(net)}</div><div class="sc-sub">Chips</div></div>
      <div class="stat-card"><div class="sc-label">Gespielte Runden</div><div class="sc-val">${fmt(s.rounds)}</div><div class="sc-sub">${fmt(s.wagered)} Chips eingesetzt</div></div>
      <div class="stat-card"><div class="sc-label">Größter Gewinn</div><div class="sc-val gold">${fmtSigned(s.biggestWin)}</div><div class="sc-sub">${s.biggestWinGame ? esc(names[s.biggestWinGame]) : '–'}</div></div>
      <div class="stat-card"><div class="sc-label">Auszahlungsquote</div><div class="sc-val">${s.wagered ? ((s.paid / s.wagered) * 100).toFixed(1).replace('.', ',') + ' %' : '–'}</div><div class="sc-sub">ausgezahlt / eingesetzt</div></div>
    </div>

    <div class="panel section">
      <h2>Guthaben-Verlauf (letzte ${hist.length} Runden)</h2>
      ${hist.length > 1 ? sparkline(hist.slice().reverse().map((x) => x.balance)) : '<p class="muted">Spiel ein paar Runden, dann erscheint hier dein Verlauf.</p>'}
    </div>

    <div class="panel section">
      <h2>Pro Spiel</h2>
      ${games.length ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Spiel</th><th class="num">Runden</th><th class="num">Eingesetzt</th><th class="num">Ausgezahlt</th><th class="num">Netto</th><th></th><th class="num">Größter Gewinn</th></tr></thead>
        <tbody>${games.map((g) => `<tr>
          <td>${esc(names[g.id] || g.id)}</td><td class="num">${fmt(g.rounds)}</td><td class="num">${fmt(g.wagered)}</td><td class="num">${fmt(g.paid)}</td>
          <td class="num ${signCls(g.net)}">${fmtSigned(g.net)}</td>
          <td class="bar-cell"><div class="bar ${g.net < 0 ? 'neg' : ''}" style="width:${Math.max(2, (Math.abs(g.net) / maxAbs) * 100)}%"></div></td>
          <td class="num gold">${fmtSigned(g.biggestWin)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Noch keine Runden gespielt.</p>'}
    </div>

    <div class="panel section">
      <h2>Letzte Runden</h2>
      ${hist.length ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Zeit</th><th>Spiel</th><th class="num">Einsatz</th><th class="num">Auszahlung</th><th class="num">Netto</th><th>Details</th></tr></thead>
        <tbody>${hist.map((r) => `<tr>
          <td class="muted">${new Date(r.time).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
          <td>${esc(names[r.game] || r.game)}</td><td class="num">${fmt(r.bet)}</td><td class="num">${fmt(r.payout)}</td>
          <td class="num ${signCls(r.net)}">${fmtSigned(r.net)}</td><td class="muted">${esc(r.detail)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Noch nichts gespielt.</p>'}
    </div></div>`));
}

function sparkline(values) {
  const W = 800, H = 140, pad = 8;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (W - 2 * pad), H - pad - ((v - min) / span) * (H - 2 * pad)]);
  const line = pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
  const area = `${pad},${H - pad} ${line} ${W - pad},${H - pad}`;
  const up = values[values.length - 1] >= values[0];
  const col = up ? '#2ecc71' : '#e5484d';
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".35"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    <polygon points="${area}" fill="url(#sg)"/><polyline points="${line}" fill="none" stroke="${col}" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>
    <div class="kv"><span>Tiefststand ${fmt(min)}</span><span>Höchststand ${fmt(max)}</span></div>`;
}

// ---------- Rangliste ----------
export async function leaderboard(root, ctx) {
  const list = await ctx.get('/api/profiles');
  const medal = ['🥇', '🥈', '🥉'];
  root.appendChild(h(`<div>
    <div class="page-head"><h1>🏆 Rangliste</h1></div>
    <div class="panel"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>#</th><th>Name</th><th class="num">Chips</th><th class="num">Gewinn/Verlust</th><th class="num">Runden</th><th class="num">Größter Gewinn</th></tr></thead>
      <tbody>${list.map((p, i) => `<tr class="${p.id === session.id ? 'hl' : ''}">
        <td>${i < 3 ? `<span class="medal">${medal[i]}</span>` : i + 1}</td>
        <td><b>${esc(p.name)}</b></td><td class="num gold"><b>${fmt(p.balance)}</b></td>
        <td class="num ${signCls(p.net)}">${fmtSigned(p.net)}</td><td class="num">${fmt(p.rounds)}</td><td class="num">${fmtSigned(p.biggestWin)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="muted" style="margin-bottom:0">Sortiert nach aktuellem Guthaben. Alle Profile dieses Casinos.</p>
    </div>
    <div class="panel section invite-box"></div></div>`));
  fillInvite(root.querySelector('.invite-box'), ctx);
}

/** Zeigt, wie Freunde im Heimnetz mitspielen können */
async function fillInvite(box, ctx) {
  let info = { lan: false, urls: [] };
  try { info = await ctx.get('/api/server-info'); } catch { /* egal */ }
  if (info.lan && info.urls.length) {
    box.innerHTML = `<h2>📶 Freunde einladen</h2>
      <p class="muted">Heimnetz-Modus ist an. Freunde im <b>selben WLAN</b> öffnen auf Handy oder Laptop diese Adresse:</p>
      ${info.urls.map((u) => `<div class="invite-url"><code>${esc(u)}</code><button class="btn btn-sm" data-copy="${esc(u)}">Kopieren</button></div>`).join('')}
      <p class="muted" style="margin-bottom:0">Dort legt jeder sein eigenes Profil an. Guthaben und Rangliste sind für alle gemeinsam.</p>`;
    box.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); toast('Adresse kopiert.', 'ok'); }
      catch { toast('Kopieren nicht möglich – bitte abtippen.', 'err'); }
    }));
  } else if (info.lan) {
    box.innerHTML = `<h2>📶 Freunde einladen</h2><p class="muted" style="margin-bottom:0">Heimnetz-Modus ist an, aber es wurde keine Heimnetz-Adresse gefunden. Ist der PC mit dem WLAN/LAN verbunden?</p>`;
  } else {
    box.innerHTML = `<h2>📶 Mit Freunden spielen</h2>
      <p class="muted" style="margin-bottom:0">Gerade läuft das Casino nur auf diesem PC. Damit Freunde im selben WLAN mit ihrem Handy oder Laptop mitspielen können:
      Casino-Fenster schließen und stattdessen <b>start-heimnetz.bat</b> starten.</p>`;
  }
}

// ---------- Einstellungen ----------
export function settings(root, ctx) {
  const me = ctx.state.me;
  const el = h(`<div>
    <div class="page-head"><h1>⚙️ Einstellungen</h1></div>
    <div class="settings-grid">
      <div class="panel">
        <h2>Sound</h2>
        <p class="muted">Sound-Effekte bei Drehen, Karten, Gewinnen usw.</p>
        <button class="btn" id="sndBtn"></button>
      </div>
      <div class="panel">
        <h2>Profil</h2>
        <form class="row" id="renameForm">
          <input class="input" name="name" maxlength="20" value="${esc(me.name)}" required>
          <button class="btn" type="submit">Umbenennen</button>
        </form>
        <div class="row" style="margin-top:12px"><button class="btn btn-gold" id="switchBtn">Profil wechseln / neu anlegen</button></div>
      </div>
      <div class="panel invite-box"></div>
      <div class="panel danger-zone">
        <h2>Zurücksetzen</h2>
        <p class="muted">Setzt <b>${esc(me.name)}</b> auf 10.000 Chips zurück und löscht Statistik und Verlauf dieses Profils.</p>
        <div class="row" style="flex-wrap:wrap">
          <button class="btn btn-red" id="resetBtn">Profil zurücksetzen</button>
          <button class="btn btn-ghost" id="deleteBtn">Profil löschen</button>
        </div>
      </div>
    </div></div>`);
  root.appendChild(el);
  fillInvite(el.querySelector('.invite-box'), ctx);

  const snd = el.querySelector('#sndBtn');
  const paint = () => (snd.textContent = sfx.enabled ? '🔊 Sound ist AN – ausschalten' : '🔇 Sound ist AUS – einschalten');
  paint();
  snd.addEventListener('click', () => {
    sfx.setEnabled(!sfx.enabled);
    paint();
    document.getElementById('soundToggle').textContent = sfx.enabled ? '🔊' : '🔇';
  });

  el.querySelector('#renameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await ctx.post('/api/me/rename', { name: e.target.name.value });
      await ctx.loadMe();
      toast('Name geändert.', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  });
  el.querySelector('#switchBtn').addEventListener('click', () => ctx.openProfilePicker());
  el.querySelector('#resetBtn').addEventListener('click', async () => {
    if (!(await confirmDialog('Profil zurücksetzen?', `${me.name} bekommt wieder 10.000 Chips. Statistik und Verlauf werden gelöscht.`, 'Zurücksetzen', true))) return;
    try {
      const r = await ctx.post('/api/me/reset');
      await ctx.loadMe();
      ctx.setBalance(r.balance);
      toast('Profil zurückgesetzt – 10.000 Chips!', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  });
  el.querySelector('#deleteBtn').addEventListener('click', async () => {
    if (!(await confirmDialog('Profil löschen?', `${me.name} wird endgültig gelöscht.`, 'Löschen', true))) return;
    try {
      await ctx.post('/api/me/delete');
      session.set('');
      ctx.state.me = null;
      location.hash = '#/';
      ctx.openProfilePicker(true);
    } catch (err) { toast(err.message, 'err'); }
  });
}
