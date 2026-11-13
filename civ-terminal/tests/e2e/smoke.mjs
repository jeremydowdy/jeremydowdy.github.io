// End-to-end smoke test: plays Civ Terminal in a real browser.
//
//   node tests/e2e/smoke.mjs
//
// Needs Playwright with a Chromium browser installed (it is not part of
// `npm test`, which runs with Node alone). A tiny static server is started
// for the run, so nothing else needs to be running.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg' };

const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const file = join(root, path.endsWith('/') ? path + 'index.html' : path);
    if (!file.startsWith(root)) throw new Error('outside');
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch (e) { res.writeHead(404); res.end('not found'); }
}).listen(0);
await new Promise((r) => server.once('listening', r));
const URL_ = `http://localhost:${server.address().port}/civ-terminal/#seed=smoke`;

const browser = await chromium.launch();
const errors = [], hosts = new Set();
let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; console.log('  ok -', msg); };
const eq = (a, b, msg) => { assert.equal(a, b, msg); passed++; console.log('  ok -', msg); };

async function open(ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...ctxOpts });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('request', (r) => hosts.add(new URL(r.url()).host));
  return p;
}
async function begin(p, name = 'Meridian') {
  await p.goto(URL_);
  await p.keyboard.press('Space');                                 // skip the boot log
  await p.waitForFunction(() => !document.getElementById('in').disabled);
  await p.keyboard.type(name); await p.keyboard.press('Enter');
  await p.waitForSelector('#game:not([hidden])');
}
const chip = async (p, k) => Number(await p.textContent(`[data-chip="${k}"] .val`));
const saved = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('civ-terminal:save:v1')));
const enabled = async (p, key) => (await p.getAttribute(`[data-key="${key}"]`, 'aria-disabled')) === 'false';

try {
  console.log('Start screen');
  const p = await open();
  await p.goto(URL_); await p.keyboard.press('Space');
  await p.waitForFunction(() => !document.getElementById('in').disabled);
  eq(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(0, 0, 0)', 'page background is pure black');
  eq(await p.evaluate(() => getComputedStyle(document.getElementById('start')).color), 'rgb(51, 255, 102)', 'terminal text is phosphor green');
  await p.keyboard.type('Bad_Name!'); await p.keyboard.press('Enter');
  ok((await p.textContent('#out')).includes('Use only letters'), 'a bad name gets a one-line error');
  ok(await p.isHidden('#game'), '... and the prompt stays open');
  await p.keyboard.type('Zzz'); await p.keyboard.press('Escape');
  eq(await p.inputValue('#in'), '', 'Esc clears the input');
  await p.keyboard.type('Meridian'); await p.keyboard.press('Enter');
  await p.waitForSelector('#game:not([hidden])');
  ok(await p.isHidden('#start'), 'naming the civilization opens the game screen');

  console.log('Building and resources');
  eq(await chip(p, 'energy'), 10, 'starts with 10 energy');
  ok(await enabled(p, 'build-campfire'), 'campfire can be built');
  eq(await p.getAttribute('[data-key="build-shelter"]', 'aria-disabled'), 'true', 'shelter is locked at the start');
  await p.click('[data-key="build-campfire"]');
  eq(await chip(p, 'energy'), 4, 'building a campfire takes 6 energy off the bar');
  eq((await p.$$eval('[data-chip="energy"] .delta', (x) => x.map((d) => d.textContent)))[0], '-6', 'a floating -6 shows on the energy chip');
  ok((await p.textContent('#log')).includes('Built a campfire for 6 energy'), 'the log says what it cost');
  ok((await p.textContent('[data-key="build-campfire"]')).includes('8 energy'), 'the next campfire is shown costing more (8)');
  await p.click('[data-key="build-shelter"]', { force: true });
  ok((await p.textContent('#log')).includes('15 knowledge'), 'clicking a locked building explains what unlocks it');

  console.log('Expeditions');
  const f0 = await chip(p, 'food'), pop0 = await chip(p, 'pop');
  await p.click('[data-key="explore-scout-hills"]');
  eq(await chip(p, 'food'), f0 - 4, 'an expedition costs 4 food');
  eq(await chip(p, 'pop'), pop0 - 2, '... and 2 people are away');
  ok((await p.textContent('#expList .away')).includes('Back in 3 turns'), 'the away note counts down');

  console.log('Playing forward: decisions, cooking, shelters');
  let sawBorder = false, sawModalInert = false;
  for (let i = 0; i < 80; i++) {
    if (await p.isVisible('#modal')) {
      sawModalInert ||= await p.evaluate(() => document.querySelector('.stage').inert);
      sawBorder ||= /Border/.test(await p.textContent('#mTitle'));
      await p.keyboard.press(i % 2 ? 'a' : 'b'); await p.waitForTimeout(60); continue;
    }
    if (await enabled(p, 'build-campfire')) await p.click('[data-key="build-campfire"]');
    const s = await saved(p);
    if (s.discovered.includes('crafts') && sawBorder) break;
    await p.keyboard.press('n'); await p.waitForTimeout(30);
  }
  const s = await saved(p);
  ok(sawBorder, 'the border decision came up, with a payoff matrix');
  ok(sawModalInert, 'the page behind a decision is inert (keyboard focus stays in it)');
  ok(s.discovered.includes('cooking') && s.mods.knowledgeMult > 1, 'Cooking was discovered and speeds up learning');
  ok(s.discovered.includes('crafts'), 'Hide and pole work was discovered at 15 knowledge');
  ok(s.history.some((h) => h.kind === 'expedition' && /party is home/.test(h.text)), 'the expedition came home');
  ok(await p.isHidden('#modal'), 'the decision card closes after choosing');
  await p.waitForTimeout(100);
  ok(!(await p.$eval('[data-key="build-shelter"]', (e) => e.classList.contains('locked'))), 'shelters are no longer locked in the build menu');

  console.log('Console drawer, rules, saving');
  await p.keyboard.press('`');
  ok(await p.isVisible('#drawer'), 'the backtick key opens the console');
  await p.keyboard.type('set speed instant'); await p.keyboard.press('Enter');
  await p.keyboard.type('status'); await p.keyboard.press('Enter');
  ok((await p.textContent('#cOut')).includes('population'), 'console commands work');
  await p.keyboard.press('Escape');
  ok(await p.isHidden('#drawer'), 'Esc closes it');
  await p.click('#rulesBox summary');
  await p.fill('#rule-foragePerPerson', '3'); await p.dispatchEvent('#rule-foragePerPerson', 'change');
  ok((await p.textContent('#gScore')).includes('rules changed'), 'changing a rule marks the run');
  const before = await saved(p);
  await p.reload(); await p.keyboard.press('Space');
  await p.waitForFunction(() => !document.getElementById('in').disabled);
  ok((await p.textContent('#out')).includes('Saved civilization found: Meridian'), 'a reload finds the save');
  await p.keyboard.type('load'); await p.keyboard.press('Enter');
  await p.waitForSelector('#game:not([hidden])');
  eq((await saved(p)).turn, before.turn, 'loading restores the same turn');

  console.log('Calendar, population and timeline');
  const q = await open();
  await begin(q, 'Calendar');
  const turns = async (n) => { for (let i = 0; i < n; i++) { if (await q.isVisible('#modal')) { await q.keyboard.press('a'); await q.waitForTimeout(40); i--; continue; } await q.keyboard.press('n'); await q.waitForTimeout(25); } };
  ok((await q.textContent('.hud-sub')).includes('Spring, year 1'), 'the top bar shows the date: Spring, year 1');
  eq(await q.textContent('#clock'), 'Spring, year 1', 'a date badge sits on the map');
  await turns(1);
  ok((await q.textContent('#log')).includes('Summer begins'), 'the log announces each new season');
  await turns(2);
  eq(await q.textContent('#clock'), 'Winter, year 1', 'turn 4 is winter');
  ok(await q.$eval('#clock', (e) => e.classList.contains('cold')), '... and the badge turns icy');
  await turns(1);
  eq(await q.textContent('#clock'), 'Spring, year 2', 'four turns later it is year 2');
  await turns(14);
  const rows = await q.$$eval('#tlList .trow', (x) => x.map((e) => e.innerText));
  ok(rows.length >= 18 && /now/.test(rows[0]), 'the timeline has a row for every turn, with this turn on top');
  ok(rows.some((r) => /Winter, year 1/.test(r)) && rows.some((r) => /\+\d+ born/.test(r)), 'rows show the season and births');
  const w = await saved(q);
  ok(w.timeline.reduce((n, r) => n + r.born, 0) > 0 && w.kids + w.pop > 12, 'people were born and the population grew by itself');
  ok(/People: \d+ to \d+/.test(await q.getAttribute('#chart', 'aria-label')), 'the chart has a text version with the numbers');
  ok((await q.textContent('[data-chip="pop"]')).includes('adults'), 'the population chip shows adults and kids');
  ok((await q.textContent('[data-chip="food"]')).includes('foraging'), 'the food chip shows how this season forages');
  await q.keyboard.press('`'); await q.keyboard.type('set speed instant'); await q.keyboard.press('Enter');
  for (const c of ['set rule foragePerPerson 0.2', 'set rule hungerUnrest 30', 'wait 12']) { await q.keyboard.type(c); await q.keyboard.press('Enter'); await q.waitForTimeout(100); }
  await q.keyboard.press('Escape');
  const lg = await q.textContent('#log');
  ok(/Famine/.test(lg), 'when food runs out there is famine');
  ok(/walked away, .*taking .* food/.test(lg) || /walked away, taking/.test(lg), 'unhappy people walk away, taking food and knowledge with them');
  const mid = await saved(q);
  await q.evaluate((save) => { for (const k of ['kids', 'cohorts', 'clock', 'timeline']) delete save[k]; save.v = 2; localStorage.setItem('civ-terminal:save:v1', JSON.stringify(save)); }, mid);
  await q.reload(); await q.keyboard.press('Space'); await q.waitForFunction(() => !document.getElementById('in').disabled);
  await q.keyboard.type('load'); await q.keyboard.press('Enter'); await q.waitForSelector('#game:not([hidden])');
  ok(/year \d+/.test(await q.textContent('.hud-sub')), 'a save from the previous build loads and gets a calendar');

  console.log('Small screens and reduced motion');
  const phone = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await begin(phone);
  eq(await phone.evaluate(() => document.documentElement.scrollWidth), 390, 'no sideways scrolling on a phone');
  const calm = await open({ reducedMotion: 'reduce' });
  await begin(calm);
  await calm.click('[data-key="build-campfire"]');
  eq(await calm.evaluate(() => getComputedStyle(document.querySelector('[data-chip="energy"] .delta')).animationName), 'none', 'reduced motion turns off the floating numbers animation');

  console.log('Privacy');
  eq([...hosts].filter((h) => !h.startsWith('localhost')).length, 0, 'no requests to any other site');
  eq(errors.length, 0, 'no errors in the browser console: ' + errors.join(' | '));
  console.log(`\n${passed} checks passed.`);
} catch (e) {
  console.error('\nFAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
