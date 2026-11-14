// Random events: gambles where the outcome is drawn from weighted choices.
// The odds can shift with how much the rival trusts you, how well armed you
// are, and what you've already learned (for example, which mushrooms are
// safe). Everything is data in events.json; the seeded random stream makes a
// run repeatable.
import { nextRandom } from './rng.js';
import { applyEffects, removeAdults } from './economy.js';

const avgTrust = (state) => (state.rivals.length ? state.rivals.reduce((n, r) => n + r.trust, 0) / state.rivals.length : 50);

function allowed(state, o) {
  const q = o.requires;
  if (!q) return true;
  if (q.knowledge != null && state.knowledge < q.knowledge) return false;
  if (q.notFlag && state.flags[q.notFlag]) return false;
  if (q.flag && !state.flags[q.flag]) return false;
  return true;
}

// The weight of each outcome right now. Zero means it can't happen.
export function outcomeWeights(state, outcomes) {
  const trust = avgTrust(state);
  return outcomes.map((o) => {
    if (!allowed(state, o)) return 0;
    let w = o.weight + ((o.trust || 0) * (trust - 50)) / 50 + (o.arms || 0) * state.arms;
    for (const [k, v] of Object.entries(o.perFlag || {})) w += (state.flags[k] || 0) * v;
    return Math.max(0, w);
  });
}

export function rollOutcome(state, outcomes) {
  const weights = outcomeWeights(state, outcomes);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return outcomes.find((o) => allowed(state, o)) || outcomes[0];
  let r = nextRandom(state) * total;
  let pick = -1;
  for (let i = 0; i < outcomes.length; i++) {
    if (weights[i] <= 0) continue;
    pick = i;
    r -= weights[i];
    if (r < 0) break;
  }
  return outcomes[pick];
}

// Raids hurt less when you are well armed.
function scaleRaid(fx, state) {
  const k = Math.max(0.4, 1 - 0.15 * state.arms);
  const out = { ...fx };
  if (out.food < 0) out.food = Math.round(out.food * k * 10) / 10;
  if (out.pop < 0) out.pop = Math.round(out.pop * k);
  return out;
}

export function resolve(state, outcome) {
  const fx = outcome.raid ? scaleRaid(outcome.effects, state) : outcome.effects;
  applyEffects(state, fx);
  for (const f of outcome.flags || []) state.flags[f] = true;
  for (const [k, v] of Object.entries(outcome.setFlags || {})) {
    state.flags[k] = typeof v === 'string' && v.startsWith('+') ? (state.flags[k] || 0) + Number(v.slice(1)) : v;
  }
  const bad = (fx.pop || 0) < 0 || (fx.stability || 0) < 0 || (fx.food || 0) < 0;
  const good = (fx.knowledge || 0) > 0 || (fx.food || 0) > 0 || (fx.stability || 0) > 0;
  return { text: outcome.text, tone: bad && !good ? 'bad' : good && !bad ? 'good' : '', then: outcome.then || null };
}

// ---------------------------------------------------------------- inviting the rival
export function inviteInfo(state, data) {
  const cfg = data.events.invite;
  const rival = state.rivals[0] || null;
  const readyIn = Math.max(0, state.cooldowns.invite - state.turn);
  const missing = Object.entries(cfg.cost).filter(([k, v]) => state[k] < v);
  let blocked = null;
  if (!rival) blocked = 'There is no one to invite.';
  else if (state.over) blocked = 'This civilization has ended.';
  else if (state.dilemma) blocked = 'A decision is waiting.';
  else if (readyIn > 0) blocked = `Ready in ${readyIn} turn${readyIn === 1 ? '' : 's'}.`;
  else if (missing.length) blocked = `Needs ${missing.map(([k, v]) => `${v} ${k}`).join(' and ')} for the gift.`;
  return { ...cfg, rival, readyIn, blocked, available: !blocked };
}

export function invite(state, data) {
  const info = inviteInfo(state, data);
  if (info.blocked) return { ok: false, lines: [{ kind: 'error', text: `Can't invite them: ${info.blocked}` }] };
  const spend = {};
  for (const [k, v] of Object.entries(info.cost)) spend[k] = -v;
  applyEffects(state, spend);
  const outcome = rollOutcome(state, info.outcomes);
  const res = resolve(state, outcome);
  state.cooldowns.invite = state.turn + info.cooldown;
  state.cooldowns.prompted = false;
  const paid = Object.entries(info.cost).map(([k, v]) => `${v} ${k}`).join(' and ');
  const text = `You invited the ${info.rival.name}, with a gift of ${paid}. ${res.text}`;
  state.history.push({ turn: state.turn, kind: 'event', text });
  const lines = [{ kind: 'result', tone: res.tone, text }];
  if (res.then) {
    state.dilemma = { type: 'event', id: res.then, turn: state.turn };
    lines.push({ kind: 'alert', text: 'A decision is waiting. Type "decide" to read it.' });
  }
  return { ok: true, outcome, lines };
}

// ---------------------------------------------------------------- event cards
export function eventCard(state, data, id) {
  const ev = data.events[id];
  const options = {};
  for (const k of ['A', 'B']) options[k] = { label: ev.options[k].label, upside: ev.options[k].upside, cost: ev.options[k].cost };
  return { type: 'event', id, title: ev.title, text: ev.text, options, random: true };
}

export function chooseEvent(state, data, id, key) {
  const opt = data.events[id].options[key];
  const outcome = rollOutcome(state, opt.outcomes);
  const res = resolve(state, outcome);
  const text = `${opt.label}. ${res.text}`;
  state.history.push({ turn: state.turn, kind: 'event', text });
  return [{ kind: 'result', tone: res.tone, text }];
}
