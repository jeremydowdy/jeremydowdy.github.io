// The score is a plain function of the state, so the same seed and the same
// choices always give the same number.
export function score(state) {
  const trust = state.rivals.reduce((sum, r) => sum + r.trust, 0);
  return Math.round(state.pop * 3 + state.kids * 1.5 + state.knowledge * 2 + state.stability + state.food * 0.2 + trust * 0.2);
}
