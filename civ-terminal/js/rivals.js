// Rival strategies for the repeated border game, and the trust score.
// A strategy sees the rounds so far as [{ you, them }] where `you` is the
// player's move and `them` is the rival's own move. It returns 'C' or 'D'.

export const STRATEGIES = {
  alwaysDefect() {
    return 'D';
  },
  titForTat(rounds, params = {}) {
    if (!rounds.length) return params.firstMove || 'C';
    return rounds[rounds.length - 1].you;
  },
  grudger(rounds) {
    return rounds.some((r) => r.you === 'D') ? 'D' : 'C';
  },
  forgiver(rounds, params = {}) {
    const n = params.tolerance || 2;
    if (rounds.length < n) return 'C';
    return rounds.slice(-n).every((r) => r.you === 'D') ? 'D' : 'C';
  },
};

export function strategyOf(rival, data) {
  const def = data.rivals.strategies[rival.strategy];
  const fn = STRATEGIES[rival.strategy];
  if (!def || !fn) throw new Error(`Unknown strategy: ${rival.strategy}`);
  return { fn, def };
}

// The rival's move this round. A standing pledge to disarm makes the rival
// read your last move as "disarm" (a clean slate), except for a grudger.
export function rivalMove(rival, data, { treaty = false } = {}) {
  const { fn, def } = strategyOf(rival, data);
  let rounds = rival.rounds;
  if (treaty && rival.strategy !== 'grudger' && rounds.length) {
    rounds = rounds.slice(0, -1).concat([{ ...rounds[rounds.length - 1], you: 'C' }]);
  }
  return fn(rounds, def.params);
}

export function treatyAccepted(rival, data) {
  const { def } = strategyOf(rival, data);
  if (rival.strategy === 'grudger' && rival.rounds.some((r) => r.you === 'D')) return false;
  return rival.trust >= (def.params.treatyTrust ?? 30);
}

export function updateTrust(rival, yourMove, rules, { brokeTreaty = false } = {}) {
  let t = rival.trust + (yourMove === 'C' ? rules.trustGain : -rules.trustLoss);
  if (brokeTreaty) t -= rules.treatyBreakPenalty;
  rival.trust = Math.min(100, Math.max(0, t));
  return rival.trust;
}

export function record(rival) {
  const c = rival.rounds.filter((r) => r.you === 'C').length;
  return { rounds: rival.rounds.length, youDisarmed: c, youBuilt: rival.rounds.length - c,
    theyDisarmed: rival.rounds.filter((r) => r.them === 'C').length };
}
