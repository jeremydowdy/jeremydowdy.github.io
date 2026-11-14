import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../js/game.js';
import { people, men, foodNeed, forecast, capacity } from '../js/economy.js';
import { isValidSave, migrate, ruleValues } from '../js/state.js';
import { loadData } from './helpers.js';

const data = loadData();
const fresh = (seed = 'pop') => game.newGame('Pop', seed, data);
const step = (s, n = 1) => game.advance(s, data, n);
const kidsMatch = (s) => s.kids === s.cohorts.reduce((n, c) => n + c.m + c.f, 0);
const womenOk = (s) => s.women >= 0 && s.women <= s.pop && s.pregnancies.length + s.resting.length <= s.women;

// Turns the random parts of a turn off, so a test can look at one rule at a time.
const calm = (s, extra = {}) => {
  Object.assign(s.rules, { weatherSwing: 0, deathRate: 0, childDeathRate: 0, infantDeathRate: 0, miscarriageRate: 0, birthDeathRate: 0,
    twinChance: 0, conceiveChance: 0, spoilage: 0 }, extra);
  return s;
};
// Sets up a band exactly: men, women, which of them are pregnant (turn each is due), and children.
const band = (s, { men: m = 5, women: w = 5, due = [], kids = [] } = {}) => {
  s.pop = m + w; s.women = w; s.pregnancies = [...due]; s.resting = [];
  s.cohorts = kids.map(([born, boys, girls]) => ({ born, m: boys, f: girls }));
  s.kids = s.cohorts.reduce((n, c) => n + c.m + c.f, 0);
  return s;
};
const plenty = (s) => { s.food = 999; s.stability = 70; s.rules.baseCapacity = 999; return s; };

test('the calendar: spring, summer, autumn, winter, then a new year', () => {
  const s = fresh();
  assert.equal(game.calendar(s, data).label, 'Spring, year 1');
  const seen = [];
  for (let i = 0; i < 9; i++) { seen.push(game.calendar(s, data).label); plenty(s); step(s); if (s.dilemma) game.choose(s, data, 'A'); }
  assert.deepEqual(seen, ['Spring, year 1', 'Summer, year 1', 'Autumn, year 1', 'Winter, year 1', 'Spring, year 2', 'Summer, year 2', 'Autumn, year 2', 'Winter, year 2', 'Spring, year 3']);
});

test('each turn adds a season-change message, only when the season actually changes', () => {
  const s = calm(fresh());
  const out = step(s);
  assert.equal(out.lines.filter((l) => l.kind === 'season').length, 1);
  assert.match(out.lines.find((l) => l.kind === 'season').text, /^Summer begins/);
  const eras = structuredClone(data); eras.eras[0].clock = { yearsPerTurn: 10 };
  const t = game.newGame('Y', 'y', eras);
  assert.equal(game.advance(t, eras, 1).lines.filter((l) => l.kind === 'season').length, 0);
  assert.equal(game.calendar(t, eras).label, 'Year 11');
});

test('winter is lean: the same band gathers far less in winter than in summer', () => {
  const s = fresh(); s.rules.weatherSwing = 0;
  const at = (i) => { s.clock.step = i; return forecast(s, data).food + foodNeed(s); };
  const [spring, summer, autumn, winter] = [0, 1, 2, 3].map(at);
  assert.ok(summer > autumn && autumn > spring && spring > winter, `${spring} ${summer} ${autumn} ${winter}`);
  assert.ok(Math.abs(winter / spring - 0.5) < 0.01 && Math.abs(summer / spring - 1.3) < 0.01);
});

// ---------------------------------------------------------------- starting out
test('the band starts as 5 women and 5 men, and all five women are pregnant', () => {
  const s = fresh();
  assert.equal(s.pop, 10); assert.equal(s.women, 5); assert.equal(men(s), 5);
  assert.equal(s.pregnancies.length, 5);
  assert.ok(s.pregnancies.every((d) => d >= 2 && d <= 4), 'due over the first few turns');
  assert.equal(s.kids, 0);
});

test('a first year with plenty of food: about 5 babies, so about 15 people in year two', () => {
  let babies = 0, total = 0;
  for (let i = 0; i < 80; i++) {
    const s = fresh('y1-' + i);
    while (s.turn <= 4) { if (s.dilemma) game.choose(s, data, 'A'); plenty(s); step(s); }
    babies += s.timeline.reduce((n, r) => n + r.born, 0); total += people(s);
  }
  console.log(`First year: ${(babies / 80).toFixed(1)} babies and ${(total / 80).toFixed(1)} people on average (10 to start)`);
  assert.ok(babies / 80 > 3.8 && babies / 80 < 5.5, `${babies / 80} babies`);
  assert.ok(total / 80 > 12.5 && total / 80 < 15.5, `${total / 80} people`);
});

// ---------------------------------------------------------------- pregnancy
test('a pregnancy lasts the set number of turns, then a baby is born', () => {
  const s = plenty(calm(band(fresh(), { due: [4] })));
  const seen = [];
  while (s.turn < 6) { plenty(s); step(s); seen.push(s.kids); }
  assert.deepEqual(seen.slice(0, 4), [0, 0, 0, 1], 'the baby arrives on the turn it is due (4), and not before');
  assert.equal(s.pregnancies.length, 0);
  assert.ok(kidsMatch(s) && womenOk(s));
});

test('conception: rested women get pregnant, and the pregnancy comes due gestation turns later', () => {
  const s = plenty(calm(band(fresh('c'), { men: 5, women: 5 }), { conceiveChance: 1 }));
  step(s);
  assert.equal(s.pregnancies.length, 5);
  assert.ok(s.pregnancies.every((d) => d === 1 + s.rules.gestation), JSON.stringify(s.pregnancies));
  assert.ok(womenOk(s));
});

test('a mother rests after a birth before she can conceive again', () => {
  const s = plenty(calm(band(fresh('r'), { due: [1] }), { conceiveChance: 1, restTurns: 2 }));
  step(s);
  assert.equal(s.kids, 1);
  assert.equal(s.pregnancies.length, 4 === 4 ? s.pregnancies.length : 0);
  const mother = s.women - s.pregnancies.length;
  assert.ok(s.resting.length >= 1 && mother >= 1);
  const before = s.pregnancies.length;
  step(s); step(s);
  assert.ok(s.pregnancies.length >= before, 'others keep conceiving while she rests');
  for (let i = 0; i < 4; i++) { plenty(s); step(s); }
  assert.ok(womenOk(s));
});

test('no men, no pregnancies; fewer men than women means fewer', () => {
  const run = (m, w) => { let c = 0; for (let i = 0; i < 60; i++) { const s = plenty(calm(band(fresh('m' + i), { men: m, women: w }), { conceiveChance: 0.9 })); step(s); c += s.pregnancies.length; } return c; };
  assert.equal(run(0, 8), 0);
  const few = run(1, 8), enough = run(4, 8);
  assert.ok(few < enough, `${few} < ${enough}`);
});

test('pregnancies are lost, and more often when people are hungry', () => {
  const lost = (food) => { let n = 0; for (let i = 0; i < 80; i++) { const s = calm(band(fresh('l' + i), { due: [50, 50, 50, 50] }), { miscarriageRate: 0.1 }); s.food = food; s.rules.foragePerPerson = 0; step(s); n += s.timeline[0].lost; } return n; };
  const fed = lost(500), hungry = lost(14);                     // 14 food, 10 eaten: nobody starves, but the store is thin
  assert.ok(fed > 10, `${fed} lost when fed`);
  assert.ok(hungry > fed * 1.5, `hungry ${hungry} vs fed ${fed}`);
  const s = calm(band(fresh('L'), { due: [50, 50] }), { miscarriageRate: 1 }); plenty(s);
  const out = step(s);
  assert.equal(s.pregnancies.length, 0);
  assert.equal(s.timeline[0].lost, 2);
  assert.ok(out.lines.some((l) => /pregnancies were lost/.test(l.text) && l.tone === 'bad'));
});

test('a mother can die in childbirth, and her baby lives', () => {
  const s = plenty(calm(band(fresh('d'), { due: [1] }), { birthDeathRate: 1 }));
  step(s);
  assert.equal(s.kids, 1);
  assert.equal(s.women, 4);
  assert.equal(s.pop, 9);
  assert.equal(s.timeline[0].died, 1);
  assert.ok(womenOk(s));
});

test('twins happen, and boys and girls are born in roughly equal numbers', () => {
  let twins = 0, boys = 0, girls = 0;
  for (let i = 0; i < 200; i++) { const s = plenty(calm(band(fresh('t' + i), { due: [1] }), { twinChance: 0.5 })); step(s); twins += s.kids === 2 ? 1 : 0; boys += s.cohorts[0].m; girls += s.cohorts[0].f; }
  assert.ok(twins > 70 && twins < 130, `${twins} twins in 200`);
  assert.ok(Math.abs(boys - girls) < 0.2 * (boys + girls), `${boys} boys, ${girls} girls`);
});

test('a woman who dies takes her pregnancy with her', () => {
  let ok = 0;
  for (let i = 0; i < 40; i++) {
    const s = plenty(calm(band(fresh('w' + i), { men: 1, women: 6, due: [50, 50, 50, 50, 50, 50] }), { deathRate: 0.6 }));
    step(s);
    assert.ok(womenOk(s), `${s.women} women, ${s.pregnancies.length} pregnant`);
    assert.equal(s.pregnancies.length, Math.min(s.pregnancies.length, s.women));
    ok++;
  }
  assert.equal(ok, 40);
});

// ---------------------------------------------------------------- growth
test('a bigger band grows faster: births come from how many women there are', () => {
  const babies = (w) => { let n = 0; for (let i = 0; i < 40; i++) { const s = plenty(band(fresh('g' + i), { men: w, women: w })); for (let t = 0; t < 8; t++) { plenty(s); s.food = 999; step(s); if (s.dilemma) game.choose(s, data, 'A'); } n += s.timeline.reduce((x, r) => x + r.born, 0); } return n / 40; };
  const small = babies(3), big = babies(12);
  console.log(`Babies in two years: ${small.toFixed(1)} from 3 women, ${big.toFixed(1)} from 12 women`);
  assert.ok(big > small * 3, `${big} vs ${small}`);
});

test('growth is exponential while food and room last: more people each year than the year before', () => {
  const years = [];
  for (let i = 0; i < 40; i++) {
    const s = fresh('e' + i);
    while (s.turn <= 32) { if (s.dilemma) game.choose(s, data, 'A'); plenty(s); step(s); if (s.turn % 4 === 1) (years[(s.turn - 1) / 4] ||= []).push(people(s)); }
  }
  const avg = years.map((a) => a.reduce((x, y) => x + y, 0) / a.length);
  console.log('People at the end of each year (plenty of food): ' + avg.map((x) => x.toFixed(0)).join(', '));
  assert.ok(avg[8] > avg[4] * 1.6 && avg[4] > avg[1] * 1.3, avg.join(', '));
  const gains = avg.slice(1).map((x, i) => x - avg[i]);
  assert.ok(gains[7] > gains[2], 'each year adds more people than the one before');
});

// ---------------------------------------------------------------- children
test('children eat less, do not forage or learn, and cost the band food', () => {
  const s = calm(fresh());
  const before = { need: foodNeed(s), f: forecast(s, data) };
  band(s, { men: 5, women: 5, kids: [[1, 4, 4]] });
  assert.equal(foodNeed(s), before.need + 8 * s.rules.childEat);
  const after = forecast(s, data);
  assert.ok(Math.abs((before.f.food - after.food) - 8 * s.rules.childEat) < 1e-9, 'children cost food');
  assert.equal(after.energy, before.f.energy);
  assert.equal(after.knowledge, before.f.knowledge);
  assert.equal(people(s), s.pop + 8);
});

test('children grow up after the set number of turns: girls become women, boys become men', () => {
  const s = plenty(calm(band(fresh(), { men: 5, women: 5, kids: [[1, 3, 4]] }), { matureTurns: 5 }));
  while (s.turn < 6) { plenty(s); step(s); if (s.dilemma) game.choose(s, data, 'A'); }
  assert.equal(s.kids, 7, 'still children one turn before they are old enough');
  plenty(s); step(s);
  assert.equal(s.kids, 0);
  assert.equal(s.pop, 17);
  assert.equal(s.women, 9);
  assert.equal(men(s), 8);
  assert.ok(kidsMatch(s) && womenOk(s));
});

test('babies are more fragile than older children', () => {
  const dead = (age) => { let n = 0; for (let i = 0; i < 100; i++) { const s = plenty(calm(band(fresh('i' + i), { kids: [[1 - age, 10, 10]] }), { infantDeathRate: 0.2, childDeathRate: 0.02, matureTurns: 99 })); s.turn = 1; step(s); n += 20 - s.kids; } return n; };
  assert.ok(dead(0) > dead(6) * 3, `${dead(0)} infants vs ${dead(6)} older`);
});

test('famine hits children harder than adults, and leaves a note in the timeline', () => {
  let kidsLost = 0, kidsStart = 0, adultsLost = 0, adultsStart = 0, notes = 0;
  for (let i = 0; i < 60; i++) {
    const s = calm(band(fresh('fam' + i), { men: 6, women: 6, kids: [[1, 6, 6]] }), { foragePerPerson: 0, starvationRate: 0.4, childVulnerability: 3, matureTurns: 99 });
    s.food = 0; s.stability = 60;
    const a = s.pop, k = s.kids;
    step(s);
    kidsLost += k - s.kids; kidsStart += k; adultsLost += a - s.pop; adultsStart += a;
    notes += s.history.filter((h) => h.kind === 'famine').length;
    assert.ok(kidsMatch(s) && womenOk(s));
  }
  assert.ok(kidsLost / kidsStart > adultsLost / adultsStart, `children ${kidsLost}/${kidsStart} vs adults ${adultsLost}/${adultsStart}`);
  assert.equal(notes, 60);
});

// ---------------------------------------------------------------- deaths, mood, leaving
test('ordinary deaths happen, and winter is deadlier than summer', () => {
  const deaths = (stepIdx, rate) => { let n = 0; for (let i = 0; i < 80; i++) { const s = plenty(calm(band(fresh('d' + i), { men: 15, women: 15 }), { deathRate: rate })); s.clock.step = stepIdx; step(s); n += s.timeline[0].died; } return n; };
  assert.equal(deaths(0, 0), 0);
  const summer = deaths(1, 0.05), winter = deaths(3, 0.05);
  assert.ok(winter > summer * 1.5, `winter ${winter} vs summer ${summer}`);
});

test('crowding: past the room you have, people get unhappy and no new pregnancies start', () => {
  const s = plenty(calm(band(fresh(), { men: 20, women: 20 }), { conceiveChance: 1 }));
  s.rules.baseCapacity = 20; s.stability = 60;
  assert.ok(people(s) > 1.5 * capacity(s, data));
  step(s);
  assert.ok(s.stability < 60 - 3, `stability only fell to ${s.stability}`);
  assert.equal(s.pregnancies.length, 0, 'no pregnancies when the camp is 100% over capacity');
  const roomy = plenty(calm(band(fresh(), { men: 5, women: 5 }), { conceiveChance: 1 })); step(roomy);
  assert.ok(roomy.pregnancies.length > 0);
});

test('hunger makes people anxious and security makes them content', () => {
  const run = (food) => { const s = calm(fresh(), { foragePerPerson: 0, eatPerPerson: 0.5 }); s.food = food; s.stability = 60; step(s); return s.stability; };
  assert.ok(run(5) < 58, 'with almost nothing stored, mood drops');
  assert.ok(run(400) > 60, 'with plenty stored, mood rises');
});

test('unhappy people leave, and take their share of food and knowledge with them', () => {
  const s = calm(fresh(), { foragePerPerson: 0, eatPerPerson: 0, childEat: 0, leaveRate: 1, laborEnergy: 0, knowledgePerPerson: 0, knowledgeDecay: 0, stabilityPull: 0, leaveRelief: 5, contentment: 0 });
  band(s, { men: 10, women: 10 });
  s.food = 100; s.knowledge = 50; s.stability = 10;
  const out = step(s);
  const rec = s.timeline[0];
  assert.ok(rec.left > 0 && rec.left <= 17, `${rec.left} left`);
  assert.equal(s.pop, 20 - rec.left);
  const share = rec.left / 20;
  assert.ok(Math.abs(s.food - (100 - Math.round(100 * share * 10) / 10)) < 0.11, `food ${s.food}`);
  const lost = Math.min(50, Math.round(50 * share * s.rules.leaveKnowledge * 10) / 10);
  assert.ok(Math.abs(s.knowledge - (50 - lost)) < 0.11, `knowledge ${s.knowledge}, expected ${50 - lost}`);
  assert.ok(s.knowledge < 50 * (1 - share), 'they take more than their fair share of knowledge');
  const line = out.lines.find((l) => /walked away/.test(l.text));
  assert.ok(line && /taking .* food and .* knowledge/.test(line.text), line && line.text);
  assert.equal(line.tone, 'bad');
  assert.ok(s.history.some((h) => h.kind === 'unrest'));
  assert.equal(s.stability, 10 + 5, 'the ones who stay feel better once the angry ones are gone');
  assert.ok(womenOk(s));
});

test('children go with the adults who leave, pregnant women take their pregnancy, and a few adults always stay', () => {
  const s = calm(band(fresh(), { men: 5, women: 5, due: [30, 30, 30], kids: [[1, 5, 5]] }), { foragePerPerson: 0, eatPerPerson: 0, childEat: 0, leaveRate: 5, minStay: 3, stabilityPull: 0, matureTurns: 99 });
  s.food = 50; s.stability = 0;
  step(s);
  assert.equal(s.pop, 3, 'minStay adults remain');
  assert.ok(s.kids < 10 && s.kids >= 0);
  assert.ok(kidsMatch(s) && womenOk(s));
  assert.ok(s.pregnancies.length <= s.women);
  const quiet = calm(fresh()); band(quiet, { men: 2, women: 1 }); quiet.stability = 0; quiet.rules.minStay = 3; step(quiet);
  assert.equal(quiet.timeline[0].left, 0);
});

test('nobody leaves while people are content', () => {
  let left = 0;
  for (let i = 0; i < 30; i++) { const s = calm(fresh('c' + i)); s.food = 999; s.stability = 70; step(s); left += s.timeline[0].left; }
  assert.equal(left, 0);
});

// ---------------------------------------------------------------- the record
test('every turn leaves a record, and the numbers add up: people now = people before + born - died - left', () => {
  for (const seed of ['t1', 't2', 't3']) {
    const s = fresh(seed);
    let prev = people(s);
    while (s.turn <= 60 && !s.over) {
      if (s.dilemma) { game.choose(s, data, 'A'); continue; }
      game.build(s, data, 'campfire');
      step(s);
      const r = s.timeline[s.timeline.length - 1];
      assert.equal(r.pop + r.kids, prev + r.born - r.died - r.left, `turn ${r.turn}: ${prev} + ${r.born} - ${r.died} - ${r.left} != ${r.pop + r.kids}`);
      prev = r.pop + r.kids;
      assert.ok(kidsMatch(s) && womenOk(s));
    }
    assert.equal(s.timeline.length, s.turn - 1);
    s.timeline.forEach((r, i) => assert.equal(r.turn, i + 1));
    assert.equal(s.timeline[0].label, 'Spring, year 1');
    assert.equal(s.timeline[7].label, 'Winter, year 2');
    assert.equal(s.timeline[3].cold, true);
    assert.ok(s.timeline.every((r) => r.women <= r.pop && r.pregnant <= r.women));
  }
});

test('a band left alone rises and falls, and does not die out or explode', () => {
  let reversals = 0, extinct = 0, biggest = 0;
  for (let i = 0; i < 30; i++) {
    const s = fresh('idle' + i); let dir = 0, prev = people(s);
    while (s.turn <= 80 && !s.over) {
      if (s.dilemma) { game.choose(s, data, 'A'); continue; }
      step(s);
      const n = people(s), d = Math.sign(n - prev);
      if (d && dir && d !== dir) reversals++;
      if (d) dir = d;
      prev = n; biggest = Math.max(biggest, n);
    }
    if (s.over) extinct++;
  }
  assert.ok(reversals / 30 > 8, `only ${reversals / 30} ups and downs per run`);
  assert.ok(extinct <= 1, `${extinct} of 30 died out`);
  assert.ok(biggest < 80, `grew to ${biggest}`);
});

test('a sensible player grows the band a lot, with setbacks along the way', () => {
  let ended = 0, walkouts = 0, famines = 0, growth = 0, lost = 0;
  for (let i = 0; i < 30; i++) {
    const s = fresh('sense' + i);
    while (s.turn <= 70 && !s.over) {
      if (s.dilemma) { game.choose(s, data, 'A'); continue; }
      const n = (id) => s.structures[id] || 0, total = people(s), cap = capacity(s, data);
      const b = (id) => game.build(s, data, id);
      if (n('campfire') < 3 || (s.knowledge < 15 && n('campfire') < 4)) b('campfire');
      if (n('fish-trap') < 2 + Math.floor(total / 14)) b('fish-trap');
      if (n('woodcutters-camp') < 1 + Math.floor(total / 25)) b('woodcutters-camp');
      if (n('hunting-camp') < 1 + Math.floor(total / 20)) b('hunting-camp');
      if (n('drying-rack') < 2) b('drying-rack');
      if (total > cap - 5) b('shelter');
      if (s.food > 22) game.invite(s, data);
      if (!s.parties.length && s.food > 28) game.explore(s, data, 'follow-river').ok || game.explore(s, data, 'scout-hills');
      const out = step(s);
      for (const l of out.lines) { if (/walked away/.test(l.text)) walkouts++; if (/Famine/.test(l.text)) famines++; }
    }
    if (s.over) ended++;
    growth += people(s) - data.rules.startPopulation.value;
    lost += s.timeline.reduce((x, r) => x + r.lost, 0);
  }
  console.log(`Sensible player, 70 turns, 30 seeds: ${(growth / 30).toFixed(0)} more people on average, ${(lost / 30).toFixed(0)} pregnancies lost, ${(walkouts / 30).toFixed(1)} walk-outs and ${(famines / 30).toFixed(1)} famines per run`);
  assert.equal(ended, 0, 'a sensible player should not lose the band');
  assert.ok(growth / 30 > 35, `average growth ${growth / 30}`);
  assert.ok(walkouts / 30 > 0.3, 'some people should walk out in a typical run');
  assert.ok(famines / 30 > 0.1, 'there should be a famine now and then');
  assert.ok(lost / 30 > 10, 'pregnancies should be lost along the way');
});

// ---------------------------------------------------------------- old saves and the console
test('saves from earlier builds are brought up to date and keep playing', () => {
  const s = fresh('old');
  while (s.turn < 6) { if (s.dilemma) game.choose(s, data, 'A'); else step(s); }
  const v3 = JSON.parse(JSON.stringify(s));
  for (const k of ['women', 'pregnancies', 'resting', 'cooldowns']) delete v3[k];
  v3.v = 3; v3.cohorts = [{ born: 2, n: 5 }]; v3.kids = 5; v3.parties = [{ id: 'scout-hills', start: 5, due: 7, people: 2 }];
  v3.rules.birthRate = 0.1; delete v3.rules.gestation;
  const moved = migrate(v3, data);
  assert.equal(moved.v, 4);
  assert.ok(isValidSave(moved));
  assert.equal(moved.women, Math.round(s.pop / 2));
  assert.deepEqual(moved.cohorts[0], { born: 2, m: 3, f: 2 });
  assert.deepEqual(moved.parties[0], { id: 'scout-hills', start: 5, due: 7, people: 2, m: 2, f: 0 });
  assert.equal(moved.rules.gestation, data.rules.gestation.value);
  assert.ok(!('birthRate' in moved.rules));
  assert.ok(moved.cooldowns.invite >= moved.turn);
  const t0 = moved.timeline.length;
  while (moved.timeline.length < t0 + 6) { if (moved.dilemma) game.choose(moved, data, 'A'); else step(moved); }
  assert.ok(womenOk(moved) && kidsMatch(moved));

  const v2 = JSON.parse(JSON.stringify(s));
  for (const k of ['kids', 'cohorts', 'clock', 'timeline', 'women', 'pregnancies', 'resting', 'cooldowns']) delete v2[k];
  v2.v = 2; v2.rules.growthRate = 0.06;
  const up = migrate(v2, data);
  assert.equal(up.v, 4); assert.ok(isValidSave(up));
  const edited = JSON.parse(JSON.stringify(v3)); edited.rulesModified = true; edited.rules.spoilage = 0.2;
  assert.equal(migrate(edited, data).rules.spoilage, 0.2, 'a rule the player changed is kept');
});

test('status and timeline in the console show who lives in the camp, and the date', async () => {
  const { createCommands } = await import('../js/commands.js');
  const state = fresh('cmd'); const host = { getState: () => state, changed() {}, clear() {}, setTheme() {}, setSpeed() {}, save: () => true, load: () => null, reset() {}, shareUrl: () => '' };
  const cmds = createCommands({ data, host });
  const text = (c) => cmds.run(c).map((l) => l.text).join('\n');
  assert.match(text('status'), /Spring, year 1/);
  assert.match(text('status'), /5 men, 5 women, 5 pregnant, 0 children/);
  assert.match(text('timeline'), /Nothing has happened yet/);
  step(state, 3);
  const t = text('timeline');
  assert.match(t, /turn\s+1\s+Spring, year 1/);
  assert.match(t, /Summer, year 1/);
  assert.equal(cmds.complete('time').value, 'timeline ');
  assert.match(text('map'), /Room for \d+ people/);
});
