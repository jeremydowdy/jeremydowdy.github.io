// One turn of the economy. Pure: it only reads and changes `state`.
import { nextRandom } from './rng.js';

const round1 = (x) => Math.round(x * 10) / 10;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function capacity(state, data) {
  let cap = state.rules.baseCapacity;
  for (const s of data.structures) cap += (state.structures[s.id] || 0) * (s.capacity || 0);
  return cap;
}

function structureGains(state, data) {
  const g = { food: 0, energy: 0, knowledge: 0, stability: 0 };
  for (const s of data.structures) {
    const n = state.structures[s.id] || 0;
    if (!n || !s.perTurn) continue;
    for (const k of Object.keys(g)) g[k] += n * (s.perTurn[k] || 0);
  }
  // Discoveries can improve what a structure gives (cooking makes fires feed people).
  for (const d of data.discoveries || []) {
    if (!state.discovered.includes(d.id) || !d.boost) continue;
    for (const [id, per] of Object.entries(d.boost)) {
      const n = state.structures[id] || 0;
      for (const k of Object.keys(g)) g[k] += n * (per[k] || 0);
    }
  }
  return g;
}

// Food produced by foraging. Each extra forager finds a little less.
export function forage(state, weather = 1) {
  const R = state.rules;
  const crowding = R.landCapacity / (R.landCapacity + state.pop);
  return R.foragePerPerson * state.pop * crowding * weather * state.mods.forageMult;
}

// Expected change per turn with average weather (spoilage, famine and
// delayed consequences are not included).
export function forecast(state, data) {
  const R = state.rules;
  const g = structureGains(state, data);
  return {
    food: forage(state) + g.food + state.mods.foodPerTurn - state.pop * R.eatPerPerson - state.arms * R.armsUpkeep,
    energy: state.pop * R.laborEnergy + g.energy + state.mods.energyPerTurn,
    knowledge: (state.pop * R.knowledgePerPerson + g.knowledge + state.mods.knowledgePerTurn) * state.mods.knowledgeMult
      - state.knowledge * R.knowledgeDecay,
  };
}

export function foodForecast(state, data) {
  return forecast(state, data).food;
}

// Apply a bundle of effects: instant changes, rival trust, and lasting modifiers.
export function applyEffects(state, fx = {}) {
  for (const k of ['pop', 'food', 'energy', 'knowledge', 'stability']) {
    if (typeof fx[k] === 'number') state[k] += fx[k];
  }
  if (typeof fx.trust === 'number') {
    for (const r of state.rivals) r.trust = clamp(r.trust + fx.trust, 0, 100);
  }
  if (fx.mods) {
    for (const [k, v] of Object.entries(fx.mods)) state.mods[k] = round1((state.mods[k] || 0) * 1000 + v * 1000) / 1000;
  }
  tidy(state);
}

export function tidy(state) {
  state.pop = Math.max(0, Math.round(state.pop));
  state.food = Math.max(0, round1(state.food));
  state.energy = Math.max(0, round1(state.energy));
  state.knowledge = Math.max(0, round1(state.knowledge));
  state.stability = clamp(round1(state.stability), 0, 100);
}

// Advance one turn. Returns a list of things worth telling the player.
export function tick(state, data) {
  const R = state.rules;
  const events = [];
  const g = structureGains(state, data);
  const cap = capacity(state, data);

  const weather = 1 + (nextRandom(state) * 2 - 1) * R.weatherSwing;
  state.food += forage(state, weather) + g.food + state.mods.foodPerTurn
    - state.pop * R.eatPerPerson - state.arms * R.armsUpkeep;

  if (state.food < 0) {
    const unfed = -state.food / R.eatPerPerson;
    const died = Math.min(state.pop, Math.max(1, Math.ceil(unfed * R.starvationRate)));
    state.pop -= died;
    state.stability -= R.famineUnrest;
    state.food = 0;
    events.push(`Famine. ${died} ${died === 1 ? 'person' : 'people'} died.`);
  } else {
    state.food -= state.food * R.spoilage * Math.max(0, state.mods.spoilMult);
    if (state.food > state.pop * R.growthReserve && state.pop < cap) {
      const born = Math.max(1, Math.floor(state.pop * R.growthRate));
      state.pop = Math.min(cap, state.pop + born);
    }
  }

  state.energy += state.pop * R.laborEnergy + g.energy + state.mods.energyPerTurn;
  const learned = (state.pop * R.knowledgePerPerson + g.knowledge + state.mods.knowledgePerTurn) * state.mods.knowledgeMult;
  state.knowledge = state.knowledge * (1 - R.knowledgeDecay) + learned;
  state.stability += (R.stabilityRest - state.stability) * R.stabilityPull + g.stability + state.mods.stabilityPerTurn;
  tidy(state);

  if (state.stability < R.unrestThreshold && state.pop > 0) {
    const left = Math.max(1, Math.ceil(state.pop * 0.05));
    state.pop -= left;
    events.push(`Unrest. ${left} ${left === 1 ? 'person' : 'people'} left the group.`);
  }

  // Delayed consequences of earlier decisions.
  const due = state.pending.filter((p) => p.due <= state.turn);
  state.pending = state.pending.filter((p) => p.due > state.turn);
  for (const p of due) {
    applyEffects(state, p.effects);
    const text = `${p.text} (From turn ${p.from.turn}: "${p.from.label}".)`;
    state.history.push({ turn: state.turn, kind: 'consequence', text });
    events.push(text);
  }

  // Expedition parties coming home.
  const home = state.parties.filter((p) => p.due <= state.turn);
  state.parties = state.parties.filter((p) => p.due > state.turn);
  for (const p of home) {
    const ex = (data.expeditions || []).find((e) => e.id === p.id);
    if (!ex) { state.pop += p.people; continue; }
    const lost = nextRandom(state) < ex.risk ? 1 : 0;
    state.pop += p.people - lost;
    applyEffects(state, ex.reward);
    const bits = [`${ex.name}: the party is home.`];
    if (ex.reward && ex.reward.knowledge) bits.push(`+${ex.reward.knowledge} knowledge.`);
    if (lost) bits.push(ex.mishap || 'One of the party did not come back.');
    for (const f of ex.finds || []) {
      if (nextRandom(state) < f.chance) { applyEffects(state, f.effects); bits.push(f.text); }
    }
    const text = bits.join(' ');
    state.history.push({ turn: state.turn, kind: 'expedition', text });
    events.push(text);
  }

  tidy(state);
  if (state.pop <= 0 && !state.parties.length) {
    state.over = 'collapse';
    state.history.push({ turn: state.turn, kind: 'end', text: 'The last of the group is gone.' });
    events.push('The last of the group is gone.');
  }
  state.turn += 1;
  return events;
}
