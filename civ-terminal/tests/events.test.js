import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../js/game.js';
import { outcomeWeights, rollOutcome } from '../js/events.js';
import { loadData } from './helpers.js';

const data = loadData();
const fresh = (seed = 'ev', d = data) => game.newGame('Ev', seed, d);
const outcomes = data.events.invite.outcomes;
const weightOf = (s, id) => outcomeWeights(s, outcomes)[outcomes.findIndex((o) => o.id === id)];
const only = (outcome) => { const d = structuredClone(data); d.events.invite.outcomes = [outcome]; return d; };
const ready = (s) => { s.turn = s.cooldowns.invite; s.food = 100; return s; };

test('trust changes the odds: more trust, more sharing and fewer attacks', () => {
  const s = fresh();
  s.knowledge = 20;
  const at = (trust, id) => { s.rivals[0].trust = trust; return weightOf(s, id); };
  assert.ok(at(100, 'share') > at(50, 'share') && at(50, 'share') > at(0, 'share'));
  assert.ok(at(0, 'attack') > at(50, 'attack') && at(50, 'attack') > at(100, 'attack'));
  assert.equal(at(100, 'attack'), 0, 'a rival that trusts you completely never attacks');
  assert.ok(at(0, 'attack') > at(0, 'share'), 'with no trust, an attack is likelier than a gift of knowledge');
});

test('being well armed makes an attack less likely', () => {
  const s = fresh(); s.rivals[0].trust = 20;
  const base = weightOf(s, 'attack');
  s.arms = 3;
  assert.ok(weightOf(s, 'attack') < base);
});

test('the dice follow the weights: over many rolls each outcome comes up about as often as it should', () => {
  const s = fresh('dice'); s.knowledge = 20; s.rivals[0].trust = 50;
  const w = outcomeWeights(s, outcomes), total = w.reduce((a, b) => a + b, 0), n = 8000, got = Object.fromEntries(outcomes.map((o) => [o.id, 0]));
  for (let i = 0; i < n; i++) got[rollOutcome(s, outcomes).id]++;
  outcomes.forEach((o, i) => assert.ok(Math.abs(got[o.id] / n - w[i] / total) < 0.025, `${o.id}: ${(got[o.id] / n).toFixed(3)} vs ${(w[i] / total).toFixed(3)}`));
});

test('an outcome with requirements only happens when they are met (the mushrooms need knowledge, and only come once)', () => {
  const s = fresh(); s.knowledge = 5;
  assert.equal(weightOf(s, 'mushrooms'), 0, 'too early');
  s.knowledge = 12;
  assert.ok(weightOf(s, 'mushrooms') > 0);
  s.flags.mushroomsKnown = true;
  assert.equal(weightOf(s, 'mushrooms'), 0, 'already found');
  for (let i = 0; i < 400; i++) assert.notEqual(rollOutcome(s, outcomes).id, 'mushrooms');
});

test('inviting the rival: not ready at first, costs a gift, and then needs time before the next', () => {
  const s = fresh();
  assert.equal(game.inviteInfo(s, data).available, false);
  assert.match(game.invite(s, data).lines[0].text, /Ready in \d+ turns?/);
  ready(s);
  assert.equal(game.inviteInfo(s, data).available, true);
  const food = s.food, turn = s.turn;
  const res = game.invite(s, data);
  assert.ok(res.ok && /You invited the River Clan, with a gift of 6 food/.test(res.lines[0].text));
  assert.ok(s.food !== food, 'the gift was paid');
  assert.equal(s.cooldowns.invite, turn + data.events.invite.cooldown);
  assert.match(game.invite(s, data).lines[0].text, new RegExp(`Ready in ${data.events.invite.cooldown} turns`));
  assert.ok(s.history.some((h) => h.kind === 'event' && /invited/.test(h.text)));
  const poor = ready(fresh()); poor.food = 2;
  assert.match(game.invite(poor, data).lines[0].text, /Needs 6 food/);
  const busy = ready(fresh()); busy.dilemma = { type: 'choice', id: 'x', turn: 1 };
  assert.match(game.invite(busy, data).lines[0].text, /decision is waiting/);
});

test('a gift of knowledge: +4 knowledge and more trust', () => {
  const d = only(outcomes[0]);
  const s = ready(fresh('k', d)); const k = s.knowledge, t = s.rivals[0].trust;
  game.invite(s, d);
  assert.equal(s.knowledge, k + 4);
  assert.equal(s.rivals[0].trust, t + 8 - 0);
});

test('a raid takes food and lives, but hurts less when you are armed', () => {
  const raid = outcomes.find((o) => o.id === 'attack');
  const d = only({ ...raid, weight: 1 });
  const loss = (arms) => { const s = ready(fresh('raid', d)); s.arms = arms; s.food = 100; s.stability = 60; const pop = s.pop; game.invite(s, d); return { food: 94 - s.food, pop: pop - s.pop }; };
  const bare = loss(0), armed = loss(4);
  assert.equal(bare.food, 10); assert.equal(bare.pop, 2);
  assert.ok(armed.food < bare.food && armed.pop <= bare.pop, JSON.stringify([bare, armed]));
  assert.equal(armed.food, 4, 'the loss is cut to 40% at the most');
});

test('the mushrooms: an invitation can lead to a random, risky decision', () => {
  const mush = outcomes.find((o) => o.id === 'mushrooms');
  const d = only({ ...mush, weight: 1, requires: undefined });
  const s = ready(fresh('mush', d)); s.knowledge = 15;
  const out = game.invite(s, d);
  assert.ok(s.flags.mushroomsKnown);
  assert.equal(s.dilemma.type, 'event');
  assert.ok(out.lines.some((l) => /decision is waiting/.test(l.text)));
  const card = game.currentCard(s, d);
  assert.equal(card.type, 'event'); assert.equal(card.title, 'The mushrooms');
  assert.ok(card.options.A.upside && card.options.A.cost && card.options.B.label);
  assert.ok(!JSON.stringify(card).includes('weight'), 'the card does not give away the odds');
  const res = game.choose(s, d, 'A');
  assert.ok(res.ok); assert.equal(s.dilemma, null);
  assert.ok(s.history.some((h) => h.kind === 'event' && /Have one volunteer/.test(h.text)));
});

test('mushroom outcomes are random: over many tries, both good and deadly things happen, and a feast is riskier than one volunteer', () => {
  const tally = (key) => {
    const seen = { good: 0, bad: 0, deaths: 0 };
    for (let i = 0; i < 300; i++) {
      const s = fresh('m' + i); s.pop = 30; s.women = 15; s.knowledge = 10; s.dilemma = { type: 'event', id: 'mushrooms', turn: 1 };
      const pop = s.pop, k = s.knowledge;
      game.choose(s, data, key);
      if (s.knowledge > k) seen.good++; else seen.bad++;
      seen.deaths += pop - s.pop;
    }
    return seen;
  };
  const one = tally('A'), feast = tally('B');
  assert.ok(one.good > 80 && one.bad > 50, JSON.stringify(one));
  assert.ok(feast.good > 60 && feast.bad > 100, JSON.stringify(feast));
  assert.ok(feast.deaths > one.deaths * 2, `feast killed ${feast.deaths}, volunteers ${one.deaths}`);
});

test('learning which mushrooms are safe: each success makes the next try less deadly', () => {
  const s = fresh(); const card = data.events.mushrooms.options.A.outcomes;
  const w = () => outcomeWeights(s, card);
  const [v0, , p0] = w();
  s.flags.mushroomTests = 3;
  const [v3, , p3] = w();
  assert.ok(v3 > v0 && p3 < p0, `visions ${v0} -> ${v3}, poison ${p0} -> ${p3}`);
  const d = structuredClone(data); d.events.mushrooms.options.A.outcomes = [data.events.mushrooms.options.A.outcomes[0]];
  const t = fresh('mt', d); t.dilemma = { type: 'event', id: 'mushrooms', turn: 1 };
  game.choose(t, d, 'A');
  assert.equal(t.flags.mushroomTests, 1);
});

test('gathering mushrooms is an expedition that opens up after the River Clan shows you, and only one thing happens', () => {
  const s = fresh(); s.food = 50; s.knowledge = 20;
  const row = () => game.expeditionList(s, data).find((e) => e.id === 'gather-mushrooms');
  assert.equal(row().available, false);
  assert.match(row().blocked, /not found out/);
  s.flags.mushroomsKnown = true;
  assert.equal(row().available, true);
  const d = structuredClone(data);
  d.expeditions.find((e) => e.id === 'gather-mushrooms').finds = [
    { chance: 1, text: 'FIRST', effects: { knowledge: 1 } }, { chance: 1, text: 'SECOND', effects: { food: -1 } }];
  const t = fresh('gm', d); t.food = 50; t.flags.mushroomsKnown = true;
  assert.ok(game.explore(t, d, 'gather-mushrooms').ok);
  while (t.parties.length) game.advance(t, d, 1);
  const logged = t.history.filter((h) => h.kind === 'expedition').map((h) => h.text).join(' ');
  assert.ok(/FIRST/.test(logged) && !/SECOND/.test(logged), logged);
});

test('the river clan prompt shows up once when an invitation is ready, and again only after it is used', () => {
  const s = fresh('nudge');
  const nudges = () => game.advance(s, data, 1).lines.filter((l) => /Smoke rises/.test(l.text)).length;
  let total = 0;
  while (s.turn < 12) { if (s.dilemma) game.choose(s, data, 'A'); else total += nudges(); }
  assert.equal(total, 1, 'one nudge, not one per turn');
  game.invite(s, data);
  s.dilemma = null;
  let again = 0;
  while (s.turn < s.cooldowns.invite + 2) { if (s.dilemma) game.choose(s, data, 'A'); else again += nudges(); }
  assert.equal(again, 1);
});

test('the same seed and the same choices give the same gambles', () => {
  const play = () => {
    const s = fresh('same'); s.knowledge = 15;
    for (let i = 0; i < 40 && !s.over; i++) {
      if (s.dilemma) { game.choose(s, data, 'B'); continue; }
      s.food = Math.max(s.food, 50); game.invite(s, data); game.advance(s, data, 1);
    }
    return JSON.stringify(s);
  };
  assert.equal(play(), play());
});
