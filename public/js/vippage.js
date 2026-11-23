// VIP-Stufe, tägliche Aufgaben und Erfolge.
import { h, esc, fmt } from './ui.js';

export async function vip(root, ctx) {
  const o = await ctx.get('/api/me/progress');
  const pct = Math.min(100, Math.round(((o.xp - o.levelXp) / Math.max(1, o.nextXp - o.levelXp)) * 100));
  const unlocked = o.achievements.filter((a) => a.unlocked).length;
  const tomorrow = new Date(); tomorrow.setHours(24, 0, 0, 0);
  const hoursLeft = Math.ceil((tomorrow - Date.now()) / 3600000);

  root.appendChild(h(`<div>
    <div class="page-head"><h1>👑 VIP & Aufgaben</h1></div>
    <div class="vip-hero" style="--tc:${o.tier.color}">
      <div class="vip-badge"><span>${o.tier.icon}</span><b>${o.level}</b></div>
      <div class="vip-main">
        <div class="vip-tier">${esc(o.tier.name)} · Stufe ${o.level}</div>
        <div class="vip-bar"><div style="width:${pct}%"></div></div>
        <div class="vip-sub"><span>${fmt(o.xp - o.levelXp)} / ${fmt(o.nextXp - o.levelXp)} XP bis Stufe ${o.level + 1}</span><span class="gold">Belohnung: +${fmt(o.nextReward)} Chips</span></div>
        <div class="muted" style="font-size:.8rem;margin-top:6px">Jede Runde bringt XP: 1 XP pro 10 gesetzte Chips.</div>
      </div>
    </div>
    <div class="vip-tiers">${o.tiers.map((t) => `<div class="vt ${o.level >= t.from ? 'reached' : ''}" style="--tc:${t.color}"><span>${t.icon}</span><b>${esc(t.name)}</b><small>ab Stufe ${t.from}</small></div>`).join('')}</div>

    <div class="settings-grid" style="margin-top:18px">
      <div class="panel">
        <h2>📅 Tägliche Aufgaben <span class="muted" style="font-size:.8rem;font-weight:500">neue in ${hoursLeft} Std.</span></h2>
        ${o.quests.map((q) => `<div class="quest ${q.done ? 'done' : ''}">
          <div class="q-top"><span>${q.done ? '✅' : '🎯'} ${esc(q.text)}</span><b class="gold">+${fmt(q.reward)}</b></div>
          <div class="vip-bar small"><div style="width:${Math.round((q.progress / q.target) * 100)}%"></div></div>
          <small class="muted">${fmt(q.progress)} / ${fmt(q.target)}</small></div>`).join('')}
      </div>
      <div class="panel">
        <h2>📈 Diese Woche</h2>
        <div class="kv"><span>Gewinn/Verlust</span><span class="${o.weekly.net >= 0 ? 'pos' : 'neg'}">${o.weekly.net >= 0 ? '+' : '−'}${fmt(Math.abs(o.weekly.net))}</span></div>
        <div class="kv"><span>Runden</span><span>${fmt(o.weekly.rounds)}</span></div>
        <div class="kv"><span>Eingesetzt</span><span>${fmt(o.weekly.wagered)}</span></div>
        <p class="muted" style="font-size:.85rem">Die Top 3 der Woche (nach Gewinn) bekommen am Montag <b class="gold">25.000 / 10.000 / 5.000</b> Chips.</p>
        <a class="btn btn-sm" href="#/leaderboard?tab=week">Zur Wochen-Rangliste</a>
      </div>
    </div>

    <div class="panel section">
      <h2>🏅 Erfolge <span class="muted" style="font-size:.85rem;font-weight:500">${unlocked} / ${o.achievements.length}</span></h2>
      <div class="ach-grid">${o.achievements.map((a) => `<div class="ach ${a.unlocked ? 'on' : ''}" title="${esc(a.desc)}">
        <span class="ach-icon">${a.icon}</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small><span class="gold">+${fmt(a.reward)}</span></div>`).join('')}</div>
    </div>
  </div>`));
}
