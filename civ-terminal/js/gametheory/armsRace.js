// Arms race as a prisoner's dilemma.
// Moves: 'C' = disarm (cooperate), 'D' = build arms (defect).
// Payoffs are "security points" for (you, them).

export const MOVES = { C: 'disarm', D: 'build' };

// T > R > P > S and 2R > T + S make this a prisoner's dilemma.
export const PAYOFF = { T: 5, R: 3, P: 1, S: 0 };

export function payoff(you, them) {
  if (you === 'C' && them === 'C') return [PAYOFF.R, PAYOFF.R];
  if (you === 'C' && them === 'D') return [PAYOFF.S, PAYOFF.T];
  if (you === 'D' && them === 'C') return [PAYOFF.T, PAYOFF.S];
  return [PAYOFF.P, PAYOFF.P];
}

export function matrix() {
  const out = {};
  for (const you of ['C', 'D']) for (const them of ['C', 'D']) out[you + them] = payoff(you, them);
  return out;
}

// The move that scores at least as well whatever the other side does, if one exists.
export function dominantMove() {
  for (const m of ['C', 'D']) {
    const other = m === 'C' ? 'D' : 'C';
    if (['C', 'D'].every((them) => payoff(m, them)[0] > payoff(other, them)[0])) return m;
  }
  return null;
}

// Outcomes where neither side gains by changing its own move alone.
export function nashEquilibria() {
  const out = [];
  for (const you of ['C', 'D']) for (const them of ['C', 'D']) {
    const flipYou = you === 'C' ? 'D' : 'C';
    const flipThem = them === 'C' ? 'D' : 'C';
    if (payoff(you, them)[0] >= payoff(flipYou, them)[0] && payoff(you, them)[1] >= payoff(you, flipThem)[1]) out.push(you + them);
  }
  return out;
}

export function isPrisonersDilemma() {
  const { T, R, P, S } = PAYOFF;
  return T > R && R > P && P > S && 2 * R > T + S;
}

// Plain-language reason both sides often build, generated from the matrix itself.
export function explain() {
  const m = matrix();
  return `Whatever they do, building scores higher for you (${m.DC[0]} beats ${m.CC[0]} if they disarm, ` +
    `${m.DD[0]} beats ${m.CD[0]} if they build), and the same is true for them. ` +
    `So both tend to build and get ${m.DD[0]}, ${m.DD[1]}, which is worse for both than ${m.CC[0]}, ${m.CC[1]}.`;
}

// What one round does to the player's civilization.
export function effects(you, them, state) {
  const R = state.rules;
  const [mine] = payoff(you, them);
  const fx = { stability: (mine - 2) * R.securityToStability, food: 0 };
  if (you === 'D') fx.food -= R.armsCost;
  if (you === 'D' && them === 'C') fx.food += R.tribute;
  if (you === 'C' && them === 'D') fx.food -= Math.round(state.food * R.raidLoss * 10) / 10;
  return fx;
}

export function describe(you, them, rivalName) {
  if (you === 'C' && them === 'C') return `Both sides stood down. The border is quiet.`;
  if (you === 'C' && them === 'D') return `You stood down. The ${rivalName} armed, and raided your stores.`;
  if (you === 'D' && them === 'C') return `You armed. The ${rivalName} stood down, and sent food to keep the peace.`;
  return `Both sides armed. Nobody was raided, and nobody feels safe.`;
}
