// Kommunikation mit dem Server. Angemeldet wird über ein zufälliges Token (kein Passwort im Speicher).
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

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Session': session.token },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw Object.assign(new Error('Server nicht erreichbar – läuft das Casino noch?'), { status: 0 });
  }
  let data = {};
  try { data = await res.json(); } catch { /* leer */ }
  if (!res.ok) throw Object.assign(new Error(data.error || `Fehler ${res.status}`), { status: res.status });
  return data;
}

export const get = (url) => request('GET', url);
export const post = (url, body = {}) => request('POST', url, body);
