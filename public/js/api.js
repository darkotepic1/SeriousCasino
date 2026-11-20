// Kommunikation mit dem lokalen Server.
const KEY = 'casino.profileId';

function readId() {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}

export const session = {
  id: readId(),
  set(id) {
    this.id = id || '';
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch { /* egal */ }
  },
};

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Profile-Id': session.id },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw Object.assign(new Error('Server nicht erreichbar – läuft start.bat noch?'), { status: 0 });
  }
  let data = {};
  try { data = await res.json(); } catch { /* leer */ }
  if (!res.ok) throw Object.assign(new Error(data.error || `Fehler ${res.status}`), { status: res.status });
  return data;
}

export const get = (url) => request('GET', url);
export const post = (url, body = {}) => request('POST', url, body);
