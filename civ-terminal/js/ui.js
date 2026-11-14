// The game screen: resource bar, build buttons, expeditions, rivals, the
// decision card, and the log. It only draws what the game state says and
// hands every click to `actions`; it never changes the state itself.
import * as game from './game.js';
import { describeEffects } from './commands.js';
import { forecast, capacity, people, men, ledger } from './economy.js';
import { inviteInfo } from './events.js';
import { score } from './scoring.js';
import { record } from './rivals.js';
import { MOVES } from './gametheory/armsRace.js';
import { iconCanvas } from './sprites.js';

const $ = (id) => document.getElementById(id);
const n0 = (x) => String(Math.round(x));
const n1 = (x) => String(Math.round(x * 10) / 10);
const perTurn = (x) => (x >= 0 ? '+' : '') + n1(x);

// Small DOM helper: h('div', { class: 'x' }, child, 'text', ...)
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    if (k.startsWith('aria-')) { el.setAttribute(k, String(v)); continue; }   // aria-x needs "true" or "false", never empty
    if (v === false) continue;
    el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const CHIPS = [
  { key: 'pop', label: 'Population', color: '#e8ecf2' },
  { key: 'food', label: 'Food', color: '#ffb347' },
  { key: 'energy', label: 'Energy', color: '#ffe27a' },
  { key: 'knowledge', label: 'Knowledge', color: '#8fb8ff' },
  { key: 'stability', label: 'Stability', color: '#6fd07c' },
];

export function createUI({ data, actions, reducedMotion = false }) {
  const chipEls = {};
  let shownDecision = null, returnKey = null, bannerTimer = null;

  // ---------------------------------------------------------------- resource bar
  const chipList = $('chips');
  for (const c of CHIPS) {
    const li = h('li', { class: 'chip', style: `--c:${c.color}`, 'data-chip': c.key });
    const val = h('div', { class: 'val' });
    const sub = h('div', { class: 'sub' });
    const sub2 = h('div', { class: 'sub' });
    const bar = h('div', { class: 'bar', hidden: !(c.key === 'knowledge' || c.key === 'stability'), 'aria-hidden': 'true' }, h('i'));
    li.append(h('div', { class: 'label' }, c.label), val, sub, sub2, bar);
    chipList.append(li);
    chipEls[c.key] = { li, val, sub, sub2, bar: bar.firstChild, barBox: bar };
  }

  function showDelta(key, diff) {
    const { li } = chipEls[key];
    const mag = Math.abs(diff);
    const text = (diff > 0 ? '+' : '-') + (mag >= 10 || Number.isInteger(mag) ? n0(mag) : n1(mag));
    const shown = li.querySelectorAll('.delta');
    if (shown.length >= 3) shown[0].remove();                  // tapping fast shouldn't pile them up
    const stack = Math.min(2, li.querySelectorAll('.delta').length);
    const el = h('span', { class: 'delta ' + (diff > 0 ? 'up' : 'down'), style: `top:${4 + stack * 17}px`, 'aria-hidden': 'true' }, text);
    li.append(el);
    setTimeout(() => el.remove(), 1700);
  }

  function updateChips(state, prev) {
    const f = forecast(state, data);
    const cap = capacity(state, data);
    const goal = game.nextGoal(state, data);
    const away = state.parties.reduce((n, p) => n + p.people, 0);
    const when = game.calendar(state, data);
    const crowded = people(state) > cap;
    chipEls.pop.val.textContent = n0(people(state));
    chipEls.pop.sub.textContent = `${men(state)} men, ${state.women} women, ${state.kids} kids` + (away ? `, ${away} away` : '');
    chipEls.pop.sub2.replaceChildren(h('span', { class: crowded ? 'down' : '' },
      (state.pregnancies.length ? `${state.pregnancies.length} pregnant \u00B7 ` : '') + (crowded ? `crowded: room for ${cap}` : `room for ${cap}`)));
    chipEls.food.val.textContent = n0(state.food);
    chipEls.food.sub.replaceChildren(h('span', { class: f.food >= 0 ? 'up' : 'down' }, perTurn(f.food)), ' per turn');
    chipEls.food.sub2.replaceChildren(when.seasonal ? h('span', { class: when.season.cold ? 'down' : '' }, `${when.season.name}: foraging ${Math.round((when.season.forage ?? 1) * 100)}%`) : '');
    chipEls.energy.val.textContent = n0(state.energy);
    chipEls.energy.sub.replaceChildren(h('span', { class: f.energy >= 0 ? 'up' : 'down' }, perTurn(f.energy)), ' per turn');
    chipEls.knowledge.val.textContent = n1(state.knowledge);
    chipEls.knowledge.sub.replaceChildren(h('span', { class: f.knowledge >= 0 ? 'up' : 'down' }, perTurn(f.knowledge)), ' per turn');
    chipEls.knowledge.bar.style.width = goal ? Math.min(100, (state.knowledge / goal.at) * 100) + '%' : '100%';
    chipEls.stability.val.textContent = n0(state.stability);
    chipEls.stability.sub.textContent = state.stability < state.rules.unrestThreshold ? 'unrest: people may leave' : 'out of 100';
    chipEls.stability.bar.style.width = state.stability + '%';
    for (const c of CHIPS) {
      const e = chipEls[c.key];
      e.li.setAttribute('aria-label', `${c.label} ${e.val.textContent}, ${e.sub.textContent}${e.sub2.textContent ? ', ' + e.sub2.textContent : ''}`);
    }
    if (prev) {
      for (const key of ['pop', 'food', 'energy', 'knowledge', 'stability']) {
        const diff = (key === 'pop' ? people(state) : state[key]) - prev[key];
        if (Math.abs(diff) >= (key === 'pop' ? 1 : 0.5)) showDelta(key, diff);
      }
    }
    $('goal').replaceChildren(...(goal ? (goal.kind === 'done' ? [
      h('strong', {}, `You have mastered the ${goal.label}.`),
      ` The next era isn't built yet, so this is as far as the game goes for now. Keep growing the band, and the score.`,
    ] : [
      goal.kind === 'discovery' ? 'Next discovery: ' : 'Goal: ',
      h('strong', {}, goal.label), ` at ${goal.at} knowledge (you have ${n1(state.knowledge)}). Campfires spread knowledge; expeditions bring some home.`,
    ]) : ['']));
  }

  // ---------------------------------------------------------------- build
  function costLine(cost, missing) {
    const lack = new Set((missing || []).map((m) => m.resource));
    const bits = [];
    Object.entries(cost).forEach(([k, v], i) => {
      if (i) bits.push(' + ');
      bits.push(h('span', { class: lack.has(k) ? 'lack' : 'need' }, `${v} ${k}`));
    });
    return bits;
  }

  function updateBuild(state) {
    const grid = $('buildGrid');
    grid.replaceChildren();
    for (const s of game.structureList(state, data)) {
      const card = h('button', {
        type: 'button', class: 'card' + (s.unlocked ? '' : ' locked'), 'data-key': 'build-' + s.id,
        'aria-disabled': !s.affordable,
      },
        iconCanvas(s.id),
        h('span', { class: 'nm' }, s.name, s.owned ? h('small', {}, ` x${s.owned}`) : null),
        s.unlocked ? h('span', { class: 'cost' }, costLine(s.cost, s.missing)) : h('span', { class: 'cost' }, s.lockedReason),
        h('span', { class: 'desc' }, s.description));
      card.addEventListener('click', () => actions.build(s.id));
      grid.append(card);
    }
  }

  function updateExpeditions(state) {
    const list = $('expList');
    list.replaceChildren();
    const away = state.parties[0];
    if (away) {
      const ex = data.expeditions.find((e) => e.id === away.id);
      const left = Math.max(1, away.due - state.turn + 1);
      list.append(h('div', { class: 'away' }, `Away: ${ex ? ex.name : 'a party'} (${away.people} people). Back in ${left} turn${left === 1 ? '' : 's'}.`));
    }
    for (const e of game.expeditionList(state, data)) {
      const card = h('button', { type: 'button', class: 'card noicon' + (e.locked ? ' locked' : ''), 'data-key': 'explore-' + e.id, 'aria-disabled': !e.available },
        h('span', { class: 'nm' }, e.name, h('small', {}, ` ${e.people} people, ${e.turns} turns`)),
        h('span', { class: 'cost' }, costLine(e.cost, e.missing), ' ', h('span', { class: e.random ? 'risk' : 'tag' }, e.random ? '  random reward, real risk' : `  +${e.reward.knowledge} knowledge`)),
        h('span', { class: 'desc' }, e.text, ' ', e.risk ? h('span', { class: 'risk' }, `${Math.round(e.risk * 100)}% chance one doesn't come back.`) : null,
          e.blocked ? ` Not now: ${e.blocked}` : ''));
      card.addEventListener('click', () => actions.explore(e.id));
      list.append(card);
    }
  }

  // ---------------------------------------------------------------- rivals
  function updateRivals(state) {
    const box = $('rivalList');
    box.replaceChildren();
    if (!state.rivals.length) { box.append(h('p', { class: 'hint' }, 'No rivals in this world.')); return; }
    for (const r of state.rivals) {
      const strat = data.rivals.strategies[r.strategy];
      const rec = record(r);
      const rounds = h('div', { class: 'rounds', role: 'img', 'aria-label': rec.rounds ? `Their last ${Math.min(10, rec.rounds)} moves: ` + r.rounds.slice(-10).map((x) => MOVES[x.them]).join(', ') : 'No border decisions yet' });
      for (const x of r.rounds.slice(-10)) rounds.append(h('i', { class: x.them === 'C' ? 'c' : 'd', title: `Turn ${x.turn}: you ${MOVES[x.you]}, they ${MOVES[x.them]}` }));
      const pledged = !!state.treaty;
      const pledge = h('button', { type: 'button', class: 'btn small', 'data-key': 'propose', 'aria-disabled': pledged || state.over || !!state.dilemma },
        pledged ? 'Pledge in force' : 'Propose a disarmament pledge');
      pledge.addEventListener('click', () => actions.propose());
      const inv = inviteInfo(state, data);
      const invite = h('button', { type: 'button', class: 'btn small', 'data-key': 'invite', 'aria-disabled': !inv.available },
        inv.blocked ? `Invite them to share knowledge (${inv.blocked.replace(/\.$/, '')})` : 'Invite them to share knowledge');
      invite.addEventListener('click', () => actions.invite());
      box.append(h('div', { class: 'rival' },
        h('div', { class: 'nm' }, h('span', {}, r.name), h('span', {}, `trust ${r.trust}`)),
        h('div', { class: 'strat' }, `${strat.label}: ${strat.description}`),
        h('div', { class: 'meter' }, 'trust', h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: `width:${r.trust}%` }))),
        rec.rounds ? rounds : h('p', { class: 'hint' }, 'No border decisions yet.'),
        rec.rounds ? h('p', { class: 'hint' }, `Green: they disarmed. Red: they built. Arms: you ${state.arms}, them ${r.arms}.`) : null,
        pledge,
        h('p', { class: 'hint' }, `Inviting them costs ${Object.entries(inv.cost).map(([k, v]) => `${v} ${k}`).join(' and ')} as a gift and is a gamble: they might teach you, trade, demand tribute, or attack. The more they trust you, the better the odds, and a well-armed camp is attacked less. You can invite them every ${inv.cooldown} turns.`),
        invite));
    }
  }

  // ---------------------------------------------------------------- history and rules
  // ---------------------------------------------------------------- food and wood ledger
  function updateLedger(state) {
    const L = ledger(state, data);
    const box = $('ledger');
    box.replaceChildren();
    const section = (title, rows, net, unit) => {
      const wrap = h('div', { class: 'led' }, h('h3', {}, title));
      for (const row of rows) {
        wrap.append(h('div', { class: 'row2' }, h('span', {}, row.label), h('span', { class: row.amount >= 0 ? 'up' : 'down' }, perTurn(row.amount))));
      }
      wrap.append(h('div', { class: 'row2 total' }, h('span', {}, `Net ${unit}`), h('span', { class: net >= 0 ? 'up' : 'down' }, perTurn(net))));
      return wrap;
    };
    box.append(section('Food', [...L.food.in, ...L.food.out], L.food.net, 'food'));
    box.append(section('Wood', L.energy.in, L.energy.net, 'wood'));
    box.append(h('p', { class: 'hint' }, `${L.season.name}. Average weather; spoilage, hunger and births are not counted. Fish run best in spring and summer, game in autumn.`));
  }

  function updateDiscoveries(state) {
    const list = $('discList');
    list.replaceChildren();
    for (const d of data.discoveries.filter((x) => x.era === state.era).sort((a, b) => a.at.knowledge - b.at.knowledge)) {
      const got = state.discovered.includes(d.id);
      const names = (d.unlocks || []).map((id) => (data.structures.find((s) => s.id === id) || {}).name).filter(Boolean);
      list.append(h('li', { class: got ? 'got' : 'next' },
        h('b', {}, `${got ? '\u2713 ' : ''}${d.name}`), h('span', {}, ` at ${d.at.knowledge}`),
        got ? h('small', {}, d.text) : null,
        names.length ? h('small', { class: 'unl' }, `Unlocks: ${names.join(', ')}`) : null));
    }
  }

  // ---------------------------------------------------------------- timeline
  const CHART = { w: 300, h: 80, pad: 4, window: 60 };

  // A small pixel chart of the last turns: people and food, with winters shaded.
  function drawChart(state) {
    const c = $('chart');
    c.width = CHART.w; c.height = CHART.h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#070b12'; g.fillRect(0, 0, CHART.w, CHART.h);
    const recs = state.timeline.slice(-CHART.window);
    const note = $('chartNote');
    if (recs.length < 2) {
      g.fillStyle = '#9fb0c8'; g.font = '10px monospace'; g.fillText('The chart fills in as turns pass.', 10, CHART.h / 2 + 3);
      note.textContent = 'Nothing to chart yet. Press Next turn.';
      c.setAttribute('aria-label', 'Chart of people and food over time. Nothing to show yet.');
      return;
    }
    const n = recs.length, span = CHART.w - CHART.pad * 2, colW = Math.max(2, span / (n - 1));
    const x = (i) => Math.round(CHART.pad + (i * span) / (n - 1));
    recs.forEach((r, i) => { if (r.cold) { g.fillStyle = '#16233b'; g.fillRect(Math.round(x(i) - colW / 2), 0, Math.ceil(colW), CHART.h); } });
    // Hard-edged pixel lines (Bresenham), so the chart matches the rest of the game.
    const pixelLine = (x0, y0, x1, y1) => {
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        g.fillRect(x0, y0, 1, 1);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    };
    const series = (get, color) => {
      const vals = recs.map(get), max = Math.max(1, ...vals) * 1.1;
      const y = (v) => Math.round(CHART.h - 5 - (v / max) * (CHART.h - 10));
      g.fillStyle = color;
      for (let i = 1; i < n; i++) pixelLine(x(i - 1), y(vals[i - 1]), x(i), y(vals[i]));
      g.fillRect(x(n - 1) - 1, y(vals[n - 1]) - 1, 3, 3);
    };
    series((r) => r.food, '#ffb347');
    series((r) => r.pop + r.kids, '#e8ecf2');
    const ppl = recs.map((r) => r.pop + r.kids), food = recs.map((r) => Math.round(r.food));
    const text = `Last ${n} turns. People: ${ppl[0]} to ${ppl[n - 1]} (low ${Math.min(...ppl)}, high ${Math.max(...ppl)}). Food: ${food[0]} to ${food[n - 1]} (low ${Math.min(...food)}, high ${Math.max(...food)}).`;
    note.textContent = text;
    c.setAttribute('aria-label', 'Chart of people and food over time. ' + text);
  }

  function turnRow(rec, notes, now) {
    const flow = [];
    if (rec.born) flow.push(h('span', { class: 'good' }, `+${rec.born} born`));
    if (rec.lost) flow.push(h('span', { class: 'bad' }, `${rec.lost} pregnancy lost`));
    if (rec.died) flow.push(h('span', { class: 'bad' }, `-${rec.died} died`));
    if (rec.left) flow.push(h('span', { class: 'bad' }, `-${rec.left} left`));
    const stats = now ? null : h('div', { class: 'tstats' },
      `people ${rec.pop + rec.kids}`, rec.kids ? ` (${rec.kids} kids)` : '', flow.length ? ' ' : '', flow.flatMap((f, i) => (i ? [', ', f] : [f])),
      ` \u00B7 food ${n0(rec.food)} \u00B7 knowledge ${n1(rec.knowledge)}`);
    return h('li', { class: 'trow' + (rec.cold ? ' cold' : '') + (rec.left || rec.died >= 3 ? ' rough' : '') + (now ? ' now' : '') },
      h('div', { class: 'thead' }, h('b', {}, rec.label), h('span', {}, now ? `turn ${rec.turn}, now` : `turn ${rec.turn}`)),
      stats,
      notes.length ? h('ul', { class: 'tnotes' }, notes.map((t) => h('li', {}, t))) : null);
  }

  function updateTimeline(state) {
    drawChart(state);
    const byTurn = new Map();
    for (const e of state.history) {
      if (e.kind === 'start') continue;
      if (!byTurn.has(e.turn)) byTurn.set(e.turn, []);
      byTurn.get(e.turn).push(e.text);
    }
    const list = $('tlList');
    list.replaceChildren();
    const when = game.calendar(state, data);
    list.append(turnRow({ turn: state.turn, label: when.label, cold: !!when.season.cold }, byTurn.get(state.turn) || [], true));
    for (const rec of state.timeline.slice(-40).reverse()) list.append(turnRow(rec, byTurn.get(rec.turn) || [], false));
  }

  function updateRules(state) {
    const box = $('rulesList');
    box.replaceChildren();
    for (const [key, value] of Object.entries(state.rules)) {
      const def = data.rules[key];
      const input = h('input', { type: 'number', step: 'any', min: '0', value: String(value), id: 'rule-' + key, 'data-key': 'rule-' + key });
      input.addEventListener('change', () => actions.setRule(key, input.value));
      box.append(h('div', { class: 'rule' + (def && def.value !== value ? ' changed' : '') },
        h('label', { for: 'rule-' + key }, h('b', {}, key), def ? def.label : '', def && def.value !== value ? ` (was ${def.value})` : ''), input));
    }
  }

  // ---------------------------------------------------------------- the decision card
  function optionCard(card, key) {
    const o = card.options[key];
    const kids = [
      h('h3', {}, `${key}) ${o.label}`),
      h('p', { class: 'up' }, `▲ ${o.upside}`),
      h('p', { class: 'dn' }, `▼ ${o.cost}`),
    ];
    if (card.type === 'event') kids.push(h('p', { class: 'fx' }, 'The outcome is random.'));
    if (card.type === 'choice') {
      kids.push(h('p', { class: 'fx' }, `Right away: ${describeEffects(o.now)}.`));
      for (const l of o.later || []) kids.push(h('p', { class: 'fx' }, `In about ${l.after} turns: ${describeEffects(l.effects)}.`));
      if ((o.locks || []).length) kids.push(h('p', { class: 'fx' }, 'This choice closes off some future options.'));
    }
    const btn = h('button', { type: 'button', class: 'btn primary', 'data-key': 'choose-' + key }, `Choose ${key}`);
    btn.addEventListener('click', () => actions.choose(key));
    kids.push(btn);
    return h('div', { class: 'opt' }, kids);
  }

  function renderDecision(state) {
    const card = game.currentCard(state, data);
    const root = $('decision');
    root.replaceChildren(
      h('p', { class: 'kicker' }, card.type === 'armsRace' ? `Border decision, turn ${state.dilemma.turn}` : card.type === 'event' ? `Random event, turn ${state.dilemma.turn}` : `Decision, turn ${state.dilemma.turn}`),
      h('h2', { id: 'mTitle' }, card.title),
      h('p', { class: 'story' }, card.text),
      h('div', { class: 'opts' }, optionCard(card, 'A'), optionCard(card, 'B')));
    if (card.type === 'armsRace') {
      const m = card.matrix;
      const cell = (k) => h('td', {}, `${m[k][0]}, ${m[k][1]}`);
      root.append(
        h('table', { class: 'matrix', 'aria-label': 'Payoff matrix: security points for you, then them' },
          h('thead', {}, h('tr', {}, h('th', {}, 'you, them'), h('th', {}, 'they disarm'), h('th', {}, 'they build'))),
          h('tbody', {}, h('tr', {}, h('th', {}, 'you disarm'), cell('CC'), cell('CD')), h('tr', {}, h('th', {}, 'you build'), cell('DC'), cell('DD')))),
        h('p', { class: 'why' }, `Why both sides often build: ${card.explain}`));
      const rec = record(card.rival), strat = data.rivals.strategies[card.rival.strategy];
      root.append(h('p', { class: 'rivalnote' }, `${card.rival.name} (${strat.label}). Trust in you: ${card.rival.trust}. ` +
        (rec.rounds ? `Over ${rec.rounds} round${rec.rounds === 1 ? '' : 's'} you disarmed ${rec.youDisarmed} and built ${rec.youBuilt}; they disarmed ${rec.theyDisarmed}.` : 'No history yet.') +
        (state.treaty ? ' Both sides have pledged to disarm this round.' : '')));
    }
    root.append(h('p', { class: 'hint' }, 'Time is stopped until you decide. Press A or B.'));
  }

  function updateDecision(state) {
    const modal = $('modal');
    const key = state.dilemma ? JSON.stringify(state.dilemma) : null;
    const inertEls = [document.querySelector('.hud'), document.querySelector('.stage'), document.querySelector('.logbox')];
    if (!key) {
      if (shownDecision) {
        modal.hidden = true; shownDecision = null;
        for (const el of inertEls) if (el) el.inert = false;
        // The lists are redrawn all the time, so go back to the same control by name.
        const back = returnKey && (document.querySelector(`[data-key="${returnKey}"]`) || document.getElementById(returnKey));
        (back || $('btnNext')).focus({ preventScroll: true });
        returnKey = null;
      }
      return;
    }
    if (key === shownDecision) return;
    if (!shownDecision) { const a = document.activeElement; returnKey = a && a !== document.body ? (a.dataset.key || a.id || null) : null; }
    shownDecision = key;
    renderDecision(state);
    modal.hidden = false;
    for (const el of inertEls) if (el) el.inert = true;
    const dlg = $('decision');
    dlg.setAttribute('tabindex', '-1');
    dlg.scrollTop = 0;
    dlg.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- the rest
  function updateTime(state) {
    const blocked = !!state.dilemma || !!state.over;
    for (const id of ['btnNext', 'btnFive']) $(id).setAttribute('aria-disabled', blocked ? 'true' : 'false');
    const hint = $('timeHint');
    hint.className = 'hint' + (state.dilemma || state.over ? ' warn' : '');
    hint.textContent = state.over ? 'This civilization has ended. Use Reset in the Game section to start again.'
      : state.dilemma ? 'A decision is waiting.' : `Turn ${state.turn}. Each turn your people forage, eat, gather wood and learn.`;
  }

  function log(text, kind = '', turn = null) {
    const li = h('li', { class: kind }, turn != null ? h('span', { class: 't' }, `T${turn}`) : null, text);
    const list = $('log');
    list.prepend(li);
    while (list.childElementCount > 150) list.lastElementChild.remove();
  }

  function banner(text) {
    const el = $('banner');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.classList.remove('show'), reducedMotion ? 6000 : 5000);
  }

  function update(state, prev) {
    const focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : null;
    $('gName').textContent = state.name;
    $('gEra').textContent = game.eraOf(state, data).name;
    const when = game.calendar(state, data);
    $('gTurn').textContent = `${when.label} \u00B7 turn ${state.turn}`;
    $('clock').textContent = when.label;
    $('clock').classList.toggle('cold', !!when.season.cold);
    $('gScore').textContent = String(score(state)) + (state.rulesModified ? ' (rules changed)' : '');
    $('gSeed').textContent = state.seed;
    updateChips(state, prev);
    updateBuild(state);
    updateExpeditions(state);
    updateRivals(state);
    updateTimeline(state);
    updateLedger(state);
    updateDiscoveries(state);
    updateRules(state);
    updateTime(state);
    updateDecision(state);
    if (focusKey) {
      const again = document.querySelector(`[data-key="${focusKey}"]`);
      if (again && again !== document.activeElement && !document.getElementById('modal').contains(document.activeElement)) again.focus({ preventScroll: true });
    }
  }

  // Buttons that are always there.
  const guard = (fn) => (e) => { if (e.currentTarget.getAttribute('aria-disabled') === 'true') { actions.refuse(); return; } fn(); };
  $('btnNext').addEventListener('click', guard(() => actions.next(1)));
  $('btnFive').addEventListener('click', guard(() => actions.next(5)));
  $('btnSave').addEventListener('click', () => actions.save());
  $('btnLoad').addEventListener('click', () => actions.load());
  $('btnLink').addEventListener('click', () => actions.copyLink());
  $('btnConsole').addEventListener('click', () => actions.toggleConsole());
  $('btnReset').addEventListener('click', () => actions.reset());

  return {
    update, log, banner,
    modalOpen: () => !$('modal').hidden,
    setConsoleOpen(open) { $('btnConsole').setAttribute('aria-expanded', open ? 'true' : 'false'); },
    setReducedMotion(v) { reducedMotion = v; },
  };
}
