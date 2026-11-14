// Civ Terminal: page wiring.
// Phase 1: a terminal. Boot log, then "Name your civilization".
// Phase 2: the game screen (pixel map, buttons, log), with the terminal
// still available as a console drawer.
import { Terminal } from './js/terminal.js';
import { runBoot } from './js/boot.js';
import { loadData } from './js/data.js';
import { validateName } from './js/state.js';
import { randomSeed, isValidSeed } from './js/rng.js';
import * as game from './js/game.js';
import { createCommands } from './js/commands.js';
import { createPixelMap } from './js/pixelmap.js';
import { createUI } from './js/ui.js';
import { people } from './js/economy.js';
import { storageAvailable, saveGame, loadGame, clearGame, loadSettings, saveSettings } from './js/saves.js';

const $ = (id) => document.getElementById(id);
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const settings = { theme: 'green', speed: 'normal', ...loadSettings() };
const startTerm = new Terminal({ out: $('out'), line: $('line'), input: $('in'), mirror: $('mirror'), ps1: $('ps1') });

let data = null, state = null, ui = null, map = null, commands = null, consoleTerm = null;
let prevSnap = null;

// ------------------------------------------------------------------ helpers
function applyTheme(name) {
  document.body.classList.remove('theme-green', 'theme-amber', 'theme-white');
  document.body.classList.add('theme-' + name);
}

function seedFromHash() {
  const m = /(?:^#|&)seed=([^&]+)/.exec(location.hash);
  if (!m) return null;
  let seed = m[1];
  try { seed = decodeURIComponent(seed); } catch (e) { return null; }
  return isValidSeed(seed) ? seed.toLowerCase() : null;
}

const shareUrl = (seed) => `${location.origin}${location.pathname}#seed=${encodeURIComponent(seed)}`;
const snapshot = (s) => ({ pop: people(s), food: s.food, energy: s.energy, knowledge: s.knowledge, stability: s.stability });

const LOG_CLASS = { alert: 'alert', era: 'era', discovery: 'discovery', error: 'error', info: 'dim', result: '', event: '', season: 'season' };
function logLines(lines) {
  for (const l of lines) {
    let cls = LOG_CLASS[l.kind] ?? '';
    if (l.tone) cls = l.tone;
    ui.log(l.text, cls, state.turn);
    if (l.kind === 'discovery' || l.kind === 'era') ui.banner(l.text.split('. ')[0].replace(/\.$/, ''));
  }
}

// Saves, then redraws everything from the state.
function refresh(kind, extra = {}) {
  saveGame(state);
  ui.update(state, extra.quiet ? null : prevSnap);
  const season = game.calendar(state, data).season;
  map.setState(state, { tint: season.tint, cold: !!season.cold });
  if (kind === 'build' && extra.id) map.pulse(extra.id);
  prevSnap = snapshot(state);
  $('pix').setAttribute('aria-label', game.mapSummary(state, data));
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
  const area = document.createElement('textarea');
  area.value = text; area.style.position = 'fixed'; area.style.top = '-1000px';
  document.body.append(area); area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  area.remove();
  return ok;
}

// ------------------------------------------------------------------ what the buttons do
const actions = {
  next(n) {
    const res = game.advance(state, data, n);
    logLines(res.lines);
    refresh('turn');
  },
  build(id) {
    const res = game.build(state, data, id);
    logLines(res.lines);
    if (res.ok) refresh('build', { id: res.structure.id });
  },
  explore(id) {
    const res = game.explore(state, data, id);
    logLines(res.lines);
    if (res.ok) refresh('explore');
  },
  choose(key) {
    const res = game.choose(state, data, key);
    logLines(res.lines);
    if (res.ok) refresh('choose');
  },
  invite() {
    const res = game.invite(state, data);
    logLines(res.lines);
    if (res.ok) refresh('invite');
  },
  propose() {
    const res = game.propose(state, data, 'disarmament');
    logLines(res.lines);
    if (res.ok) refresh('propose');
  },
  setRule(key, value) {
    const res = game.setRule(state, data, key, value);
    logLines(res.lines);
    refresh('rule');
  },
  refuse() {
    ui.log(state.over ? 'This civilization has ended.' : 'A decision is waiting. Make it first.', 'error', state.turn);
  },
  save() {
    const persisted = saveGame(state);
    ui.log(persisted ? `Saved ${state.name} at turn ${state.turn} in this browser.`
      : 'This browser is blocking storage, so the save is held in memory only and will be lost when you close the page.', persisted ? 'good' : 'bad', state.turn);
  },
  load() {
    const saved = loadGame(data);
    if (!saved) { ui.log('No saved civilization found in this browser.', 'error', state.turn); return; }
    host.load();
    ui.log(`Loaded ${state.name}, turn ${state.turn}.`, 'good', state.turn);
  },
  async copyLink() {
    const ok = await copyText(shareUrl(state.seed));
    ui.log(ok ? 'Replay link copied. The same seed and the same choices give the same score.' : `Copy failed. The link is: ${shareUrl(state.seed)}`, ok ? 'good' : 'error', state.turn);
  },
  reset() {
    if (window.confirm(`This erases ${state.name} and its save. Start over?`)) host.reset();
  },
  toggleConsole,
};

// ------------------------------------------------------------------ the console drawer
const host = {
  getState: () => state,
  changed(kind, extra) { refresh(kind, extra); },
  clear: () => consoleTerm && consoleTerm.clear(),
  setTheme(name) { settings.theme = name; saveSettings(settings); applyTheme(name); },
  setSpeed(name) { settings.speed = name; saveSettings(settings); if (consoleTerm) consoleTerm.setSpeed(name); },
  save: () => saveGame(state),
  load() {
    const saved = loadGame(data);
    if (!saved) return null;
    state = saved;
    history.replaceState(null, '', '#seed=' + encodeURIComponent(state.seed));
    refresh('load', { quiet: true });
    return state;
  },
  reset() {
    clearGame();
    history.replaceState(null, '', location.pathname);
    location.reload();
  },
  shareUrl,
};

function ensureConsole() {
  if (consoleTerm) return;
  consoleTerm = new Terminal({ out: $('cOut'), line: $('cLine'), input: $('cIn'), mirror: $('cMirror'), ps1: $('cPs1'), captureClicks: false });
  consoleTerm.setSpeed(settings.speed);
  consoleTerm.completer = (line) => commands.complete(line);
  consoleTerm.onSubmit = (value) => {
    consoleTerm.printNow('> ' + value, 'cmd');
    const lines = commands.run(value);
    for (const l of lines) consoleTerm.print(l.text, l.cls);
    // Things that happen in the world also go in the game log.
    if (/^\s*(wait|build|explore|choose|propose)\b/i.test(value)) for (const l of lines) ui.log(l.text, l.cls === 'error' ? 'error' : '', state.turn);
  };
  $('drawer').addEventListener('mouseup', (e) => {
    if (e.target.closest('a, button')) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    $('cIn').focus({ preventScroll: true });
  });
  consoleTerm.print('Console. Everything here does the same as the buttons. Type "help" for commands. Press ` or Esc to close.', 'dim');
  consoleTerm.enableInput({ prompt: '> ', history: true, label: 'Console input' });
}

function toggleConsole(force) {
  const open = typeof force === 'boolean' ? force : $('drawer').hidden;
  $('drawer').hidden = !open;
  ui.setConsoleOpen(open);
  if (open) { ensureConsole(); consoleTerm.enableInput({ prompt: '> ', history: true, label: 'Console input' }); $('cIn').focus(); }
  else $('btnConsole').focus();
}

document.addEventListener('keydown', (e) => {
  if (!state || !ui || e.ctrlKey || e.metaKey || e.altKey) return;
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (e.key === '`') {
    if (e.target.id === 'in' || (inField && !$('drawer').contains(e.target))) return;
    e.preventDefault(); toggleConsole(); return;
  }
  if (e.key === 'Escape' && !$('drawer').hidden && $('drawer').contains(e.target)) { e.preventDefault(); toggleConsole(false); return; }
  if (inField) return;
  const k = e.key.toLowerCase();
  if (ui.modalOpen()) {
    if (k === 'a' || k === 'b') { e.preventDefault(); actions.choose(k.toUpperCase()); }
    return;
  }
  if (e.target.closest && e.target.closest('button') && (k === ' ' || k === 'enter')) return;
  if (k === 'n') { e.preventDefault(); actions.next(1); }
  else if (k === '5') { e.preventDefault(); actions.next(5); }
});

// ------------------------------------------------------------------ start screen -> game
function enterGame(loaded) {
  startTerm.disableInput();
  $('start').classList.add('leaving');
  setTimeout(() => {
    startTerm.dispose();
    $('start').hidden = true;
    $('backLink').hidden = true;
    document.body.classList.replace('pre', 'play');
    $('game').hidden = false;
    history.replaceState(null, '', '#seed=' + encodeURIComponent(state.seed));

    ui = createUI({ data, actions, reducedMotion: motion.matches });
    map = createPixelMap($('pix'), { seed: state.seed, reducedMotion: motion.matches });
    motion.addEventListener('change', () => { map.setReducedMotion(motion.matches); ui.setReducedMotion(motion.matches); });
    commands = createCommands({ data, host });

    refresh('start', { quiet: true });
    if (loaded) ui.log(`Welcome back to ${state.name}. Turn ${state.turn}.`, 'good', state.turn);
    else {
      ui.log(game.eraOf(state, data).intro, 'dim', state.turn);
      ui.log('People who gather around a fire share what they know, so campfires spread knowledge. Build one, then press Next turn. Your people will learn new things as knowledge grows.', 'alert', state.turn);
    }
    $('btnNext').focus({ preventScroll: true });
  }, motion.matches ? 120 : 650);
}

function namePrompt() {
  const saved = loadGame(data);
  if (window.matchMedia('(max-width: 640px)').matches) {
    startTerm.print('Note: Civ Terminal is best on a desktop or tablet. It will still run here.', 'dim');
  }
  if (!storageAvailable()) {
    startTerm.print('Storage is unavailable in this browser, so progress is kept in memory only and is lost when the page closes.', 'alert');
  }
  if (saved) startTerm.print(`Saved civilization found: ${saved.name}. Type 'load' to continue, or enter a new name.`);
  startTerm.print('Name your civilization:', 'head');
  startTerm.enableInput({ prompt: '> ', history: false, label: 'Name your civilization', maxLength: 60 });

  startTerm.onSubmit = (value) => {
    startTerm.printNow('> ' + value, 'cmd');
    if (saved && value.trim().toLowerCase() === 'load') {
      state = saved;
      startTerm.print(`Loaded ${state.name}, turn ${state.turn}.`);
      enterGame(true);
      return;
    }
    const check = validateName(value);
    if (!check.ok) { startTerm.print(check.error + ' 1-24 characters: letters, numbers, spaces and hyphens.', 'error'); return; }
    const seed = seedFromHash() || randomSeed();
    state = game.newGame(check.name, seed, data);
    startTerm.print(`${check.name} is founded. Turn 1 begins. (Seed ${seed}.)`);
    enterGame(false);
  };
}

async function main() {
  applyTheme(settings.theme);
  startTerm.setSpeed(settings.speed);
  startTerm.disableInput();
  try {
    data = await loadData();
  } catch (e) {
    startTerm.printNow(`Could not load the game data (${e.message}). Reload the page to try again.`, 'error');
    return;
  }
  await runBoot(startTerm, {
    strategyCount: Object.keys(data.rivals.strategies).length,
    storageOk: storageAvailable(),
    reducedMotion: motion.matches,
  });
  namePrompt();
}

main();
