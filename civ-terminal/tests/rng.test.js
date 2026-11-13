import test from 'node:test';
import assert from 'node:assert/strict';
import { hashSeed, nextRandom, makeStream, isValidSeed } from '../js/rng.js';

test('same seed gives the same sequence', () => {
  const a = makeStream('abc'), b = makeStream('abc');
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test('different seeds give different sequences', () => {
  const a = makeStream('abc'), b = makeStream('abd');
  assert.notDeepEqual(Array.from({ length: 5 }, a), Array.from({ length: 5 }, b));
});

test('values stay in [0, 1) and are spread out', () => {
  const r = makeStream('spread');
  let sum = 0;
  for (let i = 0; i < 10000; i++) { const v = r(); assert.ok(v >= 0 && v < 1); sum += v; }
  assert.ok(Math.abs(sum / 10000 - 0.5) < 0.02);
});

test('the stream position lives in the holder, so it survives a save', () => {
  const s = { rng: hashSeed('x') };
  nextRandom(s); nextRandom(s);
  const copy = JSON.parse(JSON.stringify(s));
  assert.equal(nextRandom(s), nextRandom(copy));
});

test('seed validation', () => {
  assert.ok(isValidSeed('k3x9-a'));
  assert.ok(!isValidSeed(''));
  assert.ok(!isValidSeed('<script>'));
});
