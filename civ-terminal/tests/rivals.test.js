import test from 'node:test';
import assert from 'node:assert/strict';
import { STRATEGIES, rivalMove, treatyAccepted, updateTrust } from '../js/rivals.js';
import { ruleValues } from '../js/state.js';
import { payoff } from '../js/gametheory/armsRace.js';
import { loadData } from './helpers.js';

const data = loadData();
const rounds = (moves) => moves.split('').map((you) => ({ you, them: 'C' }));

test('every strategy in rivals.json has code, and every active rival uses a known one', () => {
  for (const key of Object.keys(data.rivals.strategies)) assert.equal(typeof STRATEGIES[key], 'function', key);
  for (const r of data.rivals.active) assert.ok(data.rivals.strategies[r.strategy], r.strategy);
  assert.equal(Object.keys(data.rivals.strategies).length, 4);
});

test('always-defect builds no matter what', () => {
  assert.equal(STRATEGIES.alwaysDefect(rounds('')), 'D');
  assert.equal(STRATEGIES.alwaysDefect(rounds('CCCC')), 'D');
});

test('tit-for-tat disarms first, then copies your last move', () => {
  assert.equal(STRATEGIES.titForTat(rounds(''), { firstMove: 'C' }), 'C');
  assert.equal(STRATEGIES.titForTat(rounds('CD')), 'D');
  assert.equal(STRATEGIES.titForTat(rounds('DC')), 'C');
});

test('grudger never forgives a single betrayal', () => {
  assert.equal(STRATEGIES.grudger(rounds('CCC')), 'C');
  assert.equal(STRATEGIES.grudger(rounds('CDCCCCCC')), 'D');
});

test('forgiver gives a second chance, but not a third', () => {
  assert.equal(STRATEGIES.forgiver(rounds('CD'), { tolerance: 2 }), 'C');
  assert.equal(STRATEGIES.forgiver(rounds('CDD'), { tolerance: 2 }), 'D');
  assert.equal(STRATEGIES.forgiver(rounds('DDC'), { tolerance: 2 }), 'C');
});

test('trust rises when you disarm, falls when you build, and stays within 0-100', () => {
  const rules = ruleValues(data.rules);
  const rival = { trust: 50, rounds: [] };
  assert.equal(updateTrust(rival, 'C', rules), 50 + rules.trustGain);
  assert.equal(updateTrust(rival, 'D', rules), 50 + rules.trustGain - rules.trustLoss);
  const before = rival.trust;
  updateTrust(rival, 'D', rules, { brokeTreaty: true });
  assert.equal(rival.trust, Math.max(0, before - rules.trustLoss - rules.treatyBreakPenalty));
  for (let i = 0; i < 20; i++) updateTrust(rival, 'D', rules);
  assert.equal(rival.trust, 0);
  for (let i = 0; i < 40; i++) updateTrust(rival, 'C', rules);
  assert.equal(rival.trust, 100);
});

test('a pledge wipes the slate for tit-for-tat, but a betrayed grudger refuses it', () => {
  const tft = { strategy: 'titForTat', trust: 50, rounds: rounds('CD') };
  assert.equal(rivalMove(tft, data), 'D');
  assert.equal(rivalMove(tft, data, { treaty: true }), 'C');
  const grudger = { strategy: 'grudger', trust: 90, rounds: rounds('D') };
  assert.equal(treatyAccepted(grudger, data), false);
  assert.equal(treatyAccepted({ strategy: 'titForTat', trust: 10, rounds: [] }, data), false);
  assert.equal(treatyAccepted({ strategy: 'titForTat', trust: 50, rounds: [] }, data), true);
});

test('no rival strategy beats every kind of player (round robin, 20 rounds)', () => {
  const players = { alwaysDefect: STRATEGIES.alwaysDefect, titForTat: STRATEGIES.titForTat, grudger: STRATEGIES.grudger, forgiver: STRATEGIES.forgiver };
  const total = (a, b) => {
    const seenByA = [], seenByB = []; let sa = 0;
    for (let i = 0; i < 20; i++) {
      const ma = a(seenByA, { firstMove: 'C', tolerance: 2 }), mb = b(seenByB, { firstMove: 'C', tolerance: 2 });
      seenByA.push({ you: mb, them: ma }); seenByB.push({ you: ma, them: mb });
      sa += payoff(ma, mb)[0];
    }
    return sa;
  };
  const table = {};
  for (const [an, a] of Object.entries(players)) { table[an] = {}; for (const [bn, b] of Object.entries(players)) table[an][bn] = total(a, b); }
  // Tit-for-tat does well against cooperators and badly against always-defect.
  assert.ok(table.titForTat.grudger > table.titForTat.alwaysDefect);
  assert.ok(table.titForTat.alwaysDefect < table.alwaysDefect.alwaysDefect + 1);
  // Always-defect wins its pairings but scores worse against itself than cooperators do with each other.
  assert.ok(table.alwaysDefect.alwaysDefect < table.titForTat.titForTat);
  for (const name of Object.keys(players)) {
    const beatsAll = Object.keys(players).every((other) => table[name][other] >= Math.max(...Object.keys(players).map((p) => table[p][other])));
    assert.ok(!beatsAll, `${name} should not be best against every opponent`);
  }
});
