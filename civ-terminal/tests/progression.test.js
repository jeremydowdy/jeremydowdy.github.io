import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../js/game.js';
import { isValidSave } from '../js/state.js';
import { forecast } from '../js/economy.js';
import { loadData } from './helpers.js';

const data = loadData();
const fresh = (seed = 'prog') => game.newGame('Prog', seed, data);
// Rich enough that cost is never the thing under test.
const rich = (s) => { s.food = 200; s.energy = 200; return s; };

test('at the start only the campfire can be built; the rest are locked with a reason', () => {
  const s = fresh();
  const list = game.structureList(s, data);
  assert.deepEqual(list.filter((x) => x.unlocked).map((x) => x.id), ['campfire']);
  const shelter = list.find((x) => x.id === 'shelter');
  assert.equal(shelter.unlocked, false);
  assert.match(shelter.lockedReason, /15 knowledge/);
  rich(s);
  const res = game.build(s, data, 'shelter');
  assert.equal(res.ok, false);
  assert.match(res.lines[0].text, /isn't possible yet/);
  assert.equal(s.structures.shelter, undefined);
  assert.deepEqual(game.availableStructures(s, data).map((x) => x.id), ['campfire']);
});

test('reaching 15 knowledge unlocks shelters and drying racks, once, with a message', () => {
  const s = rich(fresh());
  s.knowledge = 15.5;
  const out = game.advance(s, data, 1);
  assert.ok(s.discovered.includes('crafts'));
  assert.equal(out.lines.filter((l) => l.kind === 'discovery' && /Hide and pole work/.test(l.text)).length, 1);
  assert.deepEqual(game.availableStructures(s, data).map((x) => x.id).sort(), ['campfire', 'drying-rack', 'shelter']);
  assert.ok(game.build(s, data, 'shelter').ok);
  game.advance(s, data, 1);
  assert.equal(s.history.filter((h) => h.kind === 'discovery' && /Hide and pole/.test(h.text)).length, 1);
});

test('cooking at 8 knowledge speeds up learning and makes fires give food', () => {
  const oneTurn = (cooked) => {
    const s = rich(fresh('cook'));
    s.rules.weatherSwing = 0;                         // no weather noise in this comparison
    s.structures.campfire = 3;
    if (cooked) { s.knowledge = 9; game.advance(s, data, 1); }   // makes the discovery
    s.knowledge = 5; s.food = 200; s.energy = 200; s.pop = 12; s.stability = 60;
    const before = { k: s.knowledge, f: s.food };
    game.advance(s, data, 1);
    return { gain: s.knowledge - before.k, food: s.food - before.f, s };
  };
  const without = oneTurn(false), withCooking = oneTurn(true);
  assert.ok(withCooking.s.discovered.includes('cooking'));
  assert.ok(!without.s.discovered.includes('cooking'));
  assert.equal(withCooking.s.mods.knowledgeMult, 1.3);
  assert.equal(without.s.mods.knowledgeMult, 1);
  assert.ok(withCooking.gain > without.gain * 1.25, `${withCooking.gain} vs ${without.gain}`);
  assert.ok(withCooking.food > without.food + 1.4, `fires should add food: ${withCooking.food} vs ${without.food}`);
});

test('a discovery is made only once, even if knowledge dips and recovers', () => {
  const s = fresh();
  s.knowledge = 9; game.advance(s, data, 1);
  s.knowledge = 2; game.advance(s, data, 1);
  s.knowledge = 9; game.advance(s, data, 1);
  assert.equal(s.discovered.filter((d) => d === 'cooking').length, 1);
  assert.equal(s.mods.knowledgeMult, 1.3);
});

test('each new campfire costs more wood than the last, and building takes it out of your energy', () => {
  const s = rich(fresh());
  const costs = [];
  for (let i = 0; i < 4; i++) {
    const before = s.energy;
    const cost = game.structureList(s, data).find((x) => x.id === 'campfire').cost.energy;
    assert.ok(game.build(s, data, 'campfire').ok);
    assert.equal(before - s.energy, cost);
    costs.push(cost);
  }
  assert.deepEqual(costs, [6, 8, 9, 12]);
  assert.ok(costs.every((c, i) => i === 0 || c > costs[i - 1]));
});

test('fires spread knowledge: more fires, faster learning', () => {
  const run = (fires) => { const s = rich(fresh('fires')); s.structures.campfire = fires; game.advance(s, data, 8); return s.knowledge; };
  assert.ok(run(3) > run(1) && run(1) > run(0));
});

test('next goal points at the next discovery, then the end of the era', () => {
  const s = fresh();
  assert.deepEqual(game.nextGoal(s, data), { at: 8, label: 'Cooking', kind: 'discovery' });
  s.discovered.push('cooking');
  assert.equal(game.nextGoal(s, data).at, 15);
  s.discovered.push('crafts');
  assert.deepEqual(game.nextGoal(s, data), { at: 60, label: 'end of the Stone Age', kind: 'era' });
});

test('an expedition costs food and people now, and comes home with knowledge', () => {
  const s = fresh('trip');
  const ex = data.expeditions[0];
  const { pop, food } = s;
  const res = game.explore(s, data, ex.id);
  assert.ok(res.ok, JSON.stringify(res));
  assert.equal(s.food, food - ex.cost.food);
  assert.equal(s.pop, pop - ex.people);
  assert.equal(s.parties.length, 1);
  assert.equal(game.explore(s, data, ex.id).ok, false, 'only one party at a time');
  assert.match(game.explore(s, data, ex.id).lines[0].text, /already out/);
  const k0 = s.knowledge;
  let turnsAway = 0;
  while (s.parties.length) { game.advance(s, data, 1); turnsAway++; if (s.dilemma) game.choose(s, data, 'A'); }
  assert.equal(turnsAway, ex.turns);
  assert.ok(s.knowledge >= k0 + ex.reward.knowledge * 0.9, `knowledge ${k0} -> ${s.knowledge}`);
  assert.ok(s.history.some((h) => h.kind === 'expedition' && /party is home/.test(h.text)));
});

test('expedition risk and finds follow the data, and the seed decides the roll', () => {
  const risky = structuredClone(data);
  risky.expeditions[0].risk = 1; risky.expeditions[0].finds = [];
  const s = game.newGame('Risk', 'risk', risky);
  game.explore(s, risky, risky.expeditions[0].id);
  const people = risky.expeditions[0].people;
  while (s.parties.length) game.advance(s, risky, 1);
  assert.ok(s.history.some((h) => /did not come back/.test(h.text)));
  assert.ok(s.pop >= 0);

  const safe = structuredClone(data);
  safe.expeditions[0].risk = 0; safe.expeditions[0].finds = [{ chance: 1, text: 'FOUND', effects: { food: 5 } }];
  const t = game.newGame('Safe', 'safe', safe);
  game.explore(t, safe, safe.expeditions[0].id);
  while (t.parties.length) game.advance(t, safe, 1);
  assert.ok(t.history.some((h) => /FOUND/.test(h.text)));
  assert.ok(!t.history.some((h) => /did not come back/.test(h.text)));

  const a = game.newGame('Seed', 'same', data), b = game.newGame('Seed', 'same', data);
  for (const g of [a, b]) { game.explore(g, data, data.expeditions[0].id); while (g.parties.length) game.advance(g, data, 1); }
  assert.deepEqual(a, b);
});

test('the farther expedition is locked until 6 knowledge, and small groups cannot send anyone', () => {
  const s = fresh();
  const far = game.expeditionList(s, data).find((e) => e.id === 'follow-river');
  assert.equal(far.available, false);
  assert.match(far.blocked, /6 knowledge/);
  s.knowledge = 6;
  assert.equal(game.expeditionList(s, data).find((e) => e.id === 'follow-river').available, true);
  s.pop = 5;
  assert.match(game.expeditionList(s, data)[0].blocked, /Needs 6 people/);
  assert.equal(game.explore(s, data, 'nope').ok, false);
});

test('a save in the middle of an expedition resumes correctly', () => {
  const s = fresh('resume');
  game.explore(s, data, 'scout-hills');
  game.advance(s, data, 1);
  const copy = JSON.parse(JSON.stringify(s));
  assert.ok(isValidSave(copy));
  for (const g of [s, copy]) while (g.parties.length) game.advance(g, data, 1);
  assert.deepEqual(s, copy);
});

test('while a party is out the group is not declared dead', () => {
  const s = fresh();
  s.parties.push({ id: 'scout-hills', start: 1, due: 5, people: 2 });
  s.pop = 0;
  game.advance(s, data, 1);
  assert.equal(s.over, null);
});

test('a save from the first build (version 1) is refused instead of loaded broken', () => {
  const old = JSON.parse(JSON.stringify(fresh()));
  old.v = 1;
  assert.equal(isValidSave(old), false);
});

test('a full early-game play-through reaches cooking, crafts and the end of the slice', () => {
  const s = fresh('early');
  const log = [];
  let guard = 0;
  while (!s.flags.eraReady && !s.over && guard++ < 400) {
    if (s.dilemma) { game.choose(s, data, 'A'); continue; }
    if (!s.parties.length) game.explore(s, data, 'follow-river').ok || game.explore(s, data, 'scout-hills');
    game.build(s, data, 'campfire');
    for (const id of ['shelter', 'drying-rack']) game.build(s, data, id);
    const out = game.advance(s, data, 1);
    for (const l of out.lines) if (l.kind === 'discovery') log.push(`turn ${s.turn}: ${l.text.slice(0, 40)}`);
  }
  console.log('Early game timeline:\n  ' + log.join('\n  ') + `\n  slice ends at turn ${s.turn}, pop ${s.pop}, knowledge ${s.knowledge}`);
  assert.ok(s.flags.eraReady, `never reached the end of the slice (turn ${s.turn}, knowledge ${s.knowledge}, over: ${s.over})`);
  assert.ok(s.discovered.includes('cooking') && s.discovered.includes('crafts'));
  assert.ok(s.turn < 90, `took ${s.turn} turns`);
});

test('the per-turn forecast matches what actually happens when the weather is average', () => {
  const s = rich(fresh('fc'));
  s.rules.weatherSwing = 0; s.rules.spoilage = 0; s.structures.campfire = 2; s.food = 60; s.knowledge = 5; s.energy = 20;
  s.pop = 16;                                       // at the shelter cap, so nobody is born mid-turn
  const f = forecast(s, data);
  const before = { food: s.food, energy: s.energy, knowledge: s.knowledge };
  game.advance(s, data, 1);
  assert.ok(Math.abs(s.food - before.food - f.food) < 0.2, `food ${s.food - before.food} vs ${f.food}`);
  assert.ok(Math.abs(s.energy - before.energy - f.energy) < 0.2, `energy ${s.energy - before.energy} vs ${f.energy}`);
  assert.ok(Math.abs(s.knowledge - before.knowledge - f.knowledge) < 0.2, `knowledge ${s.knowledge - before.knowledge} vs ${f.knowledge}`);
});

test('after a few turns the band is nudged to send an expedition, once', () => {
  const s = fresh('hint');
  const lines = [];
  while (s.turn < 8 && !s.dilemma) lines.push(...game.advance(s, data, 1).lines);
  const hints = lines.filter((l) => /beyond the hills/.test(l.text));
  assert.equal(hints.length, 1);
  const t = fresh('hint2');
  game.explore(t, data, 'scout-hills');
  const more = [];
  while (t.turn < 8 && !t.dilemma) more.push(...game.advance(t, data, 1).lines);
  assert.equal(more.filter((l) => /beyond the hills/.test(l.text)).length, 0);
});
