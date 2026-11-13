import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../js/game.js';
import { people, foodNeed, forecast, capacity, clockInfo } from '../js/economy.js';
import { isValidSave, migrate, ruleValues } from '../js/state.js';
import { loadData } from './helpers.js';

const data = loadData();
const fresh = (seed = 'pop') => game.newGame('Pop', seed, data);
// Turns the random parts of a turn off, so a test can look at one rule at a time.
const calm = (s, extra = {}) => { Object.assign(s.rules, { weatherSwing: 0, birthRate: 0, deathRate: 0, childDeathRate: 0, spoilage: 0 }, extra); return s; };
const step = (s, n = 1) => game.advance(s, data, n);
const kidsMatch = (s) => s.kids === s.cohorts.reduce((n, c) => n + c.n, 0);

test('the calendar: spring, summer, autumn, winter, then a new year', () => {
  const s = fresh();
  assert.equal(game.calendar(s, data).label, 'Spring, year 1');
  const seen = [];
  for (let i = 0; i < 9; i++) { seen.push(game.calendar(s, data).label); calm(s, { eatPerPerson: 0, famineUnrest: 0 }); s.food = 99; step(s); if (s.dilemma) game.choose(s, data, 'A'); }
  assert.deepEqual(seen, ['Spring, year 1', 'Summer, year 1', 'Autumn, year 1', 'Winter, year 1', 'Spring, year 2', 'Summer, year 2', 'Autumn, year 2', 'Winter, year 2', 'Spring, year 3']);
});

test('each turn adds a season-change message, only when the season actually changes', () => {
  const s = calm(fresh());
  const out = step(s);
  assert.equal(out.lines.filter((l) => l.kind === 'season').length, 1);
  assert.match(out.lines.find((l) => l.kind === 'season').text, /^Summer begins/);
  assert.ok(out.lines.find((l) => l.kind === 'event' || true));
  const eras = structuredClone(data); eras.eras[0].clock = { yearsPerTurn: 10 };
  const t = game.newGame('Y', 'y', eras);
  assert.equal(game.advance(t, eras, 1).lines.filter((l) => l.kind === 'season').length, 0);
  assert.equal(game.calendar(t, eras).label, 'Year 11');
});

test('winter is lean: the same band forages far less in winter than in summer', () => {
  const s = fresh(); s.rules.weatherSwing = 0;
  const at = (step) => { s.clock.step = step; return forecast(s, data).food + foodNeed(s); };
  const [spring, summer, autumn, winter] = [0, 1, 2, 3].map(at);
  assert.ok(summer > autumn && autumn > spring && spring > winter, `${spring} ${summer} ${autumn} ${winter}`);
  assert.ok(Math.abs(winter / spring - 0.5) < 0.01 && Math.abs(summer / spring - 1.3) < 0.01);
});

test('a fed band has babies; a starving one has none', () => {
  const births = (food, forageOff) => {
    let total = 0;
    for (let i = 0; i < 20; i++) {
      const s = fresh('b' + i); s.rules.weatherSwing = 0; s.food = food; if (forageOff) s.rules.foragePerPerson = 0;
      step(s); total += s.timeline[0].born;
    }
    return total;
  };
  assert.ok(births(200) > 10, 'a well fed band should have babies');
  assert.equal(births(0, true), 0, 'a band with no food should have none');
});

test('more food, more births: fertility rises with the food in store', () => {
  const births = (food) => { let t = 0; for (let i = 0; i < 60; i++) { const s = fresh('f' + i); s.rules.weatherSwing = 0; s.food = food; step(s); t += s.timeline[0].born; } return t; };
  const [low, mid, high] = [3, 14, 120].map(births);
  assert.ok(low < mid && mid <= high, `${low} < ${mid} <= ${high}`);
});

test('children eat less, do not forage or learn, and cost the band food', () => {
  const s = fresh(); calm(s);
  const before = { need: foodNeed(s), f: forecast(s, data) };
  s.kids = 8; s.cohorts = [{ born: 1, n: 8 }];
  assert.equal(foodNeed(s), before.need + 8 * s.rules.childEat);
  const after = forecast(s, data);
  assert.ok(Math.abs((before.f.food - after.food) - 8 * s.rules.childEat) < 1e-9, 'children cost food');
  assert.equal(after.energy, before.f.energy);
  assert.equal(after.knowledge, before.f.knowledge);
  assert.equal(people(s), s.pop + 8);
});

test('children grow up after the set number of turns, and not before', () => {
  const s = calm(fresh(), { eatPerPerson: 0, childEat: 0, famineUnrest: 0 });
  s.food = 999; s.kids = 5; s.cohorts = [{ born: 1, n: 5 }]; s.stability = 60;
  const adults = s.pop, m = s.rules.matureTurns;
  while (s.turn < 1 + m) { if (s.dilemma) game.choose(s, data, 'A'); else step(s); s.food = 999; }
  assert.equal(s.kids, 5, 'still children one turn before they are old enough');
  assert.equal(s.pop, adults);
  if (s.dilemma) game.choose(s, data, 'A');
  s.food = 999; step(s);
  assert.equal(s.kids, 0);
  assert.equal(s.pop, adults + 5);
  assert.ok(kidsMatch(s));
});

test('famine hits children harder than adults, and leaves a note in the timeline', () => {
  let kidsLost = 0, kidsStart = 0, adultsLost = 0, adultsStart = 0, notes = 0;
  for (let i = 0; i < 60; i++) {
    const s = calm(fresh('fam' + i), { foragePerPerson: 0, starvationRate: 0.4, childVulnerability: 3 });
    s.pop = 12; s.kids = 12; s.cohorts = [{ born: 1, n: 12 }]; s.food = 0; s.stability = 60;
    const a = s.pop, k = s.kids;
    step(s);
    kidsLost += k - s.kids; kidsStart += k; adultsLost += a - s.pop; adultsStart += a;
    notes += s.history.filter((h) => h.kind === 'famine').length;
    assert.ok(kidsMatch(s));
  }
  assert.ok(kidsLost / kidsStart > adultsLost / adultsStart, `children ${kidsLost}/${kidsStart} vs adults ${adultsLost}/${adultsStart}`);
  assert.equal(notes, 60);
});

test('ordinary deaths happen, and winter is deadlier than summer', () => {
  const deaths = (stepIdx, rate) => { let n = 0; for (let i = 0; i < 80; i++) { const s = calm(fresh('d' + i), { deathRate: rate, childDeathRate: rate }); s.pop = 30; s.food = 999; s.clock.step = stepIdx; step(s); n += s.timeline[0].died; } return n; };
  assert.equal(deaths(0, 0), 0);
  const summer = deaths(1, 0.05), winter = deaths(3, 0.05);
  assert.ok(winter > summer * 1.5, `winter ${winter} vs summer ${summer}`);
});

test('crowding: past the shelter limit, people get unhappy and births fall to nothing', () => {
  const s = calm(fresh(), { birthRate: 0.2 });
  s.pop = 40; s.food = 999; s.stability = 60;
  assert.ok(people(s) > 1.5 * capacity(s, data));
  step(s);
  assert.ok(s.stability < 60 - 3, `stability only fell to ${s.stability}`);
  assert.equal(s.timeline[0].born, 0, 'no births when the camp is 100% over capacity');
  const roomy = calm(fresh(), { birthRate: 0.5 }); roomy.food = 999; step(roomy);
  assert.ok(roomy.timeline[0].born > 0);
});

test('hunger makes people anxious and security makes them content', () => {
  const run = (food) => { const s = calm(fresh(), { foragePerPerson: 0, eatPerPerson: 0.5 }); s.food = food; s.stability = 60; step(s); return s.stability; };
  assert.ok(run(5) < 58, 'with almost nothing stored, mood drops');
  assert.ok(run(400) > 60, 'with plenty stored, mood rises');
});

test('unhappy people leave, and take their share of food and knowledge with them', () => {
  const s = calm(fresh(), { foragePerPerson: 0, eatPerPerson: 0, childEat: 0, leaveRate: 1, laborEnergy: 0, knowledgePerPerson: 0, knowledgeDecay: 0, stabilityPull: 0, leaveRelief: 5, contentment: 0 });
  s.pop = 20; s.kids = 0; s.cohorts = []; s.food = 100; s.knowledge = 50; s.stability = 10;
  const out = step(s);
  const rec = s.timeline[0];
  assert.ok(rec.left > 0 && rec.left <= 17, `${rec.left} left`);
  assert.equal(s.pop, 20 - rec.left);
  const share = rec.left / 20;
  assert.ok(Math.abs(s.food - (100 - Math.round(100 * share * 10) / 10)) < 0.11, `food ${s.food}`);
  const lost = Math.min(50, Math.round(50 * share * s.rules.leaveKnowledge * 10) / 10);
  assert.ok(Math.abs(s.knowledge - (50 - lost)) < 0.11, `knowledge ${s.knowledge}, expected ${50 - lost}`);
  assert.ok(s.knowledge < 50 * (1 - share), 'they take more than their fair share of knowledge');
  const line = out.lines.find((l) => /walked away/.test(l.text));
  assert.ok(line && /taking .* food and .* knowledge/.test(line.text), line && line.text);
  assert.equal(line.tone, 'bad');
  assert.ok(s.history.some((h) => h.kind === 'unrest'));
  assert.equal(s.stability, 10 + 5, 'the ones who stay feel better once the angry ones are gone');
});

test('children go with the adults who leave, and a few adults always stay', () => {
  const s = calm(fresh(), { foragePerPerson: 0, eatPerPerson: 0, childEat: 0, leaveRate: 5, minStay: 3, stabilityPull: 0 });
  s.pop = 10; s.kids = 10; s.cohorts = [{ born: 1, n: 10 }]; s.food = 50; s.stability = 0;
  step(s);
  assert.equal(s.pop, 3, 'minStay adults remain');
  assert.ok(s.kids < 10 && s.kids >= 0);
  assert.ok(kidsMatch(s));
  const quiet = calm(fresh()); quiet.pop = 3; quiet.stability = 0; quiet.rules.minStay = 3; step(quiet);
  assert.equal(quiet.timeline[0].left, 0);
});

test('nobody leaves while people are content', () => {
  let left = 0;
  for (let i = 0; i < 30; i++) { const s = calm(fresh('c' + i)); s.food = 999; s.stability = 70; step(s); left += s.timeline[0].left; }
  assert.equal(left, 0);
});

test('every turn leaves a record, and the numbers add up: people now = people before + born - died - left', () => {
  for (const seed of ['t1', 't2', 't3']) {
    const s = fresh(seed);
    let prev = people(s);
    while (s.turn <= 60 && !s.over) {
      if (s.dilemma) { game.choose(s, data, 'A'); continue; }
      game.build(s, data, 'campfire');
      step(s);
      const r = s.timeline[s.timeline.length - 1];
      assert.equal(r.pop + r.kids, prev + r.born - r.died - r.left, `turn ${r.turn}: ${prev} + ${r.born} - ${r.died} - ${r.left} != ${r.pop + r.kids}`);
      prev = r.pop + r.kids;
      assert.ok(kidsMatch(s));
    }
    assert.equal(s.timeline.length, s.turn - 1);
    s.timeline.forEach((r, i) => assert.equal(r.turn, i + 1));
    assert.equal(s.timeline[0].label, 'Spring, year 1');
    assert.equal(s.timeline[7].label, 'Winter, year 2');
    assert.equal(s.timeline[3].cold, true);
  }
});

test('a band left alone rises and falls, and does not die out or explode', () => {
  let reversals = 0, extinct = 0, biggest = 0;
  for (let i = 0; i < 30; i++) {
    const s = fresh('idle' + i); let dir = 0, prev = people(s);
    while (s.turn <= 80 && !s.over) {
      if (s.dilemma) { game.choose(s, data, 'A'); continue; }
      step(s);
      const n = people(s), d = Math.sign(n - prev);
      if (d && dir && d !== dir) reversals++;
      if (d) dir = d;
      prev = n; biggest = Math.max(biggest, n);
    }
    if (s.over) extinct++;
  }
  assert.ok(reversals / 30 > 8, `only ${reversals / 30} ups and downs per run`);
  assert.ok(extinct <= 1, `${extinct} of 30 died out`);
  assert.ok(biggest < 60, `grew to ${biggest}`);
});

test('a sensible player grows the band over time, with setbacks along the way', () => {
  let ended = 0, walkouts = 0, famines = 0, growth = 0;
  for (let i = 0; i < 30; i++) {
    const s = fresh('sense' + i);
    while (s.turn <= 70 && !s.over) {
      if (s.dilemma) { game.choose(s, data, 'A'); continue; }
      const n = (id) => s.structures[id] || 0, cap = capacity(s, data);
      if (n('campfire') < 3 || (s.knowledge < 15 && n('campfire') < 5)) game.build(s, data, 'campfire');
      if (s.food > 12 && n('drying-rack') < 3) game.build(s, data, 'drying-rack');
      if (s.food > 15 && people(s) > cap - 4) game.build(s, data, 'shelter');
      if (!s.parties.length && s.food > 28) game.explore(s, data, 'follow-river').ok || game.explore(s, data, 'scout-hills');
      const out = step(s);
      for (const l of out.lines) { if (/walked away/.test(l.text)) walkouts++; if (/Famine/.test(l.text)) famines++; }
    }
    if (s.over) ended++;
    growth += people(s) - data.rules.startPopulation.value;
  }
  console.log(`Sensible player, 70 turns, 30 seeds: ${(growth / 30).toFixed(1)} more people on average, ${(walkouts / 30).toFixed(1)} walk-outs and ${(famines / 30).toFixed(1)} famines per run`);
  assert.equal(ended, 0, 'a sensible player should not lose the band');
  assert.ok(growth / 30 > 8, `average growth ${growth / 30}`);
  assert.ok(walkouts / 30 > 0.5, 'some people should walk out in a typical run');
  assert.ok(famines / 30 > 0.1, 'there should be a famine now and then');
});

test('a save from the previous build is brought up to date and keeps playing', () => {
  const s = fresh('old');
  step(s, 5);
  const old = JSON.parse(JSON.stringify(s));
  for (const k of ['kids', 'cohorts', 'clock', 'timeline']) delete old[k];
  old.v = 2; old.rules.growthRate = 0.06; old.rules.growthReserve = 2; delete old.rules.birthRate;
  const moved = migrate(old, data);
  assert.equal(moved.v, 3);
  assert.ok(isValidSave(moved));
  assert.equal(moved.kids, 0);
  assert.deepEqual(moved.clock, { year: 2, step: 1 });
  assert.deepEqual(moved.rules, ruleValues(data.rules), 'unchanged rules take the new defaults');
  while (moved.timeline.length < 6) { if (moved.dilemma) game.choose(moved, data, 'A'); else step(moved); }
  assert.ok(moved.timeline.length === 6 && moved.turn > s.turn);
  const edited = JSON.parse(JSON.stringify(old)); edited.v = 2; edited.rulesModified = true; edited.rules.spoilage = 0.2;
  const kept = migrate(edited, data);
  assert.equal(kept.rules.spoilage, 0.2, 'a rule the player changed is kept');
  assert.ok('birthRate' in kept.rules && !('growthRate' in kept.rules));
});

test('status and timeline in the console show the population and the date', async () => {
  const { createCommands } = await import('../js/commands.js');
  let state = fresh('cmd'); const host = { getState: () => state, changed() {}, clear() {}, setTheme() {}, setSpeed() {}, save: () => true, load: () => null, reset() {}, shareUrl: () => '' };
  const cmds = createCommands({ data, host });
  const text = (c) => cmds.run(c).map((l) => l.text).join('\n');
  assert.match(text('status'), /Spring, year 1/);
  assert.match(text('status'), /adults, 0 children/);
  assert.match(text('timeline'), /Nothing has happened yet/);
  step(state, 3);
  const t = text('timeline');
  assert.match(t, /turn\s+1\s+Spring, year 1/);
  assert.match(t, /Summer, year 1/);
  assert.equal(cmds.complete('time').value, 'timeline ');
  assert.match(text('map'), /Room for \d+ people/);
});
