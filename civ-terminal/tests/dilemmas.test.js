import test from 'node:test';
import assert from 'node:assert/strict';
import { balanceReport, formatBalanceReport, validateDilemmas, dueDilemma } from '../js/dilemmas.js';
import * as game from '../js/game.js';
import { loadData } from './helpers.js';

const data = loadData();

test('dilemmas.json is well formed', () => {
  assert.deepEqual(validateDilemmas(data.dilemmas, data.eras), []);
});

test('balance report: every option has a real upside and a real cost, and the two sides are close', () => {
  const report = balanceReport(data.dilemmas);
  console.log(formatBalanceReport(report));
  for (const r of report) {
    for (const k of ['A', 'B']) {
      assert.ok(r[k].upside > 0, `${r.id} ${k} has no upside`);
      assert.ok(r[k].cost > 0, `${r.id} ${k} has no cost`);
      assert.ok(r[k].cost >= r[k].upside * 0.6 && r[k].cost <= r[k].upside * 1.6, `${r.id} ${k}: upside ${r[k].upside} vs cost ${r[k].cost}`);
    }
    assert.ok(r.gap <= 8, `${r.id}: options differ by ${r.gap} points`);
  }
});

test('a card comes up at its turn, stops the clock, and is not offered twice', () => {
  const s = game.newGame('Test', 'cards', data);
  const first = data.dilemmas[0];
  game.advance(s, data, first.minTurn + 5);
  assert.equal(s.dilemma.type, 'choice');
  assert.equal(s.dilemma.id, first.id);
  const turn = s.turn;
  const blocked = game.advance(s, data, 3);
  assert.equal(blocked.done, 0);
  assert.equal(s.turn, turn);
  assert.ok(game.choose(s, data, 'B').ok);
  assert.equal(s.dilemma, null);
  assert.ok(s.resolved.includes(first.id));
  assert.notEqual(dueDilemma(s, data)?.id, first.id);
});

test('choose rejects anything but A or B, and does nothing with no card waiting', () => {
  const s = game.newGame('Test', 'cards', data);
  assert.equal(game.choose(s, data, 'A').ok, false);
  game.advance(s, data, 10);
  assert.equal(game.choose(s, data, 'C').ok, false);
  assert.ok(s.dilemma);
});

test('delayed consequences arrive on the promised turn and are logged with their cause', () => {
  const s = game.newGame('Test', 'later', data);
  const card = data.dilemmas[0];
  game.advance(s, data, 20);
  assert.equal(s.dilemma.id, card.id);
  const chosenAt = s.turn;
  game.choose(s, data, 'A');
  const later = card.options.A.later[0];
  assert.equal(s.pending.length, 1);
  assert.equal(s.pending[0].due, chosenAt + later.after);
  while (s.turn <= chosenAt + later.after) {
    if (s.dilemma) game.choose(s, data, 'A'); else game.advance(s, data, 1);
  }
  assert.equal(s.pending.filter((p) => p.from.id === card.id).length, 0);
  const entry = s.history.find((h) => h.kind === 'consequence');
  assert.ok(entry && entry.turn === chosenAt + later.after);
  assert.ok(entry.text.includes(`From turn ${chosenAt}`));
});

test('an option can lock out a future card (fixture)', () => {
  const fixture = structuredClone(data);
  fixture.dilemmas = [
    { id: 'first', era: 'stone', minTurn: 2, title: 'First', text: 'x', options: {
      A: { label: 'a', upside: 'u', cost: 'c', now: {}, locks: ['second'] },
      B: { label: 'b', upside: 'u', cost: 'c', now: {} } } },
    { id: 'second', era: 'stone', minTurn: 3, title: 'Second', text: 'x', options: {
      A: { label: 'a', upside: 'u', cost: 'c', now: {} }, B: { label: 'b', upside: 'u', cost: 'c', now: {} } } },
  ];
  fixture.rivals = { ...fixture.rivals, active: [] };
  assert.deepEqual(validateDilemmas(fixture.dilemmas, fixture.eras), []);
  const locked = game.newGame('L', 'lock', fixture);
  game.advance(locked, fixture, 5); game.choose(locked, fixture, 'A'); game.advance(locked, fixture, 10);
  assert.equal(locked.dilemma, null);
  const open = game.newGame('L', 'lock', fixture);
  game.advance(open, fixture, 5); game.choose(open, fixture, 'B'); game.advance(open, fixture, 10);
  assert.equal(open.dilemma.id, 'second');
});
