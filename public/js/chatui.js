// Chat-Leiste (rechts ausklappbar) mit Ungelesen-Zähler. Befehl: /tip Name Betrag
import { h, esc, fmt, toast } from './ui.js';
import { sfx } from './sound.js';
import { get, post } from './api.js';

const SEEN_KEY = 'casino.chatSeen';
let open = false, since = 0, timer = 0, messages = [], onBalance = null;
let seen = 0;
try { seen = Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { /* egal */ }

const time = (t) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

const el = h(`<aside class="chat-drawer" aria-label="Chat">
  <div class="chat-head"><b>💬 Chat</b><button class="icon-btn chat-close" aria-label="Schließen">✕</button></div>
  <div class="chat-list"></div>
  <form class="chat-form"><input class="input" maxlength="240" placeholder="Nachricht … (/tip Name Betrag)" autocomplete="off"><button class="btn btn-gold" type="submit">➤</button></form>
</aside>`);
const listEl = el.querySelector('.chat-list');
const input = el.querySelector('input');

function badge(n) {
  const b = document.getElementById('chatBadge');
  if (!b) return;
  b.textContent = n > 9 ? '9+' : n;
  b.classList.toggle('hidden', !n);
}

function render(newOnes = []) {
  const atBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 60;
  listEl.innerHTML = messages.map((m) => m.system
    ? `<div class="cm sys"><span>${esc(m.text)}</span><time>${time(m.at)}</time></div>`
    : `<div class="cm"><b>${esc(m.name)}</b><span class="cm-lvl">${m.level}</span><time>${time(m.at)}</time><p>${esc(m.text)}</p></div>`).join('')
    || '<p class="muted" style="text-align:center">Noch keine Nachrichten – sag Hallo! 👋</p>';
  if (atBottom || newOnes.length) listEl.scrollTop = listEl.scrollHeight;
}

async function poll() {
  clearTimeout(timer);
  try {
    const r = await get(`/api/chat?since=${since}`);
    if (r.messages.length) {
      messages = [...messages, ...r.messages].slice(-100);
      since = messages[messages.length - 1].at;
      if (open) render(r.messages);
    }
  } catch { /* nächster Versuch */ }
  if (open) {
    seen = since;
    try { localStorage.setItem(SEEN_KEY, String(seen)); } catch { /* egal */ }
    badge(0);
  } else badge(messages.filter((m) => m.at > seen).length);
  timer = setTimeout(poll, open ? 2500 : 10000);
}

function setOpen(v) {
  open = v;
  document.body.classList.toggle('chat-open', v);
  if (v) { render(); setTimeout(() => input.focus(), 50); }
  poll();
}

el.querySelector('.chat-close').addEventListener('click', () => setOpen(false));
el.querySelector('.chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  try {
    const tip = /^\/tip\s+(.+?)\s+(\d+)$/i.exec(text);
    if (tip) {
      const r = await post('/api/tip', { to: tip[1], amount: Number(tip[2]) });
      onBalance?.(r.balance);
      sfx.coin();
      toast(`🎁 ${fmt(r.amount)} Chips an ${r.to} geschenkt.`, 'ok');
    } else {
      await post('/api/chat/send', { text });
      sfx.click();
    }
    input.value = '';
    poll();
  } catch (err) { toast(err.message, 'err'); }
});

/** Einbinden: Knopf in der Kopfzeile + Leiste */
export function initChat({ setBalance }) {
  onBalance = setBalance;
  document.body.appendChild(el);
  const btn = h('<button class="icon-btn chat-btn" title="Chat" aria-label="Chat">💬<span class="nav-badge hidden" id="chatBadge"></span></button>');
  document.querySelector('.topbar-right').prepend(btn);
  btn.addEventListener('click', () => setOpen(!open));
  poll();
}
