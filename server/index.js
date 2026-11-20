// Spaß-Casino – Server.
// Standard: lauscht ausschließlich auf 127.0.0.1:3000 (nur dieser PC).
// Mit --lan (start-heimnetz.bat): zusätzlich im Heimnetz erreichbar – aber nur für Geräte aus dem lokalen Netz.
// Mit --online (GitHub Codespaces): über den Codespaces-Link aus dem Internet erreichbar, Passwörter sind Pflicht.
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const db = require('./db');
const profiles = require('./profiles');
const { GameError } = require('./util');

const ONLINE = process.argv.includes('--online');
const LAN = process.argv.includes('--lan');
const HOST = process.env.CASINO_BIND || (LAN || ONLINE ? '0.0.0.0' : '127.0.0.1'); // CASINO_BIND nur für Tests
const REQUIRE_PASSWORD = ONLINE; // im Internet: Passwort Pflicht (lokal/Heimnetz optional)
const PORT = Number(process.env.CASINO_PORT) || 3000; // optional anderer Port, z. B. zum Testen
const URL = `http://127.0.0.1:${PORT}`;

/** Private/lokale IPv4-Adresse? (Heimnetz-Bereiche + dieser PC) */
function isPrivateIPv4(ip) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

/** Adressen dieses PCs im Heimnetz (für Freunde) – virtuelle Adapter (WSL, VirtualBox, VMware …) werden ausgeblendet */
const VIRTUAL = /vethernet|wsl|hyper-v|virtualbox|vmware|vmnet|docker|loopback|bluetooth|tailscale|zerotier/i;
function lanUrls() {
  const all = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const i of list || []) {
      if ((i.family === 'IPv4' || i.family === 4) && !i.internal && isPrivateIPv4(i.address) && !i.address.startsWith('169.254.')) {
        const virtual = VIRTUAL.test(name) || i.address.startsWith('192.168.56.'); // 192.168.56.x = VirtualBox-Standard
        const prio = /wlan|wi-?fi|wireless/i.test(name) ? 0 : /ethernet|^eth|^en/i.test(name) ? 1 : 2;
        all.push({ url: `http://${i.address}:${PORT}`, virtual, prio });
      }
    }
  }
  const real = all.filter((x) => !x.virtual);
  return (real.length ? real : all).sort((a, b) => a.prio - b.prio).map((x) => x.url);
}

const HOSTNAME = os.hostname().toLowerCase();
/**
 * Erlaubte Host-Namen in der Adresszeile. Schützt davor, dass fremde Webseiten per DNS-Trick
 * auf den Server zugreifen: erlaubt sind nur IP-Adressen und der Name dieses PCs, keine fremden Domains.
 */
function hostAllowed(hostHeader) {
  const host = String(hostHeader || '').toLowerCase();
  if (ONLINE) {
    // GitHub Codespaces-Links (https://<name>-3000.app.github.dev) oder ein selbst gesetzter Name
    const name = host.replace(/:\d+$/, '');
    if (/^[a-z0-9-]+\.app\.github\.dev$/.test(name) || /^[a-z0-9-]+\.preview\.app\.github\.dev$/.test(name)) return true;
    if (process.env.CASINO_PUBLIC_HOST && name === process.env.CASINO_PUBLIC_HOST.toLowerCase()) return true;
    if (name === '127.0.0.1' || name === 'localhost') return true;
    return false;
  }
  const m = /^([^:]+):(\d+)$/.exec(host);
  if (!m || Number(m[2]) !== PORT) return false;
  const name = m[1];
  if (name === '127.0.0.1' || name === 'localhost') return true;
  if (!LAN) return false;
  if (isPrivateIPv4(name)) return true;
  return [HOSTNAME, `${HOSTNAME}.local`, `${HOSTNAME}.fritz.box`, `${HOSTNAME}.lan`, `${HOSTNAME}.home`].includes(name);
}

/** Nur Geräte aus dem eigenen Netz dürfen zugreifen (falls der Router doch etwas weiterleitet) */
function clientAllowed(addr) {
  if (ONLINE) return true; // Zugriff läuft über GitHubs Weiterleitung; geschützt durch Passwörter
  const ip = String(addr || '').replace(/^::ffff:/, '');
  if (ip === '::1') return true;
  return LAN ? isPrivateIPv4(ip) : ip === '127.0.0.1';
}

db.load();

// Alle Spiele aus server/games laden (Dateiname = Spiel-ID)
const games = {};
for (const file of fs.readdirSync(path.join(__dirname, 'games'))) {
  if (file.endsWith('.js')) games[file.slice(0, -3)] = require(`./games/${file}`);
}

const app = express();
app.disable('x-powered-by');
if (ONLINE) app.set('trust proxy', true); // echte Besucher-IP hinter GitHubs Weiterleitung (für die Login-Sperre)

// Zugriffsschutz: nur dieser PC (bzw. im Heimnetz-Modus: nur Geräte aus dem lokalen Netz)
app.use((req, res, next) => {
  if (!clientAllowed(req.socket.remoteAddress) || !hostAllowed(req.headers.host)) {
    return res.status(403).send(ONLINE ? 'Unbekannte Adresse.' : LAN ? 'Nur im Heimnetz erreichbar.' : 'Nur lokal erreichbar.');
  }
  // Grundlegende Sicherheits-Header
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Sperre gegen Passwort-Raten: nach 8 Fehlversuchen 10 Minuten Pause (pro IP)
const failed = new Map();
function checkLoginLimit(ip) {
  const f = failed.get(ip);
  if (f && f.until > Date.now()) {
    const min = Math.ceil((f.until - Date.now()) / 60000);
    throw new GameError(`Zu viele Fehlversuche. Bitte in ${min} Min. nochmal versuchen.`, 429);
  }
}
function noteLoginFail(ip) {
  const f = failed.get(ip) || { count: 0, until: 0 };
  f.count++;
  if (f.count >= 8) { f.until = Date.now() + 10 * 60 * 1000; f.count = 0; }
  failed.set(ip, f);
}
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function handle(fn) {
  return (req, res) => {
    try {
      const result = fn(req, res);
      db.save();
      res.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof GameError) return res.status(e.status).json({ error: e.message });
      console.error(e);
      res.status(500).json({ error: 'Interner Fehler – bitte nochmal versuchen.' });
    }
  };
}

const token = (req) => req.get('x-session');
const me = (req) => profiles.get(token(req));

// ---------- Server-Info (für "Freunde einladen") ----------
app.get('/api/server-info', handle((req) => ({
  lan: LAN,
  online: ONLINE,
  requirePassword: REQUIRE_PASSWORD,
  urls: LAN ? lanUrls() : ONLINE ? [`https://${String(req.headers.host).replace(/:\d+$/, '')}`] : [],
  port: PORT,
})));

// ---------- Profile & Anmeldung ----------
app.get('/api/profiles', handle(() => profiles.all().map(profiles.summary).sort((a, b) => b.balance - a.balance)));
app.post('/api/profiles', handle((req) => {
  const { p, token: t } = profiles.create(req.body?.name, req.body?.password, REQUIRE_PASSWORD);
  return { ...profiles.publicView(p), token: t };
}));
app.post('/api/login', handle((req) => {
  checkLoginLimit(req.ip);
  try {
    const { p, token: t } = profiles.login(req.body?.name, req.body?.password, REQUIRE_PASSWORD);
    failed.delete(req.ip);
    return { ...profiles.publicView(p), token: t };
  } catch (e) {
    if (e instanceof GameError && e.status === 401) noteLoginFail(req.ip);
    throw e;
  }
}));
app.post('/api/me/logout', handle((req) => {
  profiles.logout(me(req), token(req));
  return { ok: true };
}));
app.post('/api/me/password', handle((req) => {
  const p = me(req);
  checkLoginLimit(req.ip);
  try {
    profiles.setPassword(p, req.body?.old, req.body?.password);
  } catch (e) {
    if (/bisherige Passwort/.test(e.message)) noteLoginFail(req.ip);
    throw e;
  }
  return profiles.publicView(p);
}));
app.get('/api/me', handle((req) => profiles.publicView(me(req))));
app.post('/api/me/rename', handle((req) => {
  const p = me(req);
  profiles.rename(p, req.body?.name);
  return profiles.publicView(p);
}));
app.post('/api/me/reset', handle((req) => {
  const p = me(req);
  profiles.reset(p);
  return profiles.publicView(p);
}));
app.post('/api/me/delete', handle((req) => {
  profiles.remove(me(req));
  return { ok: true };
}));
app.post('/api/me/daily', handle((req) => {
  const p = me(req);
  const amount = profiles.claimDaily(p);
  return { ...profiles.publicView(p), amount };
}));
app.post('/api/me/refill', handle((req) => {
  const p = me(req);
  const amount = profiles.refill(p);
  return { ...profiles.publicView(p), amount };
}));
app.get('/api/me/stats', handle((req) => {
  const p = me(req);
  return { stats: p.stats, history: p.history, balance: p.balance, gameNames: profiles.GAME_NAMES };
}));

// ---------- Spiele ----------
app.get('/api/games/:game/info', handle((req) => {
  const g = games[req.params.game];
  if (!g || typeof g.info !== 'function') throw new GameError('Unbekanntes Spiel.', 404);
  return g.info();
}));
app.post('/api/games/:game/:action', handle((req) => {
  const g = Object.hasOwn(games, req.params.game) ? games[req.params.game] : null;
  const action = req.params.action;
  if (!g || action === 'info' || action.startsWith('_') || !Object.hasOwn(g, action) || typeof g[action] !== 'function') {
    throw new GameError('Unbekannte Aktion.', 404);
  }
  const p = me(req);
  const result = g[action](p, req.body || {});
  return { ...result, balance: p.balance };
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Nicht gefunden.' }));

const server = app.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ==========================================');
  console.log('   Spass-Casino laeuft!');
  console.log(`   Im Browser oeffnen: ${URL}`);
  if (ONLINE) {
    console.log('');
    console.log('   ONLINE-MODUS (GitHub Codespaces): Passwoerter sind Pflicht.');
    if (process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
      console.log(`   Link fuer Freunde: https://${process.env.CODESPACE_NAME}-${PORT}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`);
    }
  }
  if (LAN) {
    const urls = lanUrls();
    console.log('');
    console.log('   HEIMNETZ-MODUS: Freunde im selben WLAN oeffnen:');
    if (urls.length) urls.forEach((u) => console.log(`      ${u}`));
    else console.log('      (keine Heimnetz-Adresse gefunden - ist der PC im WLAN/LAN?)');
  }
  console.log('');
  console.log('   Zum Beenden dieses Fenster schliessen.');
  console.log('  ==========================================');
  console.log('');
  if (process.argv.includes('--open')) openBrowser();
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} ist schon belegt – laeuft das Casino vielleicht schon?`);
    if (process.argv.includes('--open')) openBrowser();
    setTimeout(() => process.exit(1), 1500);
  } else {
    throw e;
  }
});

function openBrowser() {
  const { exec } = require('child_process');
  if (process.platform === 'win32') exec(`start "" "${URL}"`);
  else if (process.platform === 'darwin') exec(`open "${URL}"`);
  else exec(`xdg-open "${URL}"`);
}
