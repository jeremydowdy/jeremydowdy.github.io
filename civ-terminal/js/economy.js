// One turn of the economy. Pure: it only reads and changes `state`.
//
// A turn is a stretch of time on the calendar (a season in the Stone Age).
// Each turn the band gathers, fishes and hunts, eats, learns, and its numbers
// change by themselves: women get pregnant and give birth, some pregnancies
// are lost, children grow up, people die, and when people are hungry, crowded
// or unhappy they leave and take food and knowledge with them. Because births
// come from how many women there are, a bigger band grows faster: growth is
// exponential until food or room runs short.
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
export const men = (state) => state.pop - state.women;

export function capacity(state, data) {
  let cap = state.rules.baseCapacity;
  for (const s of data.structures) cap += (state.structures[s.id] || 0) * (s.capacity || 0);
  return cap;
}

// Food the whole band eats in a turn. Children eat less, but they don't forage.
export function foodNeed(state) {
  return state.pop * state.rules.eatPerPerson + state.kids * state.rules.childEat;
}

// Several of the same thing give less each time: n copies are worth
// (1 - d^n) / (1 - d) of the first, for d below 1.
const worth = (n, d) => (d && d < 1 ? (1 - Math.pow(d, n)) / (1 - d) : n);

// How much healers' huts cut deaths and lost pregnancies (1 = not at all).
export function healthFactor(state, data) {
  let f = 1;
  for (const s of data.structures) if (s.health) f *= Math.pow(1 - s.health, state.structures[s.id] || 0);
  return Math.max(0.35, f);
}

function addKids(state, m, f, turn) {
  if (m + f <= 0) return;
  state.cohorts.push({ born: turn, m, f });
  state.kids += m + f;
}

// Takes `k` children out of one group, keeping the boy/girl split fair.
function takeFromCohort(state, c, k) {
  const total = c.m + c.f;
  k = Math.min(k, total);
  if (k <= 0) return 0;
  let boys = Math.min(c.m, Math.round(k * c.m / total));
  let girls = k - boys;
  if (girls > c.f) { girls = c.f; boys = k - girls; }
  c.m -= boys; c.f -= girls; state.kids -= k;
  return k;
}

// Takes children away, youngest first. Returns how many were removed.
function removeKids(state, n) {
  let left = Math.min(n, state.kids);
  const removed = left;
  while (left > 0 && state.cohorts.length) {
    const c = state.cohorts[state.cohorts.length - 1];
    left -= takeFromCohort(state, c, left);
    if (c.m + c.f <= 0) state.cohorts.pop();
  }
  return removed;
}

function matureKids(state, turn) {
  while (state.cohorts.length && turn - state.cohorts[0].born >= state.rules.matureTurns) {
    const c = state.cohorts.shift();
    state.kids -= c.m + c.f; state.pop += c.m + c.f; state.women += c.f;
  }
}

// Keeps the pregnancy and rest lists consistent with how many women there are.
function settleWomen(state) {
  state.women = clamp(state.women, 0, state.pop);
  if (state.pregnancies.length > state.women) state.pregnancies.length = state.women;
  const room = state.women - state.pregnancies.length;
  if (state.resting.length > room) state.resting.length = Math.max(0, room);
}

// Women die or leave. A pregnant woman takes her pregnancy with her.
export function removeWomen(state, n, { keepPregnant = false } = {}) {
  let gone = 0;
  for (let i = 0; i < n && state.women > 0; i++) {
    const preg = state.pregnancies.length;
    const pregnant = !keepPregnant && preg > 0 && nextRandom(state) < preg / state.women;
    if (pregnant) state.pregnancies.pop();
    state.women -= 1; state.pop -= 1; gone += 1;
    settleWomen(state);
  }
  return gone;
}

export function removeMen(state, n) {
  const gone = Math.min(n, men(state));
  state.pop -= gone;
  return gone;
}

// Adults leave or die, women and men in proportion to how many there are.
export function removeAdults(state, n) {
  let gone = 0;
  for (let i = 0; i < n && state.pop > 0; i++) {
    const woman = state.women > 0 && nextRandom(state) < state.women / state.pop;
    gone += woman ? removeWomen(state, 1) : removeMen(state, 1);
  }
  return gone;
}

export function addAdults(state, n) {
  for (let i = 0; i < n; i++) { state.pop += 1; if (nextRandom(state) < 0.5) state.women += 1; }
}

// A whole number that averages out to `expected`: 2.3 is usually 2, sometimes 3.
function roll(state, expected) {
  if (expected <= 0) return 0;
  const whole = Math.floor(expected);
  return whole + (nextRandom(state) < expected - whole ? 1 : 0);
}

// ---------------------------------------------------------------- production
// Everything the band makes and uses in a turn, line by line, so the player
// can see where food and wood come from and where they go.
export function ledger(state, data, weather = 1) {
  const R = state.rules;
  const { season } = clockInfo(state, data);
  const crowd = R.landCapacity / (R.landCapacity + state.pop);
  const foodIn = [], energyIn = [];
  const add = (list, label, amount) => { if (Math.abs(amount) > 0.005) list.push({ label, amount }); };

  add(foodIn, 'Gathering', R.foragePerPerson * state.pop * crowd * weather * (season.forage ?? 1) * state.mods.forageMult);
  // Wood is finite too: the nearest trees are cut first, so each extra person brings in less.
  add(energyIn, 'Gathering wood', state.pop * R.laborEnergy * (R.woodCapacity / (R.woodCapacity + state.pop)));

  for (const s of data.structures) {
    const n = state.structures[s.id] || 0;
    if (!n || !s.perTurn) continue;
    const eff = worth(n, s.diminish);
    const mult = s.seasonKey ? (season[s.seasonKey] ?? 1) : 1;
    const label = n > 1 ? `${s.name} x${n}` : s.name;
    add(foodIn, label, (s.perTurn.food || 0) * eff * mult);
    add(energyIn, label, (s.perTurn.energy || 0) * eff);
  }
  // Discoveries can improve what a structure gives (cooking makes fires feed people).
  for (const d of data.discoveries || []) {
    if (!state.discovered.includes(d.id) || !d.boost) continue;
    for (const [id, per] of Object.entries(d.boost)) {
      const n = state.structures[id] || 0;
      if (n) { add(foodIn, `${d.name} at the fires`, n * (per.food || 0)); add(energyIn, d.name, n * (per.energy || 0)); }
    }
  }
  add(foodIn, 'Decisions', state.mods.foodPerTurn);
  add(energyIn, 'Decisions', state.mods.energyPerTurn);

  const foodOut = [];
  add(foodOut, 'Adults eat', -state.pop * R.eatPerPerson);
  add(foodOut, 'Children eat', -state.kids * R.childEat);
  add(foodOut, 'Upkeep of arms', -state.arms * R.armsUpkeep);

  const sum = (list) => list.reduce((n, x) => n + x.amount, 0);
  return { season, food: { in: foodIn, out: foodOut, net: sum(foodIn) + sum(foodOut) }, energy: { in: energyIn, net: sum(energyIn) } };
}

// Knowledge and stability from structures (food and wood are in the ledger).
function structureGains(state, data) {
  const g = { knowledge: 0, stability: 0 };
  for (const s of data.structures) {
    const n = state.structures[s.id] || 0;
    if (!n || !s.perTurn) continue;
    const eff = worth(n, s.diminish);
    for (const k of Object.keys(g)) g[k] += eff * (s.perTurn[k] || 0);
  }
  return g;
}

// Expected change per turn with average weather, this season (spoilage,
// famine, births and deaths are not included).
export function forecast(state, data) {
  const R = state.rules;
  const L = ledger(state, data);
  const g = structureGains(state, data);
  return {
    food: L.food.net,
    energy: L.energy.net,
    knowledge: (state.pop * R.knowledgePerPerson + g.knowledge + state.mods.knowledgePerTurn) * state.mods.knowledgeMult
      - state.knowledge * R.knowledgeDecay,
  };
}

export function foodForecast(state, data) {
  return forecast(state, data).food;
}

// Apply a bundle of effects: instant changes, rival trust, and lasting modifiers.
export function applyEffects(state, fx = {}) {
  for (const k of ['food', 'energy', 'knowledge', 'stability']) {
    if (typeof fx[k] === 'number') state[k] += fx[k];
  }
  if (typeof fx.pop === 'number' && fx.pop !== 0) {
    if (fx.pop < 0) removeAdults(state, Math.round(-fx.pop)); else addAdults(state, Math.round(fx.pop));
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
  settleWomen(state);
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
  const health = healthFactor(state, data);
  const rec = { turn: state.turn, label: clock.label, year: clock.year, season: season.name, cold: !!season.cold,
    born: 0, died: 0, left: 0, lost: 0 };

  // Food: gather, fish and hunt, then eat. Each season gives different amounts.
  const weather = 1 + (nextRandom(state) * 2 - 1) * R.weatherSwing;
  state.food += ledger(state, data, weather).food.net;

  if (state.food < 0) {
    // Famine. Children are hit harder than adults.
    const unfed = -state.food / R.eatPerPerson;
    const dead = Math.min(people(state), Math.max(1, Math.ceil(unfed * R.starvationRate)));
    const weight = state.kids * R.childVulnerability;
    const kidsDead = Math.min(state.kids, Math.round(dead * weight / ((weight + state.pop) || 1)));
    removeKids(state, kidsDead);
    removeAdults(state, dead - kidsDead);
    rec.died += dead;
    state.stability -= R.famineUnrest;
    state.food = 0;
    const text = `Famine. ${plural(dead, 'person', 'people')} died of hunger` + (kidsDead ? `, ${kidsDead} of them ${kidsDead === 1 ? 'a child' : 'children'}.` : '.');
    say(text, 'bad'); note('famine', text);
  } else {
    state.food -= state.food * R.spoilage * Math.max(0, state.mods.spoilMult);
  }

  // How secure the band feels: turns of food in store, after eating.
  const stockNow = foodNeed(state) > 0 ? state.food / foodNeed(state) : 9;
  const lean = stockNow < R.hungerTurns;

  // Ordinary deaths: illness, accidents, age. Winter is harder; healers help.
  const harsh = (season.death ?? 1) * (season.cold ? state.mods.coldMult ?? 1 : 1) * health;
  const womenDie = removeWomen(state, Math.min(state.women, roll(state, state.women * R.deathRate * harsh)));
  const menDie = removeMen(state, Math.min(men(state), roll(state, men(state) * R.deathRate * harsh)));
  let kidDeaths = 0;
  for (const c of state.cohorts) {
    const infant = state.turn - c.born < R.infantTurns ? R.infantDeathRate : 0;
    const k = Math.min(c.m + c.f, roll(state, (c.m + c.f) * (R.childDeathRate + infant) * harsh));
    kidDeaths += takeFromCohort(state, c, k);
  }
  state.cohorts = state.cohorts.filter((c) => c.m + c.f > 0);
  rec.died += womenDie + menDie + kidDeaths;
  if (womenDie + menDie + kidDeaths >= 2) say(`${plural(womenDie + menDie + kidDeaths, 'person', 'people')} died of sickness${season.cold ? ' and the cold' : ''}.`, 'bad');

  // Children grow up.
  matureKids(state, state.turn);
  settleWomen(state);

  // Pregnancies: some are lost, and at term a baby (sometimes two) is born.
  state.resting = state.resting.filter((until) => until > state.turn);
  const going = [];
  let mothersLost = 0, babiesM = 0, babiesF = 0;
  for (const due of state.pregnancies) {
    if (due > state.turn) {
      if (nextRandom(state) < R.miscarriageRate * (lean ? 2.5 : 1) * health) {
        rec.lost += 1;
        state.resting.push(state.turn + 1);
      } else going.push(due);
      continue;
    }
    const babies = 1 + (nextRandom(state) < R.twinChance ? 1 : 0);
    for (let b = 0; b < babies; b++) { if (nextRandom(state) < 0.5) babiesM++; else babiesF++; }
    if (nextRandom(state) < R.birthDeathRate * health * (lean ? 1.5 : 1)) {
      mothersLost += 1;                                          // she dies; her baby lives
      state.women -= 1; state.pop -= 1;
    } else state.resting.push(state.turn + R.restTurns + 1);
  }
  state.pregnancies = going;
  rec.born = babiesM + babiesF;
  rec.died += mothersLost;
  addKids(state, babiesM, babiesF, state.turn);
  settleWomen(state);
  if (rec.lost) say(`${plural(rec.lost, 'pregnancy was', 'pregnancies were')} lost.`, 'bad');
  if (mothersLost) say(`${mothersLost === 1 ? 'A mother' : mothersLost + ' mothers'} died giving birth.`, 'bad');

  // New pregnancies. More women means more pregnancies, so a bigger band
  // grows faster. Fertility falls with hunger, crowding, and too few men.
  const needNow = foodNeed(state);
  const fed = clamp((needNow > 0 ? state.food / needNow : 9) / R.birthFoodTurns, 0, 1);
  const over = people(state) > cap ? (people(state) - cap) / cap : 0;
  const room = Math.max(0, 1 - R.crowdBirthDrop * over);
  const mates = Math.min(1, men(state) / Math.max(1, state.women * R.mateRatio));
  const chance = R.conceiveChance * fed * room * mates;
  const ready = Math.max(0, state.women - state.pregnancies.length - state.resting.length);
  for (let i = 0; i < ready; i++) if (nextRandom(state) < chance) state.pregnancies.push(state.turn + R.gestation);
  if (rec.born >= 4) say(`A baby boom: ${rec.born} babies born. More mouths to feed.`, 'good');

  // Work and learning: adults only.
  state.energy += ledger(state, data).energy.net;
  const learned = (state.pop * R.knowledgePerPerson + g.knowledge + state.mods.knowledgePerTurn) * state.mods.knowledgeMult;
  state.knowledge = state.knowledge * (1 - R.knowledgeDecay) + learned;

  // Mood: drifts back to normal, and is pushed down by hunger and crowding.
  const total = people(state);
  const secure = foodNeed(state) > 0 ? state.food / foodNeed(state) : 9;
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
      const share = adults / state.pop;
      const kids = Math.min(state.kids, Math.round(state.kids * share));
      const goingOut = adults + kids;
      const everyone = people(state);
      const foodTaken = Math.min(state.food, round1(state.food * (goingOut / everyone) * R.leaveFoodShare));
      const knowTaken = Math.min(state.knowledge, round1(state.knowledge * share * R.leaveKnowledge));
      removeAdults(state, adults); removeKids(state, kids);
      state.food -= foodTaken; state.knowledge -= knowTaken;
      state.stability += R.leaveRelief;
      rec.left = goingOut;
      const why = hungry ? 'hungry' : crowded ? 'crowded' : 'unhappy with how things are going';
      const bits = [];
      if (foodTaken > 0) bits.push(`${round1(foodTaken)} food`);
      if (knowTaken > 0) bits.push(`${round1(knowTaken)} knowledge`);
      const text = `Fed up (${why}), ${plural(goingOut, 'person', 'people')} walked away` + (kids ? `, ${kids} of them ${kids === 1 ? 'a child' : 'children'}` : '') +
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
    let m = p.m ?? p.people, f = p.f ?? 0;
    if (!ex) { state.pop += m + f; state.women += f; continue; }
    const lost = nextRandom(state) < ex.risk ? 1 : 0;
    if (lost) { if (m > 0) m -= 1; else f -= 1; }
    state.pop += m + f; state.women += f;
    applyEffects(state, ex.reward || {});
    const bits = [`${ex.name}: the party is home.`];
    if (ex.reward && ex.reward.knowledge) bits.push(`+${ex.reward.knowledge} knowledge.`);
    if (lost) bits.push(ex.mishap || 'One of the party did not come back.');
    let bad = !!lost;
    for (const find of ex.finds || []) {
      if (nextRandom(state) < find.chance) {
        applyEffects(state, find.effects); bits.push(find.text);
        if ((find.effects.pop || 0) < 0 || (find.effects.stability || 0) < 0) bad = true;
        if (ex.random) break;                                   // a random draw: only one thing happens
      }
    }
    const text = bits.join(' ');
    note('expedition', text);
    say(text, bad ? 'bad' : '');
  }

  tidy(state);

  // One record per turn: the date and the numbers, for the timeline.
  state.timeline.push({ ...rec, pop: state.pop, women: state.women, pregnant: state.pregnancies.length, kids: state.kids,
    food: state.food, knowledge: state.knowledge, stability: state.stability, energy: state.energy });
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
