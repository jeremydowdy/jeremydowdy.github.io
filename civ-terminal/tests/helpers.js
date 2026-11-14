import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const read = (name) => JSON.parse(readFileSync(join(dataDir, name), 'utf8'));

export function loadData() {
  return {
    rules: read('rules.json'), eras: read('eras.json'), structures: read('structures.json'),
    discoveries: read('discoveries.json'), expeditions: read('expeditions.json'), events: read('events.json'),
    dilemmas: read('dilemmas.json'), cards: read('cards.json'), rivals: read('rivals.json'),
  };
}

// Plays a fixed script: wait, and answer every decision with `pick(card, state)`.
export async function play(game, state, data, turns, pick = () => 'A', each = () => {}) {
  let guard = 0;
  while (state.turn <= turns && !state.over && guard++ < 10000) {
    if (state.dilemma) game.choose(state, data, pick(game.currentCard(state, data), state));
    else game.advance(state, data, 1);
    each(state);
  }
  return state;
}
