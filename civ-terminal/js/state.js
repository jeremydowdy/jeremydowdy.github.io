// The game state: one plain, JSON-serializable object.
import { hashSeed } from './rng.js';

export const SAVE_VERSION = 4;
export const NAME_PATTERN = /^[A-Za-z0-9 -]{1,24}$/;

export function validateName(raw) {
  const name = String(raw).trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: 'A name needs at least 1 character.' };
  if (name.length > 24) return { ok: false, error: 'Too long: 24 characters at most.' };
  if (!NAME_PATTERN.test(name)) return { ok: false, error: 'Use only letters, numbers, spaces and hyphens.' };
  return { ok: true, name };
}

export function ruleValues(rulesData) {
  const out = {};
  for (const [key, def] of Object.entries(rulesData)) out[key] = def.value;
  return out;
}

export function createState({ name, seed, data }) {
  const rules = ruleValues(data.rules);
  return {
    v: SAVE_VERSION,
    name,
    seed,
    rng: hashSeed(seed),
    turn: 1,
    clock: { year: 1, step: 0 },   // the calendar: which year, and which season of it
    era: data.eras[0].id,
    pop: rules.startPopulation,   // adults (men and women): they forage, gather wood and learn
    women: Math.min(rules.startWomen, rules.startPopulation),   // how many of the adults are women
    pregnancies: Array.from({ length: Math.min(rules.startWomen, rules.startPopulation) },
      (_, i) => 2 + (i % 3)),     // each pregnancy is the turn it comes due; everyone starts pregnant
    resting: [],                  // mothers recovering: the turn each can conceive again
    kids: 0,                      // children: they eat, but don't work until they grow up
    cohorts: [],                  // children by birth turn, oldest first: { born, m, f }
    cooldowns: { invite: data.events?.invite?.firstReadyTurn ?? 5, prompted: false },
    food: rules.startFood,
    energy: rules.startEnergy,
    knowledge: 0,
    stability: rules.stabilityRest,
    arms: 0,
    structures: {},
    mods: { foodPerTurn: 0, energyPerTurn: 0, knowledgePerTurn: 0, knowledgeMult: 1, stabilityPerTurn: 0, forageMult: 1, spoilMult: 1, coldMult: 1 },
    flags: {},
    discovered: [],   // ids of discoveries made
    parties: [],      // expedition parties away: { id, start, due, people }
    locks: [],
    resolved: [],
    pending: [],      // delayed consequences waiting for their turn
    history: [],      // { turn, kind, text }
    timeline: [],     // one record per finished turn: the date, the numbers, births, deaths, departures
    dilemma: null,    // the decision currently waiting, if any
    nextArmsTurn: rules.firstArmsTurn,
    treaty: null,
    rivals: data.rivals.active.map((r) => ({
      id: r.id, name: r.name, strategy: r.strategy, trust: r.startTrust ?? 50, arms: 0, rounds: [],
    })),
    rules,
    rulesModified: false,
    over: null,
  };
}

// Brings a save from an older build up to date, so players keep their game.
export function migrate(obj, data) {
  if (!obj || typeof obj !== 'object') return obj;
  if (obj.v === 2) {
    const perYear = (data.eras.find((e) => e.id === obj.era) || data.eras[0]).clock?.perYear || 1;
    obj.clock = { year: Math.floor((obj.turn - 1) / perYear) + 1, step: (obj.turn - 1) % perYear };
    obj.kids = 0; obj.cohorts = []; obj.timeline = [];
    obj.mods = { knowledgeMult: 1, ...obj.mods };
    // New rules replace the old growth rules. Rules the player changed are kept.
    const fresh = ruleValues(data.rules);
    obj.rules = obj.rulesModified ? { ...fresh, ...Object.fromEntries(Object.entries(obj.rules).filter(([k]) => k in fresh)) } : fresh;
    obj.v = 3;
  }
  if (obj.v === 3) upgradeFromV3(obj, data);
  return obj;
}

function upgradeFromV3(obj, data) {
  const fresh = ruleValues(data.rules);
  obj.women = Math.round(obj.pop / 2);
  obj.pregnancies = []; obj.resting = [];
  obj.cohorts = (obj.cohorts || []).map((c) => ({ born: c.born, m: Math.ceil(c.n / 2), f: Math.floor(c.n / 2) }));
  obj.parties = (obj.parties || []).map((p) => ({ ...p, m: p.people, f: 0 }));
  obj.cooldowns = { invite: Math.max(obj.turn + 2, 5), prompted: false };
  obj.mods = { coldMult: 1, ...obj.mods };
  obj.rules = obj.rulesModified ? { ...fresh, ...Object.fromEntries(Object.entries(obj.rules).filter(([k]) => k in fresh)) } : fresh;
  obj.v = 4;
}

export function isValidSave(obj) {
  return !!obj && obj.v === SAVE_VERSION && typeof obj.name === 'string' && NAME_PATTERN.test(obj.name) &&
    typeof obj.turn === 'number' && typeof obj.rng === 'number' && Array.isArray(obj.rivals) && !!obj.rules;
}
