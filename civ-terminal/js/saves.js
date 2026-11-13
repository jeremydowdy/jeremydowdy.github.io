// Saving to the browser's localStorage, with an in-memory fallback when
// storage is blocked (private windows, strict settings).
import { isValidSave, migrate } from './state.js';

const SAVE_KEY = 'civ-terminal:save:v1';
const SETTINGS_KEY = 'civ-terminal:settings:v1';

const memory = new Map();
let available = null;

export function storageAvailable() {
  if (available !== null) return available;
  try {
    const k = 'civ-terminal:probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    available = true;
  } catch (e) {
    available = false;
  }
  return available;
}

function read(key) {
  if (storageAvailable()) { try { return localStorage.getItem(key); } catch (e) { /* fall through */ } }
  return memory.has(key) ? memory.get(key) : null;
}
function write(key, value) {
  if (storageAvailable()) { try { localStorage.setItem(key, value); return true; } catch (e) { /* fall through */ } }
  memory.set(key, value);
  return false;
}
function remove(key) {
  memory.delete(key);
  if (storageAvailable()) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
}

// Returns true if the save reached localStorage, false if it is memory-only.
export function saveGame(state) { return write(SAVE_KEY, JSON.stringify(state)); }

// `data` lets saves from older builds be brought up to date.
export function loadGame(data) {
  const raw = read(SAVE_KEY);
  if (!raw) return null;
  try {
    const obj = data ? migrate(JSON.parse(raw), data) : JSON.parse(raw);
    return isValidSave(obj) ? obj : null;
  } catch (e) {
    return null;
  }
}

export function clearGame() { remove(SAVE_KEY); }

export function loadSettings() {
  try { return JSON.parse(read(SETTINGS_KEY)) || {}; } catch (e) { return {}; }
}
export function saveSettings(settings) { write(SETTINGS_KEY, JSON.stringify(settings)); }
