// Gemeinsamer Baustein für Tische, auf die man Chips legt (Craps, Sic Bo, Drache & Tiger).
import { h, fmt } from './ui.js';
import { sfx } from './sound.js';

const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'M' : n >= 1e4 ? Math.round(n / 1000) + 'K' : n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'K' : String(n));

/**
 * spots: Map key -> Element (Wettfeld). getChip(): aktueller Chip-Wert. getBalance(): Guthaben.
 * locked(key): true, wenn auf dieses Feld gerade nicht gesetzt werden darf.
 */
export function chipTable({ spots, getChip, getBalance, onChange, locked = () => false, toast }) {
  let bets = new Map();
  let undo = [];
  let disabled = false;
  const total = () => [...bets.values()].reduce((a, b) => a + b, 0);

  function paint() {
    spots.forEach((el, k) => {
      el.querySelector('.ct-chip')?.remove();
      const v = bets.get(k);
      if (v) el.appendChild(h(`<span class="ct-chip">${short(v)}</span>`));
      el.classList.toggle('ct-locked', !!locked(k));
    });
    onChange?.(total());
  }

  spots.forEach((el, k) => {
    el.addEventListener('click', () => {
      if (disabled || locked(k)) return;
      const add = Math.max(1, getChip());
      if (total() + add > getBalance()) return toast?.('Nicht genug Chips.', 'err');
      undo.push(new Map(bets));
      bets.set(k, (bets.get(k) || 0) + add);
      sfx.chip();
      paint();
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (disabled || !bets.has(k) || locked(k)) return;
      undo.push(new Map(bets));
      const left = bets.get(k) - Math.max(1, getChip());
      if (left > 0) bets.set(k, left); else bets.delete(k);
      sfx.click();
      paint();
    });
  });

  return {
    get bets() { return bets; },
    total,
    paint,
    setDisabled(d) { disabled = d; },
    clear(keys = null) {
      undo.push(new Map(bets));
      if (keys) keys.forEach((k) => bets.delete(k)); else bets = new Map();
      paint();
    },
    undo() { if (undo.length) { bets = undo.pop(); paint(); } },
    double() {
      if (total() * 2 > getBalance()) return toast?.('Nicht genug Chips.', 'err');
      undo.push(new Map(bets));
      bets = new Map([...bets].map(([k, v]) => [k, locked(k) ? v : v * 2]));
      paint();
    },
    highlight(keys) {
      spots.forEach((el, k) => el.classList.toggle('ct-hit', keys.includes(k)));
    },
    fmtTotal: () => fmt(total()),
  };
}
