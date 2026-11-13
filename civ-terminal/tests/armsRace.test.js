import test from 'node:test';
import assert from 'node:assert/strict';
import * as arms from '../js/gametheory/armsRace.js';
import { newGame } from '../js/game.js';
import { loadData } from './helpers.js';

test('the payoffs form a prisoner\'s dilemma', () => {
  assert.ok(arms.isPrisonersDilemma());
});

test('building is the dominant move for each side', () => {
  assert.equal(arms.dominantMove(), 'D');
});

test('both-build is the only equilibrium, and it is worse for both than both-disarm', () => {
  assert.deepEqual(arms.nashEquilibria(), ['DD']);
  const [dd] = arms.payoff('D', 'D'), [cc] = arms.payoff('C', 'C');
  assert.ok(cc > dd);
});

test('each is safer if the rival disarms; a builder facing a non-builder dominates', () => {
  assert.ok(arms.payoff('C', 'C')[0] > arms.payoff('C', 'D')[0]);
  assert.ok(arms.payoff('D', 'C')[0] > arms.payoff('D', 'D')[0]);
  const [you, them] = arms.payoff('D', 'C');
  assert.ok(you > them);
});

test('what a round does to the civilization keeps the same ordering as the matrix', () => {
  const data = loadData();
  const worth = (you, them) => {
    const s = newGame('T', 'seed', data);
    const fx = arms.effects(you, them, s);
    return fx.stability + fx.food * 0.5;
  };
  const T = worth('D', 'C'), R = worth('C', 'C'), P = worth('D', 'D'), S = worth('C', 'D');
  assert.ok(T > R && R > P && P > S, `expected T>R>P>S, got ${T}, ${R}, ${P}, ${S}`);
  assert.ok(2 * R > T + S);
});

test('the explanation quotes the real matrix', () => {
  const text = arms.explain();
  for (const n of [arms.PAYOFF.T, arms.PAYOFF.R, arms.PAYOFF.P, arms.PAYOFF.S]) assert.ok(text.includes(String(n)));
});
