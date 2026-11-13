import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, hash2, MAP_W, MAP_H } from '../js/world.js';

test('the same seed makes the same world, a different seed a different one', () => {
  const a = createWorld('x'), b = createWorld('x'), c = createWorld('y');
  assert.deepEqual(a.sites, b.sites);
  assert.equal(a.riverU(0.3), b.riverU(0.3));
  assert.notDeepEqual(a.sites, c.sites);
});

test('across many seeds: the camp is on dry, low ground beside the river, and food and water are on the camp side', () => {
  for (let i = 0; i < 200; i++) {
    const w = createWorld('seed-' + i);
    const { camp, side, riverU, riverHalf } = w;
    assert.ok(camp.x > 0.1 && camp.x < 0.9, `camp x ${camp.x}`);
    const dist = Math.abs(camp.x - riverU(camp.y)) * MAP_W;
    assert.ok(dist > riverHalf(camp.y * MAP_H) + 12, `camp too close to the river: ${dist}px`);
    assert.ok(w.heightAt(camp.x, camp.y) < 0.35, `camp on a hill: ${w.heightAt(camp.x, camp.y)}`);
    const foods = w.sites.filter((s) => s.kind === 'food');
    assert.ok(foods.length >= 2, `only ${foods.length} food sites`);
    for (const s of w.sites) {
      assert.ok(s.x > 0 && s.x < 1 && s.y > 0 && s.y < 1);
      assert.equal(Math.sign(s.x - riverU(s.y)), side, `${s.kind} on the wrong side of the river`);
    }
  }
});

test('hash2 is repeatable and spread between 0 and 1', () => {
  assert.equal(hash2(3, 4, 5), hash2(3, 4, 5));
  let sum = 0;
  for (let i = 0; i < 5000; i++) { const v = hash2(i, i * 7, 1); assert.ok(v >= 0 && v < 1); sum += v; }
  assert.ok(Math.abs(sum / 5000 - 0.5) < 0.03);
});
