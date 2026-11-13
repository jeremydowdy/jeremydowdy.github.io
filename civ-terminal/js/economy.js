// One turn of the economy. Pure: it only reads and changes `state`.
//
// A turn is a stretch of time on the calendar (a season in the Stone Age).
// Each turn the band forages, eats, learns, and its numbers change by
// themselves: children are born and grow up, people die, and when people
// are hungry, crowded or unhappy they leave and take food and knowledge
// with them. The player's choices push on all of this.
import { nextRandom } from './rng.js';

const round1 = (x) => Math.round(x * 10) / 10;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- calendar
const DEFAULT_SEASON = { name: 'Year', forage: 1, death: 1 };

// What time it is: the year, the season, and a label like "Winter, year 2".
export function clockInfo(state, data) {
  const era = data.eras.find((e) => e.id === state.era) || data.eras[0];
  const clock = era.clock || {};
  const seasons = clock.seasons && clock.seasons.length ? clock.seasons : [DEFAULT_SEASON];
  const seasonal = !!(clock.perYear > 1 && clock.seasons);
  const season = seasons[Math.min(state.clock.step, seasons.length - 1)];
  return { year: state.clock.year, step: state.clock.step, season, seasonal, seasons,
    label: seasonal ? `${season.name}, year ${state.clock.year}` : `Year ${state.clock.year}` };
}

function advanceClock(state, data) {
  const era = data.eras.find((e) => e.id === state.era) || data.eras[0];
  const c = era.clock || {};
  if (c.perYear > 1) {
    state.clock.step += 1;
    if (state.clock.step >= c.perYear) { state.clock.step = 0; state.clock.year += 1; }
  } else {
    state.clock.step = 0;
    state.clock.year += c.yearsPerTurn || 1;
  }
}

// ---------------------------------------------------------------- people
export const people = (state) => state.pop + state.kids;

export function capacity(state, data) {
  let cap = state.rules.baseCapacity;
  for (const s of data.structures) cap += (state.structures[s.id] || 0) * (s.capacity || 0);
  return cap;
}

// Food the whole band eats in a turn. Children eat less, but they don't forage.
export function foodNeed(state) {
  return state.pop * state.rules.eatPerPerson + state.kids * state.rules.childEat;
}

function addKids(state, n, turn) {
  if (n <= 0) return;
  state.cohorts.push({ born: turn, n });
  state.kids += n;
}

// Takes children away, youngest first. Returns how many were removed.
function removeKids(state, n) {
  let left = Math.min(n, state.kids);
  const removed = left;
  while (left > 0 && state.cohorts.length) {
    const c = state.cohorts[state.cohorts.length - 1];
    const take = Math.min(c.n, left);
    c.n -= take; left -= take; state.kids -= take;
    if (!c.n) state.cohorts.pop();
  }
  return removed;
}

function matureKids(state, turn) {
  while (state.cohorts.length && turn - state.cohorts[0].born >= state.rules.matureTurns) {
    const c = state.cohorts.shift();
    state.kids -= c.n; state.pop += c.n;
  }
}

// A whole number that averages out to `expected`: 2.3 is usually 2, sometimes 3.
function roll(state, expected) {
  if (expected <= 0) return 0;
  const whole = Math.floor(expected);
  return whole + (nextRandom(state) < expected - whole ? 1 : 0);
}

// ---------------------------------------------------------------- production
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

// Expected change per turn with average weather, this season (spoilage,
// famine, births and deaths are not included).
export function forecast(state, data) {
  const R = state.rules;
  const g = structureGains(state, data);
  const { season } = clockInfo(state, data);
  return {
    food: forage(state, season.forage ?? 1) + g.food + state.mods.foodPerTurn - foodNeed(state) - state.arms * R.armsUpkeep,
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
  state.kids = Math.max(0, Math.round(state.kids));
  state.food = Math.max(0, round1(state.food));
  state.energy = Math.max(0, round1(state.energy));
  state.knowledge = Math.max(0, round1(state.knowledge));
  state.stability = clamp(round1(state.stability), 0, 100);
}

// ---------------------------------------------------------------- one turn
// Advance one turn. Returns things worth telling the player, as { text, tone }
// where tone is 'good', 'bad' or ''.
export function tick(state, data) {
  const R = state.rules;
  const events = [];
  const say = (text, tone = '') => events.push({ text, tone });
  const note = (kind, text) => state.history.push({ turn: state.turn, kind, text });
  const clock = clockInfo(state, data);
  const season = clock.season;
  const g = structureGains(state, data);
  const cap = capacity(state, data);
  const rec = { turn: state.turn, label: clock.label, year: clock.year, season: season.name, cold: !!season.cold,
    born: 0, died: 0, left: 0 };

  // Food: forage, then eat. Each season forages differently.
  const weather = 1 + (nextRandom(state) * 2 - 1) * R.weatherSwing;
  state.food += forage(state, weather * (season.forage ?? 1)) + g.food + state.mods.foodPerTurn
    - foodNeed(state) - state.arms * R.armsUpkeep;

  if (state.food < 0) {
    // Famine. Children are hit harder than adults.
    const unfed = -state.food / R.eatPerPerson;
    const dead = Math.min(people(state), Math.max(1, Math.ceil(unfed * R.starvationRate)));
    const weight = state.kids * R.childVulnerability;
    const kidsDead = Math.min(state.kids, Math.round(dead * weight / ((weight + state.pop) || 1)));
    removeKids(state, kidsDead);
    state.pop -= Math.min(state.pop, dead - kidsDead);
    rec.died += dead;
    state.stability -= R.famineUnrest;
    state.food = 0;
    const text = `Famine. ${plural(dead, 'person', 'people')} died of hunger` + (kidsDead ? `, ${kidsDead} of them ${kidsDead === 1 ? 'a child' : 'children'}.` : '.');
    say(text, 'bad'); note('famine', text);
  } else {
    state.food -= state.food * R.spoilage * Math.max(0, state.mods.spoilMult);
  }

  // Ordinary deaths: illness, accidents, age. Winter is harder.
  const harsh = season.death ?? 1;
  const adultDeaths = Math.min(state.pop, roll(state, state.pop * R.deathRate * harsh));
  const kidDeaths = Math.min(state.kids, roll(state, state.kids * R.childDeathRate * harsh));
  state.pop -= adultDeaths; removeKids(state, kidDeaths);
  rec.died += adultDeaths + kidDeaths;
  if (adultDeaths + kidDeaths >= 2) say(`${plural(adultDeaths + kidDeaths, 'person', 'people')} died of sickness${season.cold ? ' and the cold' : ''}.`, 'bad');

  // Children grow up, then new ones are born. More food means more births,
  // and more births mean more mouths to feed.
  matureKids(state, state.turn);
  const needNow = foodNeed(state);
  const stock = needNow > 0 ? state.food / needNow : 9;                    // turns of food in store
  const fed = clamp(stock / R.birthFoodTurns, 0, 1);
  const over = people(state) > cap ? (people(state) - cap) / cap : 0;
  const room = Math.max(0, 1 - R.crowdBirthDrop * over);
  rec.born = roll(state, state.pop * R.birthRate * fed * room);
  addKids(state, rec.born, state.turn);
  if (rec.born >= 3) say(`A baby boom: ${rec.born} babies born. More mouths to feed.`, 'good');

  // Work and learning: adults only.
  state.energy += state.pop * R.laborEnergy + g.energy + state.mods.energyPerTurn;
  const learned = (state.pop * R.knowledgePerPerson + g.knowledge + state.mods.knowledgePerTurn) * state.mods.knowledgeMult;
  state.knowledge = state.knowledge * (1 - R.knowledgeDecay) + learned;

  // Mood: drifts back to normal, and is pushed down by hunger and crowding.
  const total = people(state);
  const food2 = foodNeed(state);
  const secure = food2 > 0 ? state.food / food2 : 9;
  const hungry = secure < R.hungerTurns, crowded = total > cap;
  let push = (R.stabilityRest - state.stability) * R.stabilityPull + g.stability + state.mods.stabilityPerTurn;
  if (hungry) push -= R.hungerUnrest * (1 - secure / R.hungerTurns);
  if (crowded) push -= R.crowdUnrest * ((total - cap) / cap) * 10;
  if (!hungry && !crowded && secure >= R.contentTurns) push += R.contentment;
  state.stability += push;
  tidy(state);

  // When people are unhappy enough, some of them leave, and take food and knowledge with them.
  if (state.stability < R.unrestThreshold && state.pop > R.minStay) {
    const severity = (R.unrestThreshold - state.stability) / R.unrestThreshold;
    const adults = Math.min(state.pop - R.minStay, roll(state, state.pop * R.leaveRate * severity));
    if (adults > 0) {
      const kids = Math.min(state.kids, Math.round(state.kids * adults / state.pop));
      const going = adults + kids;
      const everyone = people(state);
      const foodTaken = Math.min(state.food, round1(state.food * (going / everyone) * R.leaveFoodShare));
      const knowTaken = Math.min(state.knowledge, round1(state.knowledge * (adults / state.pop) * R.leaveKnowledge));
      state.pop -= adults; removeKids(state, kids);
      state.food -= foodTaken; state.knowledge -= knowTaken;
      state.stability += R.leaveRelief;
      rec.left = going;
      const why = hungry ? 'hungry' : crowded ? 'crowded' : 'unhappy with how things are going';
      const bits = [];
      if (foodTaken > 0) bits.push(`${round1(foodTaken)} food`);
      if (knowTaken > 0) bits.push(`${round1(knowTaken)} knowledge`);
      const text = `Fed up (${why}), ${plural(going, 'person', 'people')} walked away` + (kids ? `, ${kids} of them ${kids === 1 ? 'a child' : 'children'}` : '') +
        (bits.length ? `, taking ${bits.join(' and ')} with them.` : '.');
      say(text, 'bad'); note('unrest', text);
    }
  }
  tidy(state);

  // Delayed consequences of earlier decisions.
  const due = state.pending.filter((p) => p.due <= state.turn);
  state.pending = state.pending.filter((p) => p.due > state.turn);
  for (const p of due) {
    applyEffects(state, p.effects);
    const text = `${p.text} (From turn ${p.from.turn}: "${p.from.label}".)`;
    note('consequence', text);
    say(text);
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
    note('expedition', text);
    say(text, lost ? 'bad' : '');
  }

  tidy(state);

  // One record per turn: the date and the numbers, for the timeline.
  state.timeline.push({ ...rec, pop: state.pop, kids: state.kids, food: state.food, knowledge: state.knowledge,
    stability: state.stability, energy: state.energy });
  if (state.timeline.length > 1000) state.timeline.shift();
  advanceClock(state, data);

  if (people(state) <= 0 && !state.parties.length) {
    state.over = 'collapse';
    note('end', 'The last of the group is gone.');
    say('The last of the group is gone.', 'bad');
  }
  state.turn += 1;
  return events;
}
