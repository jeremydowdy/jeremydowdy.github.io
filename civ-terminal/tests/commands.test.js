import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommands, describeEffects } from '../js/commands.js';
import * as game from '../js/game.js';
import { loadData } from './helpers.js';

const data = loadData();
function setup() {
  let state = game.newGame('Cmd', 'cmd', data);
  const calls = [];
  const host = {
    getState: () => state, changed: (k) => calls.push(k), clear: () => calls.push('clear'),
    setTheme: (t) => calls.push('theme:' + t), setSpeed: (s) => calls.push('speed:' + s),
    save: () => true, load: () => null, reset: () => calls.push('reset'), shareUrl: (s) => `https://example.test/#seed=${s}`,
  };
  const cmds = createCommands({ data, host });
  const text = (line) => cmds.run(line).map((l) => l.text).join('\n');
  return { cmds, calls, text, state: () => state };
}

test('every command in the spec answers, and unknown ones say so', () => {
  const { text } = setup();
  assert.match(text('choose A'), /Nothing to decide/);
  for (const c of ['help', 'status', 'build', 'decide', 'rivals', 'history', 'reveal rules', 'map', 'seed', 'save', 'wait', 'wait 3']) {
    assert.ok(text(c).length > 0, c);
    assert.ok(!text(c).startsWith('Unknown'), c);
  }
  assert.match(text('frobnicate'), /Unknown command/);
  assert.match(text('wait -2'), /Usage/);
});

test('status shows the seven things the spec lists', () => {
  const { text } = setup();
  const out = text('status');
  for (const word of ['population', 'food', 'energy', 'knowledge', 'stability', 'Stone Age', 'turn 1']) assert.ok(out.includes(word), word);
});

test('decide shows both options, their costs and a payoff matrix for the border decision', () => {
  const { text, state } = setup();
  let guard = 0;
  while (!(state().dilemma && state().dilemma.type === 'armsRace') && guard++ < 40) text(state().dilemma ? 'choose A' : 'wait');
  const out = text('decide');
  for (const word of ['A) Disarm', 'B) Build arms', 'upside:', 'cost:', 'Payoff matrix', '3, 3', '0, 5', '5, 0', '1, 1', 'Why both sides often build', 'Tit-for-tat']) assert.ok(out.includes(word), word);
  assert.match(text('wait'), /decision is waiting/);
  assert.match(text('choose B'), /Security/);
  assert.match(text('rivals'), /you build/);
});

test('decide on a choice card shows now and later effects', () => {
  const { text } = setup();
  text('wait 10');
  const out = text('decide');
  assert.ok(out.includes('The shared store'));
  assert.ok(out.includes('later:  in about 8 turns'));
  assert.ok(out.includes('spoilage -50%'));
});

test('reset needs a second, explicit confirmation', () => {
  const { text, calls } = setup();
  text('reset confirm');
  assert.ok(!calls.includes('reset'));
  text('reset'); text('status'); text('reset confirm');
  assert.ok(!calls.includes('reset'));
  text('reset'); text('reset confirm');
  assert.ok(calls.includes('reset'));
});

test('tab completion', () => {
  const { cmds } = setup();
  assert.equal(cmds.complete('sta').value, 'status ');
  assert.equal(cmds.complete('build sh').value, 'build shelter ');
  assert.equal(cmds.complete('set th').value, 'set theme ');
  assert.equal(cmds.complete('set theme a').value, 'set theme amber ');
  assert.deepEqual(cmds.complete('s').options.sort(), ['save', 'seed', 'set', 'status']);
  assert.equal(cmds.complete('set rule forage').value, 'set rule foragePerPerson ');
  assert.equal(cmds.complete('zzz').value, 'zzz');
});

test('settings and rules commands', () => {
  const { text, calls, state } = setup();
  text('set theme amber'); text('set speed instant');
  assert.ok(calls.includes('theme:amber') && calls.includes('speed:instant'));
  assert.match(text('set theme purple'), /Usage/);
  assert.match(text('set rule spoilage 0.2'), /0.04 -> 0.2/);
  assert.equal(state().rules.spoilage, 0.2);
  assert.match(text('reveal rules'), /was 0.04/);
});

test('effects read as plain words', () => {
  assert.equal(describeEffects({ food: -6, mods: { foodPerTurn: 1.2, forageMult: -0.03 } }), 'food -6, +1.2 food per turn, foraging -3%');
  assert.equal(describeEffects({}), 'no immediate change');
});
