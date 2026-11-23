// Admin-Steuerung pro Spieler (für Spieler unsichtbar):
// - luck: 'normal' | 'lose' (Pech) | 'win' (Glück)
// - next: einmalige Vorgaben für den nächsten Zug (z. B. nächste Hi-Lo-Karte, nächster Münzwurf)
// Gespeichert im Profil unter p.admin (wird nie an Spieler geschickt).

function ctl(p) {
  return (p.admin ||= { luck: 'normal', next: {} });
}

function luckOf(p) {
  return p.admin?.luck || 'normal';
}

function setLuck(p, mode) {
  ctl(p).luck = ['normal', 'lose', 'win'].includes(mode) ? mode : 'normal';
}

/** Einmalige Vorgabe holen und verbrauchen */
function takeNext(p, key) {
  const n = p.admin?.next;
  if (!n || n[key] === undefined || n[key] === null) return null;
  const v = n[key];
  delete n[key];
  return v;
}

function setNext(p, key, value) {
  ctl(p).next[key] = value;
}

function peekNext(p) {
  return { ...(p.admin?.next || {}) };
}

module.exports = { luckOf, setLuck, takeNext, setNext, peekNext };
