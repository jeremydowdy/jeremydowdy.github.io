// Civ Terminal: page wiring. Boot log -> name prompt -> the game.
import { Terminal } from './js/terminal.js';
import { runBoot } from './js/boot.js';
import { loadData } from './js/data.js';
import { validateName } from './js/state.js';
import { randomSeed, isValidSeed } from './js/rng.js';
import * as game from './js/game.js';
import { createCommands } from './js/commands.js';
import { createRenderer } from './js/render.js';
import { storageAvailable, saveGame, loadGame, clearGame, loadSettings, saveSettings } from './js/saves.js';

const $ = (id) => document.getElementById(id);
const term = new Terminal({ out: $('out'), line: $('line'), input: $('in'), mirror: $('mirror'), ps1: $('ps1') });
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const settings = { theme: 'green', speed: 'normal', ...loadSettings() };

let data = null, state = null, renderer = null, commands = null;

function applyTheme(name) {
  document.body.classList.remove('theme-green', 'theme-amber', 'theme-white');
  document.body.classList.add('theme-' + name);
  if (renderer) renderer.setTheme(name);
}

function seedFromHash() {
  const m = /(?:^#|&)seed=([^&]+)/.exec(location.hash);
  if (!m) return null;
  let seed = m[1];
  try { seed = decodeURIComponent(seed); } catch (e) { return null; }
  return isValidSeed(seed) ? seed.toLowerCase() : null;
}

function shareUrl(seed) {
  return `${location.origin}${location.pathname}#seed=${encodeURIComponent(seed)}`;
}

function syncView() {
  if (renderer) renderer.setState(state);
  $('map').setAttribute('aria-label', game.mapSummary(state, data) + ' Type "map" in the terminal to read this again.');
}

const host = {
  getState: () => state,
  changed(kind) {
    saveGame(state);                       // autosave after anything that changes the game
    syncView();
    if (kind === 'build' && renderer) renderer.pulse();
  },
  clear: () => term.clear(),
  setTheme(name) { settings.theme = name; saveSettings(settings); applyTheme(name); },
  setSpeed(name) { settings.speed = name; saveSettings(settings); term.setSpeed(name); },
  save: () => saveGame(state),
  load() {
    const saved = loadGame();
    if (!saved) return null;
    state = saved;
    history.replaceState(null, '', '#seed=' + encodeURIComponent(state.seed));
    syncView();
    return state;
  },
  reset() {
    clearGame();
    history.replaceState(null, '', location.pathname);
    location.reload();
  },
  shareUrl,
};

function startGame(loaded) {
  document.body.classList.remove('pre');
  history.replaceState(null, '', '#seed=' + encodeURIComponent(state.seed));
  try {
    renderer = createRenderer($('map'), { seed: state.seed, theme: settings.theme, reducedMotion: motion.matches });
    motion.addEventListener('change', () => renderer.setReducedMotion(motion.matches));
  } catch (e) {
    document.body.classList.add('nomap');
    term.print('Map graphics are not available in this browser, so the map is hidden. The game plays the same in text; "map" describes the world.', 'dim');
  }
  syncView();
  saveGame(state);

  commands = createCommands({ data, host });
  term.completer = (line) => commands.complete(line);
  term.onSubmit = (value) => {
    term.printNow('> ' + value, 'cmd');
    for (const l of commands.run(value)) term.print(l.text, l.cls);
  };
  if (!loaded) term.print(game.eraOf(state, data).intro, 'dim');
  for (const l of commands.statusLines()) term.print(l.text, l.cls);
  term.print('');
  term.print('Type "help" for commands. "wait" passes a turn; "build" lists what you can build.', 'dim');
  term.enableInput({ prompt: '> ', history: true, label: 'Command' });
}

function namePrompt() {
  const saved = loadGame();
  if (window.matchMedia('(max-width: 640px)').matches) {
    term.print('Note: Civ Terminal is best on a desktop or tablet. It will still run here.', 'dim');
  }
  if (!storageAvailable()) {
    term.print('Storage is unavailable in this browser, so progress is kept in memory only and is lost when the page closes.', 'alert');
  }
  if (saved) term.print(`Saved civilization found: ${saved.name}. Type 'load' to continue, or enter a new name.`);
  term.print('Name your civilization:', 'head');
  term.enableInput({ prompt: '> ', history: false, label: 'Name your civilization', maxLength: 60 });

  term.onSubmit = (value) => {
    term.printNow('> ' + value, 'cmd');
    if (saved && value.trim().toLowerCase() === 'load') {
      state = saved;
      term.print(`Loaded ${state.name}, turn ${state.turn}.`);
      startGame(true);
      return;
    }
    const check = validateName(value);
    if (!check.ok) { term.print(check.error + ' 1-24 characters: letters, numbers, spaces and hyphens.', 'error'); return; }
    const seed = seedFromHash() || randomSeed();
    state = game.newGame(check.name, seed, data);
    term.print(`${check.name} is founded. Turn 1 begins. (Seed ${seed}.)`);
    startGame(false);
  };
}

async function main() {
  applyTheme(settings.theme);
  term.setSpeed(settings.speed);
  term.disableInput();
  try {
    data = await loadData();
  } catch (e) {
    term.printNow(`Could not load the game data (${e.message}). Reload the page to try again.`, 'error');
    return;
  }
  await runBoot(term, {
    strategyCount: Object.keys(data.rivals.strategies).length,
    storageOk: storageAvailable(),
    reducedMotion: motion.matches,
  });
  namePrompt();
}

main();
