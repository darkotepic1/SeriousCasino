// Wett-Tabelle mit Tabs: Meine Wetten / Alle Wetten (live) / Top-Gewinne – unter jedem Spiel und in der Lobby.
import { h, esc, fmt } from './ui.js';

const time = (t) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

export function betsPanel(ctx, { game = null, GAMES, title = null } = {}) {
  let tab = game ? 'mine' : 'all';
  let alive = true, timer = 0;
  const gname = (id) => GAMES.find((g) => g.id === id)?.name || ctx.gameNames?.[id] || id;
  const gicon = (id) => GAMES.find((g) => g.id === id)?.icon || '🎮';

  const el = h(`<div class="panel bets-panel">
    ${title ? `<h2>${esc(title)}</h2>` : ''}
    <div class="bets-tabs">
      ${game ? '<button data-t="mine">Meine Wetten</button>' : ''}
      <button data-t="all">Alle Wetten <span class="live-dot"></span></button>
      <button data-t="top">Top-Gewinne (24 h)</button>
    </div>
    <div class="tbl-wrap"><table class="tbl bets-tbl"><thead></thead><tbody></tbody></table></div>
  </div>`);
  const thead = el.querySelector('thead'), tbody = el.querySelector('tbody');
  let lastKey = '';

  function row(b, showName) {
    const net = b.payout - b.bet;
    return `<tr class="${lastKey && !lastKey.includes(b.at + b.name) ? 'new' : ''}">
      ${game ? '' : `<td><span class="bt-gicon">${gicon(b.game)}</span>${esc(gname(b.game))}</td>`}
      ${showName ? `<td>${esc(b.name)}</td>` : ''}
      <td class="muted">${time(b.at ?? b.time)}</td>
      <td class="num">${fmt(b.bet)}</td>
      <td class="num">${b.bet ? (b.payout / b.bet).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + '×' : '–'}</td>
      <td class="num ${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}">${net > 0 ? '+' : net < 0 ? '−' : ''}${fmt(Math.abs(net))}</td></tr>`;
  }

  async function refresh() {
    clearTimeout(timer);
    if (!alive) return;
    el.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    try {
      let list, showName = true;
      if (tab === 'mine') {
        const s = await ctx.get('/api/me/stats');
        list = s.history.filter((x) => x.game === game).slice(0, 20).map((x) => ({ ...x, at: x.time }));
        showName = false;
      } else {
        const r = await ctx.get(`/api/live/bets${game ? `?game=${game}` : ''}`);
        list = tab === 'all' ? r.all : r.top;
      }
      if (!alive) return;
      thead.innerHTML = `<tr>${game ? '' : '<th>Spiel</th>'}${showName ? '<th>Spieler</th>' : ''}<th>Zeit</th><th class="num">Einsatz</th><th class="num">Multi</th><th class="num">Gewinn</th></tr>`;
      const key = list.map((b) => (b.at ?? b.time) + b.name).join('|');
      if (key !== lastKey) {
        tbody.innerHTML = list.length ? list.map((b) => row(b, showName)).join('') : `<tr><td colspan="6" class="muted">${tab === 'mine' ? 'Noch keine Runden in diesem Spiel.' : 'Noch keine Wetten.'}</td></tr>`;
        lastKey = key;
      }
    } catch { /* nächster Versuch */ }
    timer = setTimeout(refresh, tab === 'top' ? 8000 : 3000);
  }

  el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; lastKey = ''; refresh(); }));
  refresh();
  return { el, refresh, cleanup: () => { alive = false; clearTimeout(timer); } };
}
