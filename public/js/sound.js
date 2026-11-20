// Sound-Effekte – werden live mit der Web-Audio-API erzeugt (keine Dateien nötig).
const KEY = 'casino.sound';
let enabled = true;
try { enabled = localStorage.getItem(KEY) !== 'off'; } catch { /* egal */ }

let ctx = null;
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur = 0.12, { type = 'sine', vol = 0.12, delay = 0, to = null } = {}) {
  if (!enabled) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur = 0.3, vol = 0.2, delay = 0) {
  if (!enabled) return;
  const c = ac();
  if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = c.createBufferSource();
  const g = c.createGain();
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900;
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(f).connect(g).connect(c.destination);
  src.start(c.currentTime + delay);
}

export const sfx = {
  get enabled() { return enabled; },
  setEnabled(on) {
    enabled = !!on;
    try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch { /* egal */ }
    if (enabled) this.click();
  },
  click: () => tone(660, 0.05, { type: 'triangle', vol: 0.08 }),
  chip: () => { tone(1200, 0.04, { type: 'square', vol: 0.04 }); tone(1800, 0.05, { type: 'triangle', vol: 0.05, delay: 0.02 }); },
  card: () => noise(0.08, 0.25),
  tick: () => tone(1400, 0.025, { type: 'square', vol: 0.03 }),
  reelStop: () => tone(180, 0.08, { type: 'triangle', vol: 0.12 }),
  spin: () => tone(300, 0.25, { type: 'sawtooth', vol: 0.03, to: 900 }),
  win: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.12, delay: i * 0.09 })),
  bigWin: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.13, delay: i * 0.1 })),
  lose: () => tone(300, 0.35, { type: 'sawtooth', vol: 0.05, to: 110 }),
  boom: () => { noise(0.6, 0.5); tone(120, 0.5, { type: 'sine', vol: 0.25, to: 40 }); },
  gem: () => { tone(1046, 0.1, { type: 'sine', vol: 0.1 }); tone(1568, 0.15, { type: 'sine', vol: 0.08, delay: 0.06 }); },
  cashout: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.12, { type: 'square', vol: 0.05, delay: i * 0.06 })),
  peg: () => tone(900 + Math.random() * 500, 0.03, { type: 'sine', vol: 0.04 }),
  coin: () => { tone(1320, 0.06, { type: 'square', vol: 0.05 }); tone(1760, 0.12, { type: 'square', vol: 0.05, delay: 0.06 }); },
};
