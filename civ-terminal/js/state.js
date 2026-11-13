// The game state: one plain, JSON-serializable object.
import { hashSeed } from './rng.js';

export const SAVE_VERSION = 1;
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
    era: data.eras[0].id,
    pop: rules.startPopulation,
    food: rules.startFood,
    energy: rules.startEnergy,
    knowledge: 0,
    stability: rules.stabilityRest,
    arms: 0,
    structures: {},
    mods: { foodPerTurn: 0, energyPerTurn: 0, knowledgePerTurn: 0, stabilityPerTurn: 0, forageMult: 1, spoilMult: 1 },
    flags: {},
    locks: [],
    resolved: [],
    pending: [],      // delayed consequences waiting for their turn
    history: [],      // { turn, kind, text }
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

export function isValidSave(obj) {
  return !!obj && obj.v === SAVE_VERSION && typeof obj.name === 'string' && NAME_PATTERN.test(obj.name) &&
    typeof obj.turn === 'number' && typeof obj.rng === 'number' && Array.isArray(obj.rivals) && !!obj.rules;
}
