// Game actions. Everything here is pure logic on the state object, so it
// runs the same in the browser and in the tests.
import { tick, applyEffects, capacity } from './economy.js';
import { dueDilemma } from './dilemmas.js';
import * as armsRace from './gametheory/armsRace.js';
import { rivalMove, treatyAccepted, updateTrust } from './rivals.js';
import { createState } from './state.js';
import { score } from './scoring.js';

export function newGame(name, seed, data) {
  const state = createState({ name, seed, data });
  state.history.push({ turn: 1, kind: 'start', text: `${name} begins. ${data.eras[0].intro}` });
  return state;
}

export const eraOf = (state, data) => data.eras.find((e) => e.id === state.era);

const eraIndex = (data, id) => data.eras.findIndex((e) => e.id === id);

// The discovery (if any) that unlocks a structure. Structures that no
// discovery mentions are available from the start.
function unlockedBy(data, structureId) {
  return (data.discoveries || []).find((d) => (d.unlocks || []).includes(structureId)) || null;
}

export function isUnlocked(state, data, structureId) {
  const d = unlockedBy(data, structureId);
  return !d || state.discovered.includes(d.id);
}

// What the next one costs: the base cost grows with each one already built.
export function costOf(state, s) {
  const owned = state.structures[s.id] || 0;
  const growth = s.costGrowth || 0;
  const out = {};
  for (const [k, v] of Object.entries(s.cost)) out[k] = Math.round(v * Math.pow(1 + growth, owned));
  return out;
}

// Everything the build menu needs about each structure.
export function structureList(state, data) {
  const here = eraIndex(data, state.era);
  return data.structures.filter((s) => eraIndex(data, s.era) <= here).map((s) => {
    const unlocked = isUnlocked(state, data, s.id);
    const d = unlockedBy(data, s.id);
    const cost = costOf(state, s);
    const missing = Object.entries(cost).filter(([k, v]) => state[k] < v).map(([k, v]) => ({ resource: k, need: v, have: Math.floor(state[k]) }));
    return {
      ...s, cost, owned: state.structures[s.id] || 0, unlocked,
      lockedReason: unlocked ? null : `Reach ${d.at.knowledge} knowledge (${d.name}).`,
      affordable: unlocked && !missing.length, missing,
    };
  });
}

// The next thing knowledge is working toward.
export function nextGoal(state, data) {
  const next = (data.discoveries || []).filter((d) => !state.discovered.includes(d.id) && d.era === state.era)
    .sort((a, b) => a.at.knowledge - b.at.knowledge)[0];
  if (next) return { at: next.at.knowledge, label: next.name, kind: 'discovery' };
  const era = eraOf(state, data);
  if (era && era.advanceAt) return { at: era.advanceAt.knowledge, label: `end of the ${era.name}`, kind: 'era' };
  return null;
}

function checkDiscoveries(state, data, lines) {
  for (const d of data.discoveries || []) {
    if (state.discovered.includes(d.id) || d.era !== state.era) continue;
    if (state.knowledge < d.at.knowledge) continue;
    state.discovered.push(d.id);
    applyEffects(state, d.effects || {});
    const text = `Discovery: ${d.name}. ${d.text}`;
    state.history.push({ turn: state.turn, kind: 'discovery', text });
    lines.push({ kind: 'discovery', text });
  }
}
export const rivalById = (state, id) => state.rivals.find((r) => r.id === id);

// After each turn: has anything come up that needs the player?
function trigger(state, data, lines) {
  if (state.over) return;
  checkDiscoveries(state, data, lines);
  const era = eraOf(state, data);
  if (era.advanceAt && state.knowledge >= era.advanceAt.knowledge && !state.flags.eraReady) {
    state.flags.eraReady = true;
    const next = data.eras.find((e) => e.id === era.next);
    if (next) {
      state.era = next.id;
      state.flags.eraReady = false;
      state.history.push({ turn: state.turn, kind: 'era', text: `The ${next.name} begins.` });
      lines.push({ kind: 'era', text: `The ${next.name} begins. ${next.intro}` });
    } else {
      state.history.push({ turn: state.turn, kind: 'era', text: `Ready to leave the ${era.name}. Score at this point: ${score(state)}.` });
      lines.push({ kind: 'era', text: `Your people know enough to leave the ${era.name}. The next era isn't built yet, so this is the end of the current build. Score: ${score(state)}. You can keep playing.` });
    }
  }
  if (state.turn >= 3 && !state.flags.exploreHint && !state.parties.length && !state.history.some((h) => h.kind === 'expedition')) {
    state.flags.exploreHint = true;
    lines.push({ kind: 'alert', text: 'Some of the band want to see what lies beyond the hills. Open Expeditions to send a party out. They come back with knowledge.' });
  }
  if (state.dilemma) return;
  const rival = state.rivals[0];
  if (rival && state.turn >= state.nextArmsTurn) {
    state.dilemma = { type: 'armsRace', rival: rival.id, turn: state.turn };
    state.nextArmsTurn = state.turn + state.rules.armsRaceInterval;
  } else {
    const d = dueDilemma(state, data);
    if (d) state.dilemma = { type: 'choice', id: d.id, turn: state.turn };
  }
  if (state.dilemma) lines.push({ kind: 'alert', text: 'A decision is waiting. Type "decide" to read it.' });
}

// Advance up to n turns. Stops early when a decision is waiting.
export function advance(state, data, n = 1) {
  const lines = [];
  let done = 0;
  while (done < n) {
    if (state.over) { lines.push({ kind: 'alert', text: 'This civilization has ended. Type "reset" to start again.' }); break; }
    if (state.dilemma) { lines.push({ kind: 'alert', text: 'A decision is waiting. Type "decide" to read it, then "choose A" or "choose B".' }); break; }
    const turn = state.turn;
    for (const e of tick(state, data)) lines.push({ kind: 'event', text: `Turn ${turn}: ${e}` });
    done += 1;
    trigger(state, data, lines);
    if (state.dilemma || state.over) break;
  }
  return { lines, done };
}

// The card currently waiting, with everything needed to show it.
export function currentCard(state, data) {
  const d = state.dilemma;
  if (!d) return null;
  if (d.type === 'armsRace') {
    const rival = rivalById(state, d.rival);
    const R = state.rules;
    return {
      type: 'armsRace', rival,
      title: `Border posture: ${rival.name}`,
      text: `Hunters from the ${rival.name} range close to your camp, and yours to theirs. Each side must decide whether to keep its spears stacked or make more.`,
      options: {
        A: { label: 'Disarm', upside: 'No food spent on arms. If they disarm too, both sides are safer, and they trust you more.',
          cost: `If they build, they raid you: you lose ${Math.round(R.raidLoss * 100)}% of your stored food.` },
        B: { label: 'Build arms', upside: `You can't be raided. If they disarm, they send ${R.tribute} food to keep the peace.`,
          cost: `${R.armsCost} food now, ${R.armsUpkeep} food per turn in upkeep, and they trust you less.` },
      },
      matrix: armsRace.matrix(), explain: armsRace.explain(),
    };
  }
  const card = data.dilemmas.find((x) => x.id === d.id);
  return { type: 'choice', ...card };
}

export function choose(state, data, key) {
  const d = state.dilemma;
  if (!d) return { ok: false, lines: [{ kind: 'error', text: 'Nothing to decide right now.' }] };
  key = String(key || '').toUpperCase();
  if (key !== 'A' && key !== 'B') return { ok: false, lines: [{ kind: 'error', text: 'Choose A or B.' }] };
  const lines = [];

  if (d.type === 'armsRace') {
    const rival = rivalById(state, d.rival);
    const pledged = !!(state.treaty && state.treaty.rival === rival.id);
    const you = key === 'A' ? 'C' : 'D';
    const them = rivalMove(rival, data, { treaty: pledged });
    applyEffects(state, armsRace.effects(you, them, state));
    state.arms = you === 'D' ? state.arms + 1 : Math.max(0, state.arms - 1);
    rival.arms = them === 'D' ? rival.arms + 1 : Math.max(0, rival.arms - 1);
    rival.rounds.push({ turn: state.turn, you, them, pledged });
    updateTrust(rival, you, state.rules, { brokeTreaty: pledged && you === 'D' });
    const [mine, theirs] = armsRace.payoff(you, them);
    let text = `${armsRace.describe(you, them, rival.name)} Security: you ${mine}, them ${theirs}.`;
    if (pledged && you === 'D') text += ' You had pledged to disarm. They will remember.';
    if (pledged && them === 'D') text += ' They had accepted your pledge, and built anyway.';
    state.treaty = null;
    state.history.push({ turn: state.turn, kind: 'decision', text: `Border with the ${rival.name}: you chose to ${armsRace.MOVES[you]}, they chose to ${armsRace.MOVES[them]}. ${text}` });
    lines.push({ kind: 'result', text });
    lines.push({ kind: 'info', text: `${rival.name} trust in you: ${rival.trust}.` });
  } else {
    const card = data.dilemmas.find((x) => x.id === d.id);
    const opt = card.options[key];
    applyEffects(state, opt.now);
    for (const l of opt.later || []) {
      state.pending.push({ due: state.turn + l.after, text: l.text, effects: l.effects, from: { turn: state.turn, id: card.id, label: opt.label } });
    }
    for (const f of opt.flags || []) state.flags[f] = true;
    for (const id of opt.locks || []) if (!state.locks.includes(id)) state.locks.push(id);
    state.resolved.push(card.id);
    state.history.push({ turn: state.turn, kind: 'decision', text: `${card.title}: you chose "${opt.label}".` });
    lines.push({ kind: 'result', text: `Decided: ${opt.label}.` });
    if ((opt.later || []).length) lines.push({ kind: 'info', text: 'Some consequences will take time to arrive. They will show up in "history".' });
    if ((opt.locks || []).length) lines.push({ kind: 'info', text: 'This choice closes off some future options.' });
  }
  state.dilemma = null;
  return { ok: true, lines };
}

// Structures the player can build right now (unlocked, in this era or earlier).
export function availableStructures(state, data) {
  return structureList(state, data).filter((s) => s.unlocked);
}

export function build(state, data, id) {
  const list = structureList(state, data);
  const s = list.find((x) => x.id === String(id || '').toLowerCase());
  if (!s) return { ok: false, lines: [{ kind: 'error', text: `Unknown structure. You can build: ${list.filter((x) => x.unlocked).map((x) => x.id).join(', ')}.` }] };
  if (state.over) return { ok: false, lines: [{ kind: 'error', text: 'This civilization has ended.' }] };
  if (!s.unlocked) return { ok: false, lines: [{ kind: 'error', text: `${s.name} isn't possible yet. ${s.lockedReason}` }] };
  if (s.missing.length) {
    const need = s.missing.map((m) => `${m.need} ${m.resource} (you have ${m.have})`).join(' and ');
    return { ok: false, lines: [{ kind: 'error', text: `Not enough to build a ${s.name.toLowerCase()}: needs ${need}.` }] };
  }
  const spend = {};
  for (const [k, v] of Object.entries(s.cost)) spend[k] = -v;
  applyEffects(state, spend);
  state.structures[s.id] = (state.structures[s.id] || 0) + 1;
  const paid = Object.entries(s.cost).map(([k, v]) => `${v} ${k}`).join(' and ');
  state.history.push({ turn: state.turn, kind: 'build', text: `Built a ${s.name.toLowerCase()} for ${paid} (${state.structures[s.id]} in total).` });
  return { ok: true, structure: s, spent: s.cost, lines: [{ kind: 'result', text: `Built a ${s.name.toLowerCase()} for ${paid}. You now have ${state.structures[s.id]}.` }] };
}

// Expeditions: send a small party out; it comes home with knowledge.
export function expeditionList(state, data) {
  const away = state.parties.length > 0;
  return (data.expeditions || []).map((e) => {
    const missing = Object.entries(e.cost).filter(([k, v]) => state[k] < v).map(([k, v]) => ({ resource: k, need: v, have: Math.floor(state[k]) }));
    const tooFew = state.pop < e.people + 4;
    const locked = state.knowledge < (e.minKnowledge || 0);
    let blocked = null;
    if (locked) blocked = `Needs ${e.minKnowledge} knowledge.`;
    else if (away) blocked = 'A party is already out.';
    else if (tooFew) blocked = `Needs ${e.people + 4} people (so ${e.people} can go and 4 stay).`;
    else if (missing.length) blocked = `Needs ${missing.map((m) => `${m.need} ${m.resource}`).join(' and ')}.`;
    return { ...e, locked, missing, blocked, available: !blocked };
  });
}

export function explore(state, data, id) {
  const list = expeditionList(state, data);
  const e = list.find((x) => x.id === String(id || '').toLowerCase());
  if (!e) return { ok: false, lines: [{ kind: 'error', text: `Unknown expedition. Options: ${list.map((x) => x.id).join(', ')}.` }] };
  if (state.over) return { ok: false, lines: [{ kind: 'error', text: 'This civilization has ended.' }] };
  if (e.blocked) return { ok: false, lines: [{ kind: 'error', text: `Can't send "${e.name}": ${e.blocked}` }] };
  const spend = {};
  for (const [k, v] of Object.entries(e.cost)) spend[k] = -v;
  applyEffects(state, spend);
  state.pop -= e.people;
  state.parties.push({ id: e.id, start: state.turn, due: state.turn + e.turns - 1, people: e.people });
  const paid = Object.entries(e.cost).map(([k, v]) => `${v} ${k}`).join(' and ');
  state.history.push({ turn: state.turn, kind: 'expedition', text: `Sent out "${e.name}" (${e.people} people, ${e.turns} turns, ${paid}).` });
  return { ok: true, expedition: e, lines: [{ kind: 'result', text: `${e.text} They set out with ${paid}, and should be back in ${e.turns} turns.` }] };
}

export const TREATIES = ['disarmament'];

export function propose(state, data, treaty) {
  treaty = String(treaty || '').toLowerCase();
  if (!TREATIES.includes(treaty)) {
    return { ok: false, lines: [{ kind: 'error', text: `In this build you can propose: ${TREATIES.join(', ')}. Fishery quotas and joint projects come with later eras.` }] };
  }
  const rival = state.rivals[0];
  if (!rival) return { ok: false, lines: [{ kind: 'error', text: 'There is no one to propose it to.' }] };
  if (state.treaty) return { ok: false, lines: [{ kind: 'error', text: `A disarmament pledge with the ${rival.name} already stands until the next border decision.` }] };
  if (!treatyAccepted(rival, data)) {
    state.history.push({ turn: state.turn, kind: 'treaty', text: `The ${rival.name} refused a disarmament pledge.` });
    return { ok: true, accepted: false, lines: [{ kind: 'result', text: `The ${rival.name} refuse. They don't trust you enough (trust ${rival.trust}).` }] };
  }
  state.treaty = { type: 'disarmament', rival: rival.id, turn: state.turn };
  state.history.push({ turn: state.turn, kind: 'treaty', text: `You and the ${rival.name} pledged to disarm at the next border decision.` });
  return { ok: true, accepted: true, lines: [{ kind: 'result', text: `The ${rival.name} accept. Both sides pledge to disarm at the next border decision. A pledge is only words: either side can still break it, at a cost in trust.` }] };
}

// Change one underlying constant (the substrate view).
export function setRule(state, data, key, value) {
  if (!(key in state.rules)) return { ok: false, lines: [{ kind: 'error', text: `No rule called "${key}". Type "reveal rules" to list them.` }] };
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return { ok: false, lines: [{ kind: 'error', text: 'A rule needs a number, zero or higher.' }] };
  const before = state.rules[key];
  state.rules[key] = num;
  state.rulesModified = true;
  state.history.push({ turn: state.turn, kind: 'rules', text: `Rule changed: ${key} from ${before} to ${num}.` });
  return { ok: true, lines: [{ kind: 'result', text: `${key}: ${before} -> ${num}. This run's score is now marked as played with changed rules.` }] };
}

// A text description of what the map shows.
export function mapSummary(state, data) {
  const era = eraOf(state, data);
  const parts = Object.entries(state.structures).filter(([, n]) => n > 0)
    .map(([id, n]) => `${n} ${data.structures.find((x) => x.id === id).name.toLowerCase()}${n === 1 ? '' : 's'}`);
  const built = parts.length ? parts.join(', ') : 'nothing built yet';
  const away = state.parties.length ? ` A party of ${state.parties[0].people} is away on an expedition.` : '';
  return `Map: a pixel-art river valley. A blue river winds from top to bottom through green grassland, with forest and hills away from the water. ` +
    `${state.name}'s camp sits on the bank with ${built}. ${state.pop} ${state.pop === 1 ? 'settler walks' : 'settlers walk'} between the camp, the river and the foraging grounds.${away} ` +
    `${era.name}, turn ${state.turn}. Shelter for ${capacity(state, data)}.` + (state.flags.weir ? ' A stone weir crosses the river.' : '');
}
