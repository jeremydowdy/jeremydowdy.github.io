// Dilemma cards: which one is due, what its options are worth, and the
// balance report used by the tests.

export function isLocked(state, id) {
  return state.locks.includes(id);
}

// The next card that is due, if any. Cards come up in data-file order.
export function dueDilemma(state, data) {
  return data.dilemmas.find((d) =>
    d.era === state.era && state.turn >= (d.minTurn || 0) &&
    !state.resolved.includes(d.id) && !isLocked(state, d.id) &&
    (d.requires || []).every((f) => state.flags[f])) || null;
}

// Rough worth of each kind of effect, in "food-equivalent points", so the
// two sides of a card can be compared. Lasting modifiers are valued over
// about 20 turns of a typical Stone Age band.
export const BALANCE_WEIGHTS = {
  pop: 4, food: 1, energy: 1, knowledge: 3, stability: 2, trust: 1,
  mods: { foodPerTurn: 20, energyPerTurn: 20, knowledgePerTurn: 60, stabilityPerTurn: 40, forageMult: 280, spoilMult: -24 },
};

export function valueOf(fx = {}, w = BALANCE_WEIGHTS) {
  let up = 0, down = 0;
  const add = (v) => { if (v > 0) up += v; else down += v; };
  for (const k of ['pop', 'food', 'energy', 'knowledge', 'stability', 'trust']) {
    if (typeof fx[k] === 'number') add(fx[k] * w[k]);
  }
  for (const [k, v] of Object.entries(fx.mods || {})) add(v * (w.mods[k] ?? 0));
  return { up, down };
}

export function optionValue(option) {
  let up = 0, down = 0;
  for (const fx of [option.now, ...(option.later || []).map((l) => l.effects)]) {
    const v = valueOf(fx);
    up += v.up; down += v.down;
  }
  const r = (x) => Math.round(x * 10) / 10;
  return { upside: r(up), cost: r(-down), net: r(up + down) };
}

export function balanceReport(dilemmas) {
  return dilemmas.map((d) => {
    const A = optionValue(d.options.A), B = optionValue(d.options.B);
    return { id: d.id, A, B, gap: Math.round(Math.abs(A.net - B.net) * 10) / 10 };
  });
}

export function formatBalanceReport(report) {
  const lines = ['Balance report (food-equivalent points; net = upside - cost)',
    'card            option  upside   cost    net'];
  for (const r of report) {
    for (const k of ['A', 'B']) {
      lines.push(`${r.id.padEnd(16)}${k.padEnd(8)}${String(r[k].upside).padStart(6)} ${String(r[k].cost).padStart(6)} ${String(r[k].net).padStart(6)}`);
    }
    lines.push(`${''.padEnd(16)}gap between options: ${r.gap}`);
  }
  return lines.join('\n');
}

// Checks a dilemmas file for mistakes. Returns a list of problems (empty = fine).
export function validateDilemmas(dilemmas, eras) {
  const problems = [];
  const ids = new Set();
  const eraIds = new Set(eras.map((e) => e.id));
  for (const d of dilemmas) {
    const where = `dilemma "${d.id}"`;
    if (!d.id || ids.has(d.id)) problems.push(`${where}: missing or duplicate id`);
    ids.add(d.id);
    if (!eraIds.has(d.era)) problems.push(`${where}: unknown era "${d.era}"`);
    if (!d.title || !d.text) problems.push(`${where}: needs a title and text`);
    for (const k of ['A', 'B']) {
      const o = d.options && d.options[k];
      if (!o) { problems.push(`${where}: missing option ${k}`); continue; }
      for (const f of ['label', 'upside', 'cost']) if (!o[f]) problems.push(`${where} option ${k}: missing ${f}`);
      for (const l of o.later || []) {
        if (!(l.after > 0) || !l.text || !l.effects) problems.push(`${where} option ${k}: a later consequence needs after, text and effects`);
      }
    }
  }
  for (const d of dilemmas) for (const k of ['A', 'B']) {
    for (const lock of (d.options?.[k]?.locks || [])) if (!ids.has(lock)) problems.push(`dilemma "${d.id}" option ${k}: locks unknown card "${lock}"`);
  }
  return problems;
}
