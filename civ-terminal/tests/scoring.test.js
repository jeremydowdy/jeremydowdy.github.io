import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../js/game.js';
import { score } from '../js/scoring.js';
import { isValidSave, validateName } from '../js/state.js';
import { capacity } from '../js/economy.js';
import { loadData, play } from './helpers.js';

const data = loadData();
const run = async (seed, pick, turns = 60, setup = () => {}) => {
  const s = game.newGame('Run', seed, data);
  setup(s);
  await play(game, s, data, turns, pick, (st) => {
    if (st.turn % 5 === 0) { game.build(st, data, 'hearth'); game.build(st, data, 'shelter'); }
  });
  return s;
};

test('the same seed and the same choices give exactly the same run and score', async () => {
  const a = await run('replay-1', () => 'A'), b = await run('replay-1', () => 'A');
  assert.deepEqual(a, b);
  assert.equal(score(a), score(b));
});

test('a different seed changes the run', async () => {
  const a = await run('replay-1', () => 'A'), b = await run('replay-2', () => 'A');
  assert.notEqual(JSON.stringify(a), JSON.stringify(b));
});

test('different choices give different outcomes', async () => {
  const a = await run('choices', () => 'A'), b = await run('choices', () => 'B');
  assert.notEqual(score(a), score(b));
  assert.notDeepEqual(a.flags, b.flags);
});

test('a run can be saved mid-game and continued to the same result', async () => {
  const full = await run('save', () => 'A', 50);
  const half = await run('save', () => 'A', 25);
  const restored = JSON.parse(JSON.stringify(half));
  assert.ok(isValidSave(restored));
  await play(game, restored, data, 50, () => 'A', (st) => {
    if (st.turn % 5 === 0) { game.build(st, data, 'hearth'); game.build(st, data, 'shelter'); }
  });
  assert.equal(score(restored), score(full));
});

// Report only. With a single tit-for-tat rival, always disarming is expected to
// win on every seed; "no single strategy wins every time" needs the other
// rival strategies in play, which comes after the vertical slice.
test('report: always disarm vs always build, by seed', async () => {
  const seeds = ['s1', 's2', 's3', 's4', 's5', 's6'];
  const rows = [];
  for (const seed of seeds) {
    const disarm = score(await run(seed, (c) => (c.type === 'armsRace' ? 'A' : 'A')));
    const arm = score(await run(seed, (c) => (c.type === 'armsRace' ? 'B' : 'A')));
    rows.push({ seed, disarm, arm });
  }
  console.log('Border strategy by seed (score after 60 turns):\n' + rows.map((r) => `  ${r.seed}: always disarm ${r.disarm}, always build ${r.arm}`).join('\n'));
  assert.ok(rows.every((r) => Number.isFinite(r.disarm) && Number.isFinite(r.arm)));
});

test('the economy: people need food and shelter', () => {
  const starving = game.newGame('E', 'eco', data);
  starving.food = 0; starving.rules.foragePerPerson = 0;
  const before = starving.pop;
  game.advance(starving, data, 1);
  assert.ok(starving.pop < before);
  assert.ok(starving.history.length >= 1);

  const crowded = game.newGame('E', 'eco', data);
  crowded.food = 500;
  game.advance(crowded, data, 5);
  assert.ok(crowded.pop <= capacity(crowded, data));
});

test('building spends resources, and refuses when you cannot afford it', () => {
  const s = game.newGame('B', 'build', data);
  s.food = 100; s.energy = 100;
  assert.ok(game.build(s, data, 'shelter').ok);
  assert.equal(s.structures.shelter, 1);
  assert.equal(s.food, 92); assert.equal(s.energy, 94);
  s.energy = 0;
  assert.equal(game.build(s, data, 'hearth').ok, false);
  assert.equal(game.build(s, data, 'factory').ok, false);
});

test('changing a rule visibly changes the civilization, and marks the run', async () => {
  const normal = await run('rules', () => 'A', 40);
  const rich = await run('rules', () => 'A', 40, (s) => game.setRule(s, data, 'foragePerPerson', 2.4));
  assert.ok(rich.rulesModified && !normal.rulesModified);
  assert.ok(rich.pop > normal.pop, `expected more people with richer foraging: ${rich.pop} vs ${normal.pop}`);
  assert.equal(game.setRule(normal, data, 'nope', 1).ok, false);
  assert.equal(game.setRule(normal, data, 'spoilage', 'abc').ok, false);
});

test('a pledge to disarm is accepted at normal trust and broken pledges cost extra trust', () => {
  const s = game.newGame('P', 'pledge', data);
  assert.ok(game.propose(s, data, 'disarmament').accepted);
  assert.equal(game.propose(s, data, 'fishery').ok, false);
  let guard = 0;
  while (!(s.dilemma && s.dilemma.type === 'armsRace') && guard++ < 50) {
    if (s.dilemma) game.choose(s, data, 'A'); else game.advance(s, data, 1);
  }
  assert.equal(s.dilemma.type, 'armsRace');
  game.choose(s, data, 'B');
  assert.equal(s.rivals[0].trust, 50 - s.rules.trustLoss - s.rules.treatyBreakPenalty);
  assert.equal(s.treaty, null);
});

test('reaching the knowledge threshold ends the slice once, with a score', async () => {
  const s = game.newGame('K', 'know', data);
  s.knowledge = 39.9; s.structures.hearth = 3;
  const out = game.advance(s, data, 2);
  assert.ok(s.flags.eraReady);
  assert.equal(out.lines.filter((l) => l.kind === 'era').length, 1);
});

test('names: 1-24 letters, numbers, spaces and hyphens', () => {
  assert.ok(validateName('New Ur-2').ok);
  assert.equal(validateName('  Spaced   Out ').name, 'Spaced Out');
  assert.equal(validateName('').ok, false);
  assert.equal(validateName('x'.repeat(25)).ok, false);
  assert.equal(validateName('<b>hi</b>').ok, false);
  assert.equal(validateName('Zoë').ok, false);
});
