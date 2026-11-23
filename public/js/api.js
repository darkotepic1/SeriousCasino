// Kommunikation mit dem Server. Angemeldet wird über ein zufälliges Token (kein Passwort im Speicher).
import { API_BASE } from './config.js';

const KEY = 'casino.token';

function readToken() {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}

export const session = {
  token: readToken(),
  set(token) {
    this.token = token || '';
    try {
      if (token) localStorage.setItem(KEY, token);
      else localStorage.removeItem(KEY);
      localStorage.removeItem('casino.profileId'); // altes Format aufräumen
    } catch { /* egal */ }
  },
};

// ---------- "Server wacht auf" (kostenlose Server schlafen nach 15 Min. ohne Besucher) ----------
let wakeEl = null;
function showWaking(on) {
  if (on && !wakeEl) {
    wakeEl = document.createElement('div');
    wakeEl.className = 'waking';
    wakeEl.innerHTML = '<div class="waking-card"><div class="waking-spin">🎰</div><b>Der Server wacht auf …</b><span>Nach einer Pause dauert das bis zu einer Minute. Bitte kurz warten.</span></div>';
    document.body.appendChild(wakeEl);
  } else if (!on && wakeEl) {
    wakeEl.remove();
    wakeEl = null;
  }
}

/** fetch mit Wiederholungen, solange der Server noch aufwacht (nur im Cloud-Betrieb) */
export async function apiFetch(url, init) {
  const started = Date.now();
  let showTimer = null;
  // Nur wenn eine Antwort wirklich lange ausbleibt (Kaltstart), nicht schon bei kurzen Verzögerungen
  if (API_BASE) showTimer = setTimeout(() => showWaking(true), 8000);
  try {
    for (;;) {
      let res = null;
      try { res = await fetch(API_BASE + url, init); } catch { /* Server nicht erreichbar */ }
      const sleeping = !res || [502, 503, 504].includes(res.status);
      if (!sleeping || !API_BASE || Date.now() - started > 120000) {
        if (!res) throw Object.assign(new Error(API_BASE ? 'Server nicht erreichbar – bitte später nochmal versuchen.' : 'Server nicht erreichbar – läuft das Casino noch?'), { status: 0 });
        return res;
      }
      showWaking(true);
      await new Promise((r) => setTimeout(r, 3000));
    }
  } finally {
    clearTimeout(showTimer);
    showWaking(false);
  }
}

async function request(method, url, body) {
  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Session': session.token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* leer */ }
  if (!res.ok) throw Object.assign(new Error(data.error || `Fehler ${res.status}`), { status: res.status });
  return data;
}

export const get = (url) => request('GET', url);
export const post = (url, body = {}) => request('POST', url, body);
