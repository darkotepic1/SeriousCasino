// Spaß-Casino – Server.
// Standard: lauscht ausschließlich auf 127.0.0.1:3000 (nur dieser PC).
// Mit --lan (start-heimnetz.bat): zusätzlich im Heimnetz erreichbar – aber nur für Geräte aus dem lokalen Netz.
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const db = require('./db');
const profiles = require('./profiles');
const { GameError } = require('./util');

const LAN = process.argv.includes('--lan');
const HOST = process.env.CASINO_BIND || (LAN ? '0.0.0.0' : '127.0.0.1'); // CASINO_BIND nur für Tests
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
  const m = /^([^:]+):(\d+)$/.exec(String(hostHeader || '').toLowerCase());
  if (!m || Number(m[2]) !== PORT) return false;
  const name = m[1];
  if (name === '127.0.0.1' || name === 'localhost') return true;
  if (!LAN) return false;
  if (isPrivateIPv4(name)) return true;
  return [HOSTNAME, `${HOSTNAME}.local`, `${HOSTNAME}.fritz.box`, `${HOSTNAME}.lan`, `${HOSTNAME}.home`].includes(name);
}

/** Nur Geräte aus dem eigenen Netz dürfen zugreifen (falls der Router doch etwas weiterleitet) */
function clientAllowed(addr) {
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

// Zugriffsschutz: nur dieser PC (bzw. im Heimnetz-Modus: nur Geräte aus dem lokalen Netz)
app.use((req, res, next) => {
  if (!clientAllowed(req.socket.remoteAddress) || !hostAllowed(req.headers.host)) {
    return res.status(403).send(LAN ? 'Nur im Heimnetz erreichbar.' : 'Nur lokal erreichbar.');
  }
  next();
});
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

const me = (req) => profiles.get(req.get('x-profile-id'));

// ---------- Server-Info (für "Freunde einladen") ----------
app.get('/api/server-info', handle(() => ({ lan: LAN, urls: LAN ? lanUrls() : [], port: PORT })));

// ---------- Profile ----------
app.get('/api/profiles', handle(() => profiles.all().map(profiles.summary).sort((a, b) => b.balance - a.balance)));
app.post('/api/profiles', handle((req) => profiles.publicView(profiles.create(req.body?.name))));
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
  profiles.remove(me(req).id);
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
