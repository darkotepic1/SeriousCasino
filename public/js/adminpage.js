// Admin-Bereich: Chips geben/abziehen/setzen, Profile zurücksetzen, Passwörter neu vergeben, Spieler löschen.
import { h, esc, fmt, fmtSigned, toast, confirmDialog, modal } from './ui.js';
import { sfx } from './sound.js';
import { apiFetch } from './api.js';

const signCls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const ADMIN_KEY = 'casino.admin';
const adminToken = {
  get() { try { return sessionStorage.getItem(ADMIN_KEY) || ''; } catch { return ''; } },
  set(t) { try { if (t) sessionStorage.setItem(ADMIN_KEY, t); else sessionStorage.removeItem(ADMIN_KEY); } catch { /* egal */ } },
};

async function adminApi(method, url, body) {
  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Admin': adminToken.get() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* leer */ }
  if (!res.ok) throw Object.assign(new Error(data.error || `Fehler ${res.status}`), { status: res.status });
  return data;
}

export async function admin(root, ctx) {
  const wrap = h('<div><div class="page-head"><a class="back-link" href="#/settings">← Einstellungen</a><h1>🛠️ Admin-Bereich</h1></div><div class="admin-body"></div></div>');
  root.appendChild(wrap);
  const body = wrap.querySelector('.admin-body');
  let alive = true;

  async function show() {
    if (!alive) return;
    const st = await adminApi('GET', '/api/admin/status');
    if (st.loggedIn) return showPanel();
    if (st.canSetupHere) {
      body.innerHTML = `<div class="panel admin-auth">
        <h2>Admin-Passwort festlegen</h2>
        <p class="muted">Das ist der erste Besuch im Admin-Bereich. Leg ein Admin-Passwort fest (mind. 6 Zeichen). Nur wer es kennt, kann Chips verteilen.</p>
        <form class="auth-form" id="setupForm">
          <input class="input" name="pw" type="password" placeholder="Admin-Passwort" autocomplete="new-password" minlength="6" required>
          <input class="input" name="pw2" type="password" placeholder="Nochmal zur Bestätigung" autocomplete="new-password" minlength="6" required>
          <button class="btn btn-gold" type="submit">Festlegen</button>
        </form></div>`;
      body.querySelector('#setupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (e.target.pw.value !== e.target.pw2.value) return toast('Die Passwörter stimmen nicht überein.', 'err');
        try {
          const r = await adminApi('POST', '/api/admin/setup', { password: e.target.pw.value });
          adminToken.set(r.token);
          toast('Admin-Passwort gespeichert.', 'ok');
          show();
        } catch (err) { toast(err.message, 'err'); }
      });
      return;
    }
    if (!st.isSet) {
      body.innerHTML = `<div class="panel admin-auth">
        <h2>Noch kein Admin-Passwort</h2>
        <p class="muted">Aus Sicherheitsgründen kann das Admin-Passwort hier nicht über Internet oder Heimnetz festgelegt werden.</p>
        <p><b>Im Codespace:</b> unten im Terminal eingeben: <code>npm run admin</code><br>
        <b>Am PC:</b> den Admin-Bereich direkt am PC öffnen (<code>http://127.0.0.1:3000</code>) oder <b>admin-passwort.bat</b> starten.</p>
        <button class="btn" id="again">Neu laden</button></div>`;
      body.querySelector('#again').addEventListener('click', show);
      return;
    }
    body.innerHTML = `<div class="panel admin-auth">
      <h2>Als Admin anmelden</h2>
      <form class="auth-form" id="adminLoginForm">
        <input class="input" name="pw" type="password" placeholder="Admin-Passwort" autocomplete="current-password" required>
        <button class="btn btn-gold" type="submit">Anmelden</button>
      </form></div>`;
    body.querySelector('#adminLoginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await adminApi('POST', '/api/admin/login', { password: e.target.pw.value });
        adminToken.set(r.token);
        show();
      } catch (err) { toast(err.message, 'err'); e.target.pw.select(); }
    });
    setTimeout(() => body.querySelector('input')?.focus(), 50);
  }

  async function showPanel() {
    let players;
    try { players = await adminApi('GET', '/api/admin/players'); } catch (e) {
      if (e.status === 401) { adminToken.set(''); return show(); }
      throw e;
    }
    if (!alive) return;
    const when = (t) => (t ? new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');
    body.innerHTML = `<div class="panel">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;margin-bottom:10px">
        <h2 style="margin:0">Spieler (${players.length})</h2>
        <button class="btn btn-sm" id="adminLogout">Admin abmelden</button>
      </div>
      <p class="muted" style="margin-top:0">Betrag eingeben, dann <b>+</b> (geben), <b>−</b> (abziehen) oder <b>=</b> (Guthaben genau auf diesen Wert setzen).</p>
      ${players.length ? `<div class="tbl-wrap"><table class="tbl admin-tbl">
        <thead><tr><th>Spieler</th><th class="num">Chips</th><th class="num">Gewinn/Verlust</th><th class="num">Runden</th><th>Zuletzt</th><th>Chips ändern</th><th>Weiteres</th></tr></thead>
        <tbody>${players.map((p) => `<tr data-name="${esc(p.name)}">
          <td><b>${esc(p.name)}</b>${p.hasPassword ? ' 🔒' : ''}</td>
          <td class="num gold"><b>${fmt(p.balance)}</b></td>
          <td class="num ${signCls(p.net)}">${fmtSigned(p.net)}</td>
          <td class="num">${fmt(p.rounds)}</td>
          <td class="muted">${when(p.lastPlayed)}</td>
          <td><div class="admin-adjust">
            <input class="input" type="number" inputmode="numeric" min="0" step="1" placeholder="Betrag" value="1000">
            <button class="btn btn-sm btn-green" data-a="add" title="Chips geben">+</button>
            <button class="btn btn-sm btn-red" data-a="sub" title="Chips abziehen">−</button>
            <button class="btn btn-sm" data-a="set" title="Guthaben genau setzen">=</button>
          </div></td>
          <td><div class="admin-more">
            <button class="btn btn-sm" data-a="pw">Passwort</button>
            <button class="btn btn-sm" data-a="reset">Zurücksetzen</button>
            <button class="btn btn-sm btn-ghost" data-a="del">Löschen</button>
          </div></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Noch keine Spieler.</p>'}
    </div>`;

    // ---------- Live-Crash steuern + Online-Liste ----------
    body.insertAdjacentHTML('beforeend', `<div class="panel section lc-admin">
      <h2>🚀 Live-Crash steuern <span class="muted" style="font-size:.8rem;font-weight:500">(für Spieler unsichtbar)</span></h2>
      <div class="lca-state"></div>
      <div class="row" style="flex-wrap:wrap;margin-top:10px">
        <button class="btn btn-red" data-rig="now">💥 Jetzt crashen</button>
        <input class="input lca-val" type="number" step="0.01" min="1" placeholder="z. B. 1,50" style="max-width:130px">
        <button class="btn" data-rig="current">Diese Runde crasht bei …</button>
        <button class="btn" data-rig="next">Nächste Runde crasht bei …</button>
        <button class="btn btn-ghost" data-rig="clear">Vorgabe löschen</button>
      </div>
      <p class="muted" style="margin:8px 0 0;font-size:.8rem">„Diese Runde“ geht nur, solange die Rakete noch unter dem Wert ist. 1,00 = sofortiger Absturz beim Start.</p>
    </div>
    <div class="panel section"><h2>🟢 Gerade online</h2><div class="lca-online"></div></div>`);
    const lcaState = body.querySelector('.lca-state');
    const lcaOnline = body.querySelector('.lca-online');
    const paintLc = (s) => {
      const phase = { betting: `Wettphase (${Math.ceil(s.timeLeft / 1000)} s)`, running: `fliegt – <b>${s.multiplier.toFixed(2)}×</b>`, crashed: `abgestürzt bei ${s.crashPoint?.toFixed(2)}×` }[s.phase];
      lcaState.innerHTML = `<div class="kv"><span>Runde</span><span>${phase}</span></div>
        <div class="kv"><span>Echter Absturzpunkt</span><span class="gold">${s.realCrashPoint ? s.realCrashPoint.toFixed(2) + '×' : '– (wird beim Start ausgelost)'}${s.rigged ? ' · <span class="neg">manipuliert</span>' : ''}</span></div>
        <div class="kv"><span>Vorgabe nächste Runde</span><span>${s.nextRig ? s.nextRig.toFixed(2) + '×' : 'keine (Zufall)'}</span></div>
        <div class="kv"><span>Einsätze</span><span>${s.bets.length ? s.bets.map((b) => `${esc(b.name)} ${fmt(b.bet)}${b.cashedAt ? ` ✓${b.cashedAt.toFixed(2)}×` : ''}`).join(' · ') : 'keine'}</span></div>`;
    };
    const lcLoop = async () => {
      if (!alive || !body.contains(lcaState)) return;
      try {
        paintLc(await adminApi('GET', '/api/admin/livecrash'));
        const o = await adminApi('GET', '/api/admin/online');
        lcaOnline.innerHTML = o.online.map((x) => `<div class="kv"><span>${esc(x.name)}</span><span>${esc(x.where)}</span></div>`).join('') || '<p class="muted" style="margin:0">Niemand.</p>';
      } catch { /* egal */ }
      setTimeout(lcLoop, 1000);
    };
    lcLoop();
    body.querySelectorAll('[data-rig]').forEach((b) => b.addEventListener('click', async () => {
      try {
        const value = Number(String(body.querySelector('.lca-val').value).replace(',', '.'));
        paintLc(await adminApi('POST', '/api/admin/livecrash/rig', { mode: b.dataset.rig, value }));
        toast('Erledigt.', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    }));

    body.querySelector('#adminLogout').addEventListener('click', async () => {
      try { await adminApi('POST', '/api/admin/logout'); } catch { /* egal */ }
      adminToken.set('');
      show();
    });

    body.querySelectorAll('tr[data-name]').forEach((tr) => {
      const name = tr.dataset.name;
      const input = tr.querySelector('input');
      const done = async (msg) => {
        toast(msg, 'ok');
        sfx.coin();
        if (ctx.state.me && ctx.state.me.name === name) await ctx.refreshMe();
        showPanel();
      };
      const run = async (fn) => {
        try { await fn(); } catch (e) {
          if (e.status === 401) { adminToken.set(''); show(); }
          toast(e.message, 'err');
        }
      };

      tr.querySelectorAll('.admin-adjust button').forEach((b) => b.addEventListener('click', () => run(async () => {
        const raw = String(input.value).trim();
        const n = Math.floor(Number(raw));
        if (!raw || !Number.isFinite(n) || n < 0) throw new Error('Bitte einen Betrag eingeben.');
        const a = b.dataset.a;
        const r = await adminApi('POST', '/api/admin/adjust', { name, mode: a === 'set' ? 'set' : 'add', amount: a === 'sub' ? -n : n });
        await done(`${name}: ${fmt(r.before)} → ${fmt(r.balance)} Chips`);
      })));

      tr.querySelector('[data-a="reset"]').addEventListener('click', () => run(async () => {
        if (!(await confirmDialog('Profil zurücksetzen?', `${name} bekommt wieder 10.000 Chips, Statistik und Verlauf werden gelöscht.`, 'Zurücksetzen', true))) return;
        await adminApi('POST', '/api/admin/reset', { name });
        await done(`${name} wurde zurückgesetzt.`);
      }));

      tr.querySelector('[data-a="del"]').addEventListener('click', () => run(async () => {
        if (!(await confirmDialog('Spieler löschen?', `${name} wird endgültig gelöscht – samt Guthaben und Statistik.`, 'Löschen', true))) return;
        await adminApi('POST', '/api/admin/delete', { name });
        await done(`${name} wurde gelöscht.`);
      }));

      tr.querySelector('[data-a="pw"]').addEventListener('click', () => {
        const form = h(`<form class="auth-form" style="margin:0">
          <h2>Neues Passwort für ${esc(name)}</h2>
          <p class="muted" style="margin:0">Z. B. wenn das Passwort vergessen wurde. ${esc(name)} wird überall abgemeldet und meldet sich mit dem neuen Passwort an.</p>
          <input class="input" name="pw" type="text" placeholder="Neues Passwort (mind. 4 Zeichen)" minlength="4" required autocomplete="off">
          <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" type="button" data-x>Abbrechen</button><button class="btn btn-gold" type="submit">Speichern</button></div>
        </form>`);
        const close = modal(form);
        form.querySelector('[data-x]').addEventListener('click', close);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          run(async () => {
            await adminApi('POST', '/api/admin/password', { name, password: form.pw.value });
            close();
            await done(`Neues Passwort für ${name} gespeichert.`);
          });
        });
        setTimeout(() => form.pw.focus(), 50);
      });
    });
  }

  await show();
  return () => { alive = false; };
}
