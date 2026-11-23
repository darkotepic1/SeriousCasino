// Haupt-App: Profile, Guthaben-Anzeige, Navigation, Seitenwechsel.
import { get, post, session } from './api.js';
import { sfx } from './sound.js';
import { h, esc, fmt, toast, modal, betControl, confetti } from './ui.js';
import * as pages from './pages.js';

export const GAMES = [
  { id: 'slots', name: 'Slots', icon: '🎰', desc: '5 Walzen, 10 Gewinnlinien', tag: 'Klassiker', a: '#5a3d06', b: '#1d1402' },
  { id: 'blackjack', name: 'Blackjack', icon: '🃏', desc: 'Schlag den Dealer – Blackjack zahlt 3:2', tag: 'Karten', a: '#0f5132', b: '#06261a' },
  { id: 'roulette', name: 'Roulette', icon: '🎡', desc: 'Europäisch mit einer Null', tag: 'Tisch', a: '#5c1a1d', b: '#1f0809' },
  { id: 'poker', name: 'Video Poker', icon: '♠️', desc: 'Jacks or Better', tag: 'Karten', a: '#1b2f5c', b: '#08101f' },
  { id: 'crash', name: 'Crash', icon: '🚀', desc: 'Steig aus, bevor es kracht', tag: 'Nervenkitzel', a: '#3b1d5c', b: '#12081f' },
  { id: 'mines', name: 'Mines', icon: '💣', desc: 'Finde Diamanten, meide Minen', tag: 'Taktik', a: '#1d4a4f', b: '#071a1c' },
  { id: 'plinko', name: 'Plinko', icon: '🎯', desc: 'Kugeln fallen lassen, Multiplikator fangen', tag: 'Glück', a: '#5c3a1a', b: '#1f1208' },
  { id: 'dice', name: 'Würfel', icon: '🎲', desc: 'Über oder unter – du bestimmst die Chance', tag: 'Schnell', a: '#2f4f1d', b: '#0e1a08' },
  { id: 'keno', name: 'Keno', icon: '🔢', desc: 'Bis zu 10 Zahlen tippen, 10 werden gezogen', tag: 'Lotto', a: '#1d3f5c', b: '#08141f' },
  { id: 'baccarat', name: 'Baccarat', icon: '🎴', desc: 'Spieler oder Bank – wer kommt näher an 9?', tag: 'Karten', a: '#5c1a3f', b: '#1f0814' },
  { id: 'hilo', name: 'Hi-Lo', icon: '↕️', desc: 'Nächste Karte höher oder niedriger?', tag: 'Karten', a: '#1a4f4a', b: '#081f1c' },
  { id: 'wheel', name: 'Glücksrad', icon: '🍀', desc: 'Dreh das Rad – Risiko frei wählbar', tag: 'Glück', a: '#5c4a0a', b: '#1f1903' },
  { id: 'tower', name: 'Turm', icon: '🗼', desc: 'Stockwerk für Stockwerk – meide die Fallen', tag: 'Taktik', a: '#3a3f5c', b: '#10121f' },
  { id: 'scratch', name: 'Rubbellos', icon: '🎟️', desc: 'Freirubbeln, 3 gleiche gewinnen', tag: 'Los', a: '#4a1d5c', b: '#16081f' },
  { id: 'coinflip', name: 'Münzwurf', icon: '🪙', desc: 'Kopf oder Zahl – baue eine Serie auf', tag: 'Serie', a: '#5c4a1a', b: '#1f1808' },
  { id: 'limbo', name: 'Limbo', icon: '📈', desc: 'Wähle dein Ziel – liegt das Ergebnis drüber?', tag: 'Schnell', a: '#1d5c3a', b: '#081f12' },
{ id: 'craps', name: 'Craps', icon: '🎲', desc: 'Pass Line, Field & Co. – der Würfeltisch', tag: 'Würfel', a: '#1f5c3a', b: '#08200f', isNew: true },
  { id: 'sicbo', name: 'Sic Bo', icon: '🀄', desc: 'Drei Würfel, viele Wetten', tag: 'Würfel', a: '#5c1a2e', b: '#1f0810', isNew: true },
  { id: 'threecard', name: 'Drei-Karten-Poker', icon: '🂠', desc: 'Ante, Paar-Plus und Dealer-Duell', tag: 'Karten', a: '#2e1a5c', b: '#0e081f', isNew: true },
  { id: 'war', name: 'Kartenkrieg', icon: '⚔️', desc: 'Höhere Karte gewinnt – oder Krieg!', tag: 'Karten', a: '#5c2a1a', b: '#1f0d08', isNew: true },
  { id: 'reddog', name: 'Red Dog', icon: '🐕', desc: 'Fällt die dritte Karte dazwischen?', tag: 'Karten', a: '#5c1a1a', b: '#1f0808', isNew: true },
  { id: 'dragontiger', name: 'Drache & Tiger', icon: '🐉', desc: 'Eine Karte, ein Duell, schnell entschieden', tag: 'Karten', a: '#5c3a0a', b: '#1f1303', isNew: true },
  { id: 'horses', name: 'Pferderennen', icon: '🏇', desc: 'Setz auf Favorit oder Außenseiter', tag: 'Rennen', a: '#2f5a2a', b: '#0e1f0b', isNew: true },
  { id: 'bingo', name: 'Schnell-Bingo', icon: '🔵', desc: '40 Kugeln – wie viele Linien schaffst du?', tag: 'Lotto', a: '#1b4f8a', b: '#081a30', isNew: true },
  { id: 'cups', name: 'Hütchenspiel', icon: '🥤', desc: 'Wo ist die Kugel?', tag: 'Glück', a: '#4a3a1d', b: '#1a1308', isNew: true },
  { id: 'rps', name: 'Schere-Stein-Papier', icon: '✌️', desc: 'Gegen das Haus – Sieg zahlt 1,97×', tag: 'Schnell', a: '#1d4a5c', b: '#08191f', isNew: true },
];
const state = { me: null, balance: 0, shownBalance: 0, cleanup: null, route: null };

// ---------- Guthaben-Anzeige ----------
const balEl = document.getElementById('balance');
const balBox = document.getElementById('balanceBox');
let balAnim = null;

export function getBalance() {
  return state.balance;
}

/** Setzt das angezeigte Guthaben (mit Zähl-Animation) */
export function setBalance(n) {
  const from = state.shownBalance;
  state.balance = n;
  if (state.me) state.me.balance = n;
  cancelAnimationFrame(balAnim);
  if (n !== from) {
    balBox.classList.remove('bump-up', 'bump-down');
    void balBox.offsetWidth;
    balBox.classList.add(n > from ? 'bump-up' : 'bump-down');
  }
  const t0 = performance.now();
  const dur = Math.min(900, 250 + Math.abs(n - from) / 20);
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - (1 - k) ** 3;
    state.shownBalance = Math.round(from + (n - from) * e);
    balEl.textContent = fmt(state.shownBalance);
    if (k < 1) balAnim = requestAnimationFrame(step);
  };
  balAnim = requestAnimationFrame(step);
  updateBanner();
}

// ---------- Profil ----------
async function loadMe() {
  if (!session.token) return null;
  try {
    state.me = await get('/api/me');
    document.getElementById('profileName').textContent = state.me.name;
    document.getElementById('profileAvatar').textContent = state.me.name.slice(0, 1).toUpperCase();
    setBalance(state.me.balance);
    return state.me;
  } catch (e) {
    if (e.status === 401) { session.set(''); state.me = null; return null; }
    throw e;
  }
}

export async function refreshMe() {
  await loadMe();
}

export const server = { online: false, lan: false, requirePassword: false };

/** Anmelden bzw. Profil wechseln */
export async function openProfilePicker(force = false) {
  const list = await get('/api/profiles').catch(() => []);
  const needPw = server.requirePassword;
  const el = h(`<div>
    <h2>${force ? 'Willkommen im Spaß-Casino! 🎰' : 'Profil wechseln'}</h2>
    <p class="muted" style="margin:0">${server.online
      ? 'Online-Casino mit Spielgeld. Melde dich mit Name und Passwort an oder leg ein neues Profil an.'
      : 'Nur Spielgeld. Jedes Profil startet mit 10.000 Chips.'}</p>
    <div class="profile-list">${list.length ? list.map((p) => `
      <button class="profile-item ${state.me && p.name === state.me.name ? 'current' : ''}" data-name="${esc(p.name)}" data-pw="${p.hasPassword ? 1 : 0}">
        <span class="avatar">${esc(p.name.slice(0, 1).toUpperCase())}</span>
        <span class="pname">${esc(p.name)}${p.hasPassword ? ' <span title="mit Passwort">🔒</span>' : ''}</span><span class="pbal">${fmt(p.balance)}</span>
      </button>`).join('') : '<p class="muted">Noch keine Profile – leg eins an:</p>'}</div>
    <form class="auth-form hidden" id="loginForm">
      <h3>Anmelden als <span class="gold login-name"></span></h3>
      <input type="hidden" name="name">
      <div class="row"><input class="input" name="password" type="password" placeholder="Passwort" autocomplete="current-password" required>
      <button class="btn btn-gold" type="submit">Anmelden</button></div>
    </form>
    <form class="auth-form" id="newProfile">
      <h3>Neues Profil</h3>
      <input class="input" name="name" maxlength="20" placeholder="Name" autocomplete="username" required>
      <input class="input" name="password" type="password" maxlength="100" autocomplete="new-password"
        placeholder="${needPw ? 'Passwort (mind. 4 Zeichen)' : 'Passwort (optional)'}" ${needPw ? 'required minlength="4"' : ''}>
      <button class="btn btn-gold" type="submit">Profil anlegen</button>
    </form></div>`);
  const close = modal(el, { closable: !force || !!state.me });
  const loginForm = el.querySelector('#loginForm');

  async function finishLogin(r, greeting) {
    if (state.me && session.token) post('/api/me/logout').catch(() => {});
    session.set(r.token);
    close();
    await loadMe();
    sfx.coin();
    if (greeting) toast(greeting, 'ok');
    rerender();
  }

  el.querySelectorAll('[data-name]').forEach((b) => b.addEventListener('click', async () => {
    sfx.click();
    const name = b.dataset.name;
    if (b.dataset.pw === '1' || needPw) {
      loginForm.classList.remove('hidden');
      loginForm.name.value = name;
      loginForm.querySelector('.login-name').textContent = name;
      loginForm.password.value = '';
      loginForm.password.focus();
      return;
    }
    try { await finishLogin(await post('/api/login', { name })); } catch (err) { toast(err.message, 'err'); }
  }));
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await finishLogin(await post('/api/login', { name: loginForm.name.value, password: loginForm.password.value }));
    } catch (err) { toast(err.message, 'err'); loginForm.password.select(); }
  });
  el.querySelector('#newProfile').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await post('/api/profiles', { name: e.target.name.value, password: e.target.password.value });
      await finishLogin(r, `Hallo ${r.name}! Du startest mit ${fmt(r.balance)} Chips.`);
    } catch (err) { toast(err.message, 'err'); }
  });
  setTimeout(() => el.querySelector('#newProfile input')?.focus(), 50);
}

/** Abmelden (dieses Gerät) */
export async function logout() {
  try { await post('/api/me/logout'); } catch { /* egal */ }
  session.set('');
  state.me = null;
  location.hash = '#/';
  openProfilePicker(true);
}

// ---------- Banner: Tagesbonus & Nachfüllen ----------
const banner = document.getElementById('banner');
let bannerTimer = null;
function updateBanner() {
  const me = state.me;
  clearTimeout(bannerTimer);
  if (!me) return banner.classList.add('hidden');
  const parts = [];
  if (me.daily?.available) {
    parts.push(`<span>🎁 Dein Tagesbonus wartet: <b class="gold">+${fmt(me.daily.amount)} Chips</b></span>
      <button class="btn btn-gold btn-sm" data-act="daily">Abholen</button>`);
  }
  if (state.balance < (me.refill?.threshold ?? 100)) {
    const wait = (me.refill?.nextAt ?? 0) - Date.now();
    if (wait <= 0) {
      parts.push(`<span>💸 Fast pleite? </span><button class="btn btn-green btn-sm" data-act="refill">Nachfüllen (+${fmt(me.refill?.amount ?? 5000)})</button>`);
    } else {
      const m = Math.floor(wait / 60000), s = Math.floor((wait % 60000) / 1000);
      parts.push(`<span>⏳ Nachfüllen wieder möglich in <b>${m}:${String(s).padStart(2, '0')}</b> Min.</span>`);
      bannerTimer = setTimeout(updateBanner, 1000);
    }
  }
  if (!parts.length) return banner.classList.add('hidden');
  banner.innerHTML = parts.join('<span class="muted">·</span>');
  banner.classList.remove('hidden');
  banner.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
    try {
      const r = await post(`/api/me/${b.dataset.act}`);
      state.me = { ...state.me, ...r };
      setBalance(r.balance);
      sfx.bigWin();
      confetti(50);
      toast(`+${fmt(r.amount)} Chips gutgeschrieben!`, 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }));
}

// ---------- Router ----------
const appEl = document.getElementById('app');
const gameCtx = {
  get, post, getBalance, setBalance, refreshMe, toast,
  bet: (opts) => betControl({ ...opts, getBalance }),
};

async function render() {
  const route = (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0];
  state.route = route;
  document.getElementById('mainnav').classList.remove('open');
  if (state.cleanup) { try { state.cleanup(); } catch { /* egal */ } state.cleanup = null; }
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === route));
  appEl.replaceChildren();
  window.scrollTo(0, 0);
  if (!state.me) return;

  const game = GAMES.find((g) => g.id === route);
  try {
    if (game) {
      const root = h(`<div>
        <div class="page-head"><a class="back-link" href="#/">← Spiele</a><h1>${game.icon} ${esc(game.name)}</h1></div>
        <div class="game-root"></div></div>`);
      appEl.appendChild(root);
      const mod = await import(`./games/${game.id}.js`);
      if (state.route !== route) return; // inzwischen weiternavigiert
      state.cleanup = (await mod.default(root.querySelector('.game-root'), gameCtx)) || null;
    } else if (pages[route]) {
      state.cleanup = (await pages[route](appEl, { ...gameCtx, GAMES, state, server, openProfilePicker, loadMe, logout })) || null;
    } else {
      location.hash = '#/';
    }
  } catch (e) {
    console.error(e);
    appEl.appendChild(h(`<div class="panel"><h2>Ups.</h2><p class="muted">${esc(e.message)}</p></div>`));
  }
}
function rerender() { render(); }

// ---------- Start ----------
document.getElementById('profileBtn').addEventListener('click', () => openProfilePicker());
document.getElementById('menuBtn').addEventListener('click', () => document.getElementById('mainnav').classList.toggle('open'));
const soundBtn = document.getElementById('soundToggle');
const paintSound = () => (soundBtn.textContent = sfx.enabled ? '🔊' : '🔇');
soundBtn.addEventListener('click', () => { sfx.setEnabled(!sfx.enabled); paintSound(); });
paintSound();
window.addEventListener('hashchange', render);

(async () => {
  try {
    Object.assign(server, await get('/api/server-info'));
  } catch { /* Server evtl. noch nicht da */ }
  try {
    await loadMe();
  } catch (e) {
    toast(e.message, 'err');
  }
  if (!state.me) await openProfilePicker(true);
  render();
})();
