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
  { id: 'keno', name: 'Keno', icon: '🔢', desc: 'Bis zu 10 Zahlen tippen, 10 werden gezogen', tag: 'Lotto', a: '#1d3f5c', b: '#08141f', isNew: true },
  { id: 'baccarat', name: 'Baccarat', icon: '🎴', desc: 'Spieler oder Bank – wer kommt näher an 9?', tag: 'Karten', a: '#5c1a3f', b: '#1f0814', isNew: true },
  { id: 'hilo', name: 'Hi-Lo', icon: '↕️', desc: 'Nächste Karte höher oder niedriger?', tag: 'Karten', a: '#1a4f4a', b: '#081f1c', isNew: true },
  { id: 'wheel', name: 'Glücksrad', icon: '🍀', desc: 'Dreh das Rad – Risiko frei wählbar', tag: 'Glück', a: '#5c4a0a', b: '#1f1903', isNew: true },
  { id: 'tower', name: 'Turm', icon: '🗼', desc: 'Stockwerk für Stockwerk – meide die Fallen', tag: 'Taktik', a: '#3a3f5c', b: '#10121f', isNew: true },
  { id: 'scratch', name: 'Rubbellos', icon: '🎟️', desc: 'Freirubbeln, 3 gleiche gewinnen', tag: 'Los', a: '#4a1d5c', b: '#16081f', isNew: true },
  { id: 'coinflip', name: 'Münzwurf', icon: '🪙', desc: 'Kopf oder Zahl – baue eine Serie auf', tag: 'Serie', a: '#5c4a1a', b: '#1f1808', isNew: true },
  { id: 'limbo', name: 'Limbo', icon: '📈', desc: 'Wähle dein Ziel – liegt das Ergebnis drüber?', tag: 'Schnell', a: '#1d5c3a', b: '#081f12', isNew: true },
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
  if (!session.id) return null;
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

export async function openProfilePicker(force = false) {
  const list = await get('/api/profiles').catch(() => []);
  const el = h(`<div>
    <h2>${force ? 'Willkommen im Spaß-Casino! 🎰' : 'Profil wählen'}</h2>
    <p class="muted" style="margin:0">Nur Spielgeld – alles bleibt auf deinem PC. Jedes Profil startet mit 10.000 Chips.</p>
    <div class="profile-list">${list.length ? list.map((p) => `
      <button class="profile-item ${p.id === session.id ? 'current' : ''}" data-id="${esc(p.id)}">
        <span class="avatar">${esc(p.name.slice(0, 1).toUpperCase())}</span>
        <span class="pname">${esc(p.name)}</span><span class="pbal">${fmt(p.balance)}</span>
      </button>`).join('') : '<p class="muted">Noch keine Profile – leg eins an:</p>'}</div>
    <form class="row" id="newProfile">
      <input class="input" name="name" maxlength="20" placeholder="Neuer Name" autocomplete="off" required>
      <button class="btn btn-gold" type="submit">Anlegen</button>
    </form></div>`);
  const close = modal(el, { closable: !force || !!state.me });
  el.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', async () => {
    sfx.click();
    session.set(b.dataset.id);
    close();
    await loadMe();
    rerender();
  }));
  el.querySelector('#newProfile').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const p = await post('/api/profiles', { name: e.target.name.value });
      session.set(p.id);
      close();
      await loadMe();
      sfx.coin();
      toast(`Hallo ${p.name}! Du startest mit ${fmt(p.balance)} Chips.`, 'ok');
      rerender();
    } catch (err) { toast(err.message, 'err'); }
  });
  setTimeout(() => el.querySelector('input')?.focus(), 50);
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
      state.cleanup = (await pages[route](appEl, { ...gameCtx, GAMES, state, openProfilePicker, loadMe })) || null;
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
    await loadMe();
  } catch (e) {
    toast(e.message, 'err');
  }
  if (!state.me) await openProfilePicker(true);
  render();
})();
