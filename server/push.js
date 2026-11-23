// Push-Benachrichtigungen (Web Push). Funktioniert auch, wenn die Seite geschlossen ist –
// aber nur, wenn der Spieler sie in den Einstellungen aktiviert hat.
// Die Schlüssel (VAPID) werden beim ersten Start automatisch erzeugt und in der Datenbank gespeichert.
const db = require('./db');
const { GameError } = require('./util');

let webpush = null;
try { webpush = require('web-push'); } catch { /* Baustein fehlt → Push einfach aus */ }

function keys() {
  if (!webpush) return null;
  const d = db.get();
  if (process.env.CASINO_VAPID_PUBLIC && process.env.CASINO_VAPID_PRIVATE) {
    return { publicKey: process.env.CASINO_VAPID_PUBLIC, privateKey: process.env.CASINO_VAPID_PRIVATE };
  }
  if (!d.vapid) { d.vapid = webpush.generateVAPIDKeys(); db.save(); }
  return d.vapid;
}

function publicKey() {
  const k = keys();
  return { available: !!k, publicKey: k?.publicKey || null };
}

function subscribe(p, sub) {
  if (!keys()) throw new GameError('Push ist auf diesem Server nicht verfügbar.');
  const endpoint = String(sub?.endpoint || '');
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000) throw new GameError('Ungültiges Abo.');
  const k = sub.keys || {};
  if (typeof k.p256dh !== 'string' || typeof k.auth !== 'string' || k.p256dh.length > 200 || k.auth.length > 100) throw new GameError('Ungültiges Abo.');
  // Ein Gerät gehört immer nur zu einem Profil
  for (const o of Object.values(db.get().profiles)) if (o.push) o.push = o.push.filter((s) => s.endpoint !== endpoint);
  p.push = [{ endpoint, keys: { p256dh: k.p256dh, auth: k.auth }, at: Date.now() }, ...(p.push || [])].slice(0, 5);
  return { ok: true, devices: p.push.length };
}

function unsubscribe(p, endpoint) {
  p.push = (p.push || []).filter((s) => s.endpoint !== String(endpoint || ''));
  return { ok: true, devices: p.push.length };
}

/** Benachrichtigung an alle Geräte des Spielers (Fehler werden ignoriert, abgelaufene Abos entfernt) */
function send(p, title, body, url = '#/', force = false) {
  const k = keys();
  if (!k || !p?.push?.length) return;
  webpush.setVapidDetails('mailto:casino@localhost.invalid', k.publicKey, k.privateKey);
  const payload = JSON.stringify({ title, body, url, tag: url, force });
  for (const s of [...p.push]) {
    webpush.sendNotification(s, payload, { TTL: 3600, urgency: 'high' }).catch((e) => {
      if (e.statusCode === 404 || e.statusCode === 410) { p.push = (p.push || []).filter((x) => x.endpoint !== s.endpoint); db.save(); }
    });
  }
}

module.exports = { publicKey, subscribe, unsubscribe, send };
