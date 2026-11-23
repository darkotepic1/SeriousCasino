// Würfel mit Augen (für Craps und Sic Bo)
import { h, sleep } from './ui.js';
import { sfx } from './sound.js';

const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };

export function dieEl(v, cls = '') {
  return h(`<div class="die ${cls}">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[v]?.includes(i + 1) ? 'on' : ''}"></i>`).join('')}</div>`);
}

/** Würfel kurz "rollen" lassen und dann die echten Augen zeigen */
export async function rollDice(box, values, isAlive = () => true) {
  for (let k = 0; k < 9 && isAlive(); k++) {
    box.replaceChildren(...values.map(() => dieEl(1 + Math.floor(Math.random() * 6), 'rolling')));
    if (k % 2 === 0) sfx.tick();
    await sleep(70);
  }
  box.replaceChildren(...values.map((v) => dieEl(v, 'landed')));
  sfx.reelStop();
}
