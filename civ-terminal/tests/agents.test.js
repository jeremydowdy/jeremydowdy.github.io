import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim, syncCount, step, MAX_AGENTS } from '../js/agents.js';

const sites = [{ kind: 'camp', x: 0.5, y: 0.5 }, { kind: 'water', x: 0.45, y: 0.5 }, { kind: 'food', x: 0.8, y: 0.2 }, { kind: 'food', x: 0.2, y: 0.8 }];

test('the number of settlers follows the population, up to the cap', () => {
  const sim = createSim('a');
  syncCount(sim, 12, sites); assert.equal(sim.agents.length, 12);
  syncCount(sim, 5, sites); assert.equal(sim.agents.length, 5);
  syncCount(sim, 9999, sites); assert.equal(sim.agents.length, MAX_AGENTS);
});

test('settlers stay on the map, keep moving, and head for their goals', () => {
  const sim = createSim('b');
  syncCount(sim, 60, sites);
  const start = sim.agents.map((a) => [a.x, a.y]);
  for (let i = 0; i < 1200; i++) step(sim, 1 / 60, sites);
  let moved = 0;
  sim.agents.forEach((a, i) => {
    assert.ok(a.x >= 0 && a.x <= 1 && a.y >= 0 && a.y <= 1);
    assert.ok(Number.isFinite(a.vx) && Number.isFinite(a.vy));
    if (Math.hypot(a.x - start[i][0], a.y - start[i][1]) > 0.02) moved++;
  });
  assert.ok(moved > 30, `only ${moved} of 60 moved`);
});

test('the same seed gives the same movement', () => {
  const run = () => { const s = createSim('c'); syncCount(s, 20, sites); for (let i = 0; i < 200; i++) step(s, 1 / 60, sites); return s.agents.map((a) => a.x); };
  assert.deepEqual(run(), run());
});

test('500 settlers step fast enough for 60 fps', () => {
  const sim = createSim('d');
  syncCount(sim, 500, sites);
  const t0 = performance.now();
  for (let i = 0; i < 60; i++) step(sim, 1 / 60, sites);
  const perFrame = (performance.now() - t0) / 60;
  console.log(`500 settlers: ${perFrame.toFixed(2)} ms per step`);
  assert.ok(perFrame < 8, `${perFrame.toFixed(2)} ms per step`);
});
