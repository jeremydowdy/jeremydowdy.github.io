// Terminal commands. This file has no DOM code: each command returns lines
// of text ({ text, cls }), and anything that touches the page goes through
// the `host` object passed in. That keeps the commands testable in Node.
import * as game from './game.js';
import { capacity, forecast, people } from './economy.js';
import { record } from './rivals.js';
import { score } from './scoring.js';
import { MOVES } from './gametheory/armsRace.js';
import { completeWord } from './terminal-complete.js';

const THEMES = ['green', 'amber', 'white'];
const SPEEDS = ['normal', 'instant', 'slow'];
const COMMANDS = ['help', 'status', 'build', 'explore', 'decide', 'choose', 'rivals', 'propose', 'wait', 'timeline', 'history',
  'reveal', 'set', 'map', 'seed', 'clear', 'save', 'load', 'reset'];

const L = (text = '', cls = '') => ({ text, cls });
const n0 = (x) => String(Math.round(x));
const n1 = (x) => (Math.round(x * 10) / 10).toString();
const signed = (x, digits = 1) => (x > 0 ? '+' : '') + (digits ? n1(x) : n0(x));

const MOD_LABELS = {
  foodPerTurn: (v) => `${signed(v)} food per turn`,
  energyPerTurn: (v) => `${signed(v)} energy per turn`,
  knowledgePerTurn: (v) => `${signed(v)} knowledge per turn`,
  stabilityPerTurn: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100) / 100} stability per turn`,
  forageMult: (v) => `foraging ${signed(v * 100, 0)}%`,
  knowledgeMult: (v) => `knowledge gain ${signed(v * 100, 0)}%`,
  spoilMult: (v) => `spoilage ${signed(v * 100, 0)}%`,
};

export function describeEffects(fx = {}) {
  const parts = [];
  for (const k of ['pop', 'food', 'energy', 'knowledge', 'stability']) {
    if (typeof fx[k] === 'number' && fx[k] !== 0) parts.push(`${k === 'pop' ? 'population' : k} ${signed(fx[k])}`);
  }
  if (typeof fx.trust === 'number' && fx.trust !== 0) parts.push(`rival trust ${signed(fx.trust)}`);
  for (const [k, v] of Object.entries(fx.mods || {})) if (v !== 0 && MOD_LABELS[k]) parts.push(MOD_LABELS[k](v));
  return parts.length ? parts.join(', ') : 'no immediate change';
}

function statusLines(state, data) {
  const era = game.eraOf(state, data);
  const cap = capacity(state, data);
  const f = forecast(state, data);
  const when = game.calendar(state, data);
  const goal = game.nextGoal(state, data);
  const built = Object.entries(state.structures).filter(([, n]) => n > 0).map(([id, n]) => `${id} x${n}`).join(', ') || 'none';
  const lines = [
    L(`${state.name}: ${era.name}, ${when.label}, turn ${state.turn}`, 'head'),
    L(`  population  ${people(state)}   (${state.pop} adults, ${state.kids} ${state.kids === 1 ? 'child' : 'children'}; room for ${cap}${people(state) > cap ? ', crowded' : ''})`),
    L(`  food        ${n0(state.food)}   (${signed(f.food)} per turn${when.seasonal ? ' this ' + when.season.name.toLowerCase() : ''})`),
    L(`  energy      ${n0(state.energy)}`),
    L(`  knowledge   ${n1(state.knowledge)}` + (goal ? `   (next: ${goal.label} at ${goal.at})` : '')),
    L(`  stability   ${n0(state.stability)} / 100`),
    L(`  arms        ${state.arms}`),
    L(`  structures  ${built}`),
    L(`  score       ${score(state)}` + (state.rulesModified ? '   (rules changed)' : '')),
  ];
  if (state.parties.length) {
    const p = state.parties[0];
    lines.push(L(`  A party of ${p.people} is away; back in ${Math.max(1, p.due - state.turn + 1)} turns.`, 'dim'));
  }
  if (state.treaty) lines.push(L('  A pledge to disarm stands until the next border decision.', 'dim'));
  if (state.dilemma) lines.push(L('  A decision is waiting. Type "decide".', 'alert'));
  if (state.over) lines.push(L('  This civilization has ended. Type "reset" to start again.', 'alert'));
  return lines;
}

function decideLines(state, data) {
  const card = game.currentCard(state, data);
  if (!card) {
    const next = state.nextArmsTurn;
    return [L(`Nothing to decide right now. The next border decision comes around turn ${next}. Type "wait" to pass time.`)];
  }
  const lines = [L(`DECISION: ${card.title}   (turn ${state.dilemma.turn})`, 'head'), L(card.text), L()];
  for (const key of ['A', 'B']) {
    const o = card.options[key];
    lines.push(L(`  ${key}) ${o.label}`, 'head'));
    lines.push(L(`     upside: ${o.upside}`));
    lines.push(L(`     cost:   ${o.cost}`));
    if (card.type === 'choice') {
      lines.push(L(`     now:    ${describeEffects(o.now)}`, 'dim'));
      for (const l of o.later || []) lines.push(L(`     later:  in about ${l.after} turns, ${describeEffects(l.effects)}`, 'dim'));
      if ((o.locks || []).length) lines.push(L(`     closes off: ${o.locks.join(', ')}`, 'dim'));
    }
  }
  lines.push(L());
  if (card.type === 'armsRace') {
    const m = card.matrix;
    const cell = (k) => `${m[k][0]}, ${m[k][1]}`.padEnd(14);
    lines.push(L('Payoff matrix: security points as (you, them)'));
    lines.push(L(`                  they disarm   they build`, 'dim'));
    lines.push(L(`  A) you disarm   ${cell('CC')}${cell('CD')}`));
    lines.push(L(`  B) you build    ${cell('DC')}${cell('DD')}`));
    lines.push(L());
    lines.push(L(`Why both sides often build: ${card.explain}`, 'dim'));
    const rec = record(card.rival);
    const strat = data.rivals.strategies[card.rival.strategy];
    lines.push(L(`${card.rival.name}: ${strat.label}. Trust in you: ${card.rival.trust}. ` +
      (rec.rounds ? `In ${rec.rounds} round${rec.rounds === 1 ? '' : 's'} you disarmed ${rec.youDisarmed} and built ${rec.youBuilt}; they disarmed ${rec.theyDisarmed}.` : 'No history yet.')));
    if (state.treaty) lines.push(L('Both sides have pledged to disarm this round.'));
  } else {
    lines.push(L('Payoff table: what each option changes', 'dim'));
    for (const key of ['A', 'B']) {
      const o = card.options[key];
      const later = (o.later || []).map((l) => `${describeEffects(l.effects)} (turn +${l.after})`).join('; ') || 'nothing more';
      lines.push(L(`  ${key}  now: ${describeEffects(o.now)}  |  later: ${later}`));
    }
  }
  lines.push(L());
  lines.push(L('Type "choose A" or "choose B". Time is stopped until you decide.'));
  return lines;
}

function rivalsLines(state, data) {
  if (!state.rivals.length) return [L('No rivals in this world.')];
  const lines = [];
  for (const r of state.rivals) {
    const strat = data.rivals.strategies[r.strategy];
    const rec = record(r);
    lines.push(L(`${r.name}`, 'head'));
    lines.push(L(`  strategy  ${strat.label}: ${strat.description}`));
    lines.push(L(`  trust     ${r.trust} / 100`));
    lines.push(L(`  arms      ${r.arms}`));
    if (!rec.rounds) lines.push(L('  history   no border decisions yet'));
    else {
      lines.push(L(`  history   ${rec.rounds} round${rec.rounds === 1 ? '' : 's'}: you disarmed ${rec.youDisarmed}, built ${rec.youBuilt}; they disarmed ${rec.theyDisarmed}, built ${rec.rounds - rec.theyDisarmed}`));
      for (const round of r.rounds.slice(-8)) {
        lines.push(L(`            turn ${String(round.turn).padStart(3)}: you ${MOVES[round.you].padEnd(7)} they ${MOVES[round.them]}${round.pledged ? '   (pledge in force)' : ''}`, 'dim'));
      }
    }
  }
  if (state.treaty) lines.push(L('A pledge to disarm stands until the next border decision.'));
  return lines;
}

function timelineLines(state, arg) {
  const n = arg === 'all' ? state.timeline.length : 12;
  const recs = state.timeline.slice(-n);
  if (!recs.length) return [L('Nothing has happened yet. Type "wait" to let a turn pass.')];
  const lines = [L(arg === 'all' || recs.length === state.timeline.length ? 'Timeline' : `Timeline (last ${recs.length} of ${state.timeline.length} turns; "timeline all" shows everything)`, 'head')];
  for (const r of recs) {
    const flow = [r.born ? `+${r.born} born` : '', r.died ? `-${r.died} died` : '', r.left ? `-${r.left} left` : ''].filter(Boolean).join(', ');
    lines.push(L(`  turn ${String(r.turn).padStart(3)}  ${r.label.padEnd(16)} people ${String(r.pop + r.kids).padStart(3)}${flow ? ` (${flow})` : ''}  food ${n0(r.food)}`, r.left || r.died >= 3 ? '' : 'dim'));
  }
  return lines;
}

function historyLines(state, arg) {
  const all = arg === 'all';
  const items = all ? state.history : state.history.slice(-20);
  const lines = [L(all || items.length === state.history.length ? 'History' : `History (last ${items.length} of ${state.history.length}; "history all" shows everything)`, 'head')];
  for (const h of items) lines.push(L(`  turn ${String(h.turn).padStart(3)}  ${h.text}`, h.kind === 'consequence' ? '' : 'dim'));
  const waiting = state.pending.length;
  if (waiting) lines.push(L(`  ${waiting} consequence${waiting === 1 ? ' is' : 's are'} still on the way.`));
  return lines;
}

function rulesLines(state, data) {
  const lines = [L('The rules underneath (the constants this world runs on)', 'head')];
  const width = Math.max(...Object.keys(state.rules).map((k) => k.length));
  for (const [key, value] of Object.entries(state.rules)) {
    const def = data.rules[key];
    const changed = def && def.value !== value ? `   (was ${def.value})` : '';
    lines.push(L(`  ${key.padEnd(width)}  ${String(value).padEnd(6)} ${def ? def.label : ''}${changed}`, changed ? '' : 'dim'));
  }
  lines.push(L());
  lines.push(L('Change one with: set rule <name> <value>   e.g. set rule foragePerPerson 2'));
  lines.push(L('A run with changed rules is marked, since its score no longer compares with others.', 'dim'));
  return lines;
}

function buildListLines(state, data) {
  const lines = [L('Build', 'head')];
  for (const s of game.structureList(state, data)) {
    const cost = Object.entries(s.cost).map(([k, v]) => `${v} ${k}`).join(', ');
    if (!s.unlocked) lines.push(L(`  ${s.id.padEnd(12)} locked. ${s.lockedReason}`, 'dim'));
    else lines.push(L(`  ${s.id.padEnd(12)} ${cost.padEnd(18)} ${s.description}`));
  }
  lines.push(L(`You have ${n0(state.food)} food and ${n0(state.energy)} energy. Example: build campfire`, 'dim'));
  return lines;
}

function exploreListLines(state, data) {
  const lines = [L('Expeditions', 'head')];
  for (const e of game.expeditionList(state, data)) {
    const cost = Object.entries(e.cost).map(([k, v]) => `${v} ${k}`).join(', ');
    lines.push(L(`  ${e.id.padEnd(13)} ${e.people} people, ${e.turns} turns, ${cost}; +${e.reward.knowledge || 0} knowledge`));
    lines.push(L(`  ${''.padEnd(13)} ${e.blocked ? 'Not now: ' + e.blocked : e.text}`, 'dim'));
  }
  lines.push(L('Example: explore scout-hills', 'dim'));
  return lines;
}

const HELP = [
  ['status', 'population, food, energy, knowledge, stability, era and turn'],
  ['wait [n]', 'let n turns pass (1 if you leave n out, 50 at most)'],
  ['build <structure>', 'spend resources on a structure; "build" alone lists them'],
  ['explore <expedition>', 'send a party out to learn; "explore" alone lists them'],
  ['decide', 'read the decision that is waiting, with both options and their costs'],
  ['choose <A|B>', 'pick an option'],
  ['rivals', "each rival's strategy, history with you and trust"],
  ['propose <treaty>', 'offer a deal; in this build: propose disarmament'],
  ['timeline', 'what happened each turn: the date, births, deaths, people who left'],
  ['history', 'past decisions and the consequences that followed'],
  ['reveal rules', 'show the constants underneath; "set rule <name> <value>" changes one'],
  ['map', 'describe the map in words'],
  ['seed', 'show this run\'s seed and a link that replays it'],
  ['set theme <green|amber|white>', 'change the phosphor color'],
  ['set speed <normal|instant|slow>', 'how fast text appears'],
  ['save / load', 'save to this browser, or load the last save'],
  ['clear', 'clear the screen'],
  ['reset', 'erase this civilization and start over'],
];

export function createCommands({ data, host }) {
  let resetArmed = false;
  const get = () => host.getState();

  function after(kind, extra) { host.changed(kind, extra); }

  function turnSummary(state) {
    return L(`Turn ${state.turn}. Population ${n0(state.pop)}, food ${n0(state.food)}, energy ${n0(state.energy)}, knowledge ${n1(state.knowledge)}, stability ${n0(state.stability)}.`);
  }

  function run(raw) {
    const state = get();
    const text = raw.trim();
    const words = text.split(/\s+/);
    const cmd = (words[0] || '').toLowerCase();
    const arg = (words[1] || '').toLowerCase();
    const wasArmed = resetArmed;
    resetArmed = false;
    if (!cmd) return [];

    switch (cmd) {
      case 'help': case '?': {
        const width = Math.max(...HELP.map(([c]) => c.length));
        return [L('Commands', 'head'), ...HELP.map(([c, d]) => L(`  ${c.padEnd(width)}  ${d}`)),
          L(), L('Up and down arrows recall earlier commands. Tab completes. Esc clears the line.', 'dim')];
      }
      case 'status': return statusLines(state, data);
      case 'decide': return decideLines(state, data);
      case 'rivals': return rivalsLines(state, data);
      case 'history': return historyLines(state, arg);
      case 'timeline': return timelineLines(state, arg);
      case 'map': return [L(game.mapSummary(state, data))];
      case 'seed': return [L(`Seed: ${state.seed}`), L(`Replay link: ${host.shareUrl(state.seed)}`),
        L('The same seed and the same choices always give the same score.' + (state.rulesModified ? ' (This run has changed rules.)' : ''), 'dim')];
      case 'clear': host.clear(); return [];

      case 'wait': {
        let n = 1;
        if (words[1] !== undefined) {
          n = Number(words[1]);
          if (!Number.isInteger(n) || n < 1) return [L('Usage: wait [n], where n is a whole number of turns, like "wait 5".', 'error')];
          if (n > 50) n = 50;
        }
        const res = game.advance(state, data, n);
        const lines = res.lines.map((l) => L(l.text, l.kind === 'alert' || l.kind === 'era' ? 'alert' : ''));
        if (res.done) lines.push(turnSummary(state));
        after('turn', { turns: res.done, era: res.lines.some((l) => l.kind === 'era') });
        return lines;
      }

      case 'build': {
        if (!arg) return buildListLines(state, data);
        const res = game.build(state, data, arg);
        if (res.ok) after('build', { id: res.structure.id });
        return res.lines.map((l) => L(l.text, l.kind === 'error' ? 'error' : ''));
      }

      case 'explore': {
        if (!arg) return exploreListLines(state, data);
        const res = game.explore(state, data, arg);
        if (res.ok) after('explore');
        return res.lines.map((l) => L(l.text, l.kind === 'error' ? 'error' : ''));
      }

      case 'choose': {
        const res = game.choose(state, data, arg);
        if (res.ok) after('choose');
        return res.lines.map((l) => L(l.text, l.kind === 'error' ? 'error' : l.kind === 'info' ? 'dim' : ''));
      }

      case 'propose': {
        if (!arg) return [L('Usage: propose <treaty>. In this build: propose disarmament', 'error')];
        const res = game.propose(state, data, arg);
        if (res.ok) after('propose');
        return res.lines.map((l) => L(l.text, l.kind === 'error' ? 'error' : ''));
      }

      case 'reveal': {
        if (arg !== 'rules') return [L('Usage: reveal rules', 'error')];
        return rulesLines(state, data);
      }

      case 'set': {
        const value = words[2];
        if (arg === 'theme') {
          if (!THEMES.includes((value || '').toLowerCase())) return [L(`Usage: set theme <${THEMES.join('|')}>`, 'error')];
          host.setTheme(value.toLowerCase());
          return [L(`Theme: ${value.toLowerCase()}.`)];
        }
        if (arg === 'speed') {
          if (!SPEEDS.includes((value || '').toLowerCase())) return [L(`Usage: set speed <${SPEEDS.join('|')}>`, 'error')];
          host.setSpeed(value.toLowerCase());
          return [L(`Text speed: ${value.toLowerCase()}.`)];
        }
        if (arg === 'rule') {
          const key = Object.keys(state.rules).find((k) => k.toLowerCase() === (value || '').toLowerCase());
          if (!key || words[3] === undefined) return [L('Usage: set rule <name> <value>. Type "reveal rules" to list them.', 'error')];
          const res = game.setRule(state, data, key, words[3]);
          if (res.ok) after('rule');
          return res.lines.map((l) => L(l.text, l.kind === 'error' ? 'error' : ''));
        }
        return [L('Usage: set theme <green|amber|white>, set speed <normal|instant|slow>, or set rule <name> <value>', 'error')];
      }

      case 'save': {
        const persisted = host.save();
        return [L(persisted ? `Saved ${state.name} at turn ${state.turn} in this browser.`
          : 'This browser is blocking storage, so the save is held in memory only. It will be lost when you close or reload the page.', persisted ? '' : 'alert')];
      }
      case 'load': {
        const loaded = host.load();
        if (!loaded) return [L('No saved civilization found in this browser.', 'error')];
        return [L(`Loaded ${loaded.name}, turn ${loaded.turn}.`), ...statusLines(loaded, data)];
      }
      case 'reset': {
        if (arg === 'confirm' && wasArmed) { host.reset(); return []; }
        resetArmed = true;
        return [L(`This erases ${state.name} and its save. Type "reset confirm" to go ahead.`, 'alert')];
      }
      default:
        return [L(`Unknown command: ${cmd}. Type "help" for the list.`, 'error')];
    }
  }

  // Tab completion for the current input line.
  function complete(line) {
    const state = get();
    const parts = line.split(/\s+/);
    const endsWithSpace = /\s$/.test(line);
    const done = endsWithSpace ? parts.filter(Boolean) : parts.slice(0, -1);
    const typing = endsWithSpace ? '' : parts[parts.length - 1];
    let candidates = [];
    if (done.length === 0) candidates = COMMANDS;
    else {
      const [c, a] = done.map((w) => w.toLowerCase());
      if (done.length === 1) {
        candidates = {
          build: game.availableStructures(state, data).map((s) => s.id), explore: (data.expeditions || []).map((e) => e.id), choose: ['A', 'B'], propose: game.TREATIES,
          reveal: ['rules'], set: ['theme', 'speed', 'rule'], history: ['all'], timeline: ['all'], reset: ['confirm'],
        }[c] || [];
      } else if (done.length === 2 && c === 'set') {
        candidates = { theme: THEMES, speed: SPEEDS, rule: Object.keys(state.rules) }[a] || [];
      }
    }
    const { word, matches } = completeWord(typing, candidates);
    const head = done.join(' ');
    return { value: (head ? head + ' ' : '') + word, options: matches };
  }

  return { run, complete, statusLines: () => statusLines(get(), data) };
}
