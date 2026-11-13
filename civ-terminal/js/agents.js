// Settlers as boids. This layer is visual: it reads the civilization's
// state (how many people, where the camp, river and foraging grounds are)
// but never changes it, so frame rate can't affect a run's score.
// Rules: separation, alignment, cohesion, plus seeking the current goal.
import { makeStream } from './rng.js';

export const MAX_AGENTS = 500;
const SEP_R = 0.022, NEAR_R = 0.06, MAX_SPEED = 0.07, ARRIVE = 0.02;
const ROUTE = ['food', 'camp', 'water', 'camp'];

export function createSim(seed) {
  return { rand: makeStream(seed + ':agents'), agents: [] };
}

function pickSite(sim, sites, kind) {
  const options = sites.filter((s) => s.kind === kind);
  return options[Math.floor(sim.rand() * options.length)] || sites[0];
}

export function syncCount(sim, count, sites) {
  const n = Math.max(0, Math.min(MAX_AGENTS, Math.round(count)));
  const camp = sites.find((s) => s.kind === 'camp');
  while (sim.agents.length < n) {
    const step = Math.floor(sim.rand() * ROUTE.length);
    const goal = pickSite(sim, sites, ROUTE[step]);
    sim.agents.push({
      x: camp.x + (sim.rand() - 0.5) * 0.05, y: camp.y + (sim.rand() - 0.5) * 0.05,
      vx: 0, vy: 0, step, gx: goal.x + (sim.rand() - 0.5) * 0.03, gy: goal.y + (sim.rand() - 0.5) * 0.03, rest: sim.rand() * 3,
    });
  }
  sim.agents.length = n;
}

export function step(sim, dt, sites) {
  const A = sim.agents, n = A.length;
  dt = Math.min(dt, 0.05);
  for (let i = 0; i < n; i++) {
    const a = A[i];
    let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, near = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const b = A[j];
      const dx = a.x - b.x, dy = a.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > NEAR_R * NEAR_R) continue;
      near++; ax += b.vx; ay += b.vy; cx += b.x; cy += b.y;
      if (d2 < SEP_R * SEP_R && d2 > 1e-9) { const d = Math.sqrt(d2); sx += dx / d * (SEP_R - d) / SEP_R; sy += dy / d * (SEP_R - d) / SEP_R; }
    }
    // Goal seeking: walk the route food -> camp -> water -> camp, resting at each stop.
    let gx = a.gx - a.x, gy = a.gy - a.y;
    const gd = Math.sqrt(gx * gx + gy * gy) || 1e-6;
    if (gd < ARRIVE) {
      a.rest -= dt;
      if (a.rest <= 0) {
        a.step = (a.step + 1) % ROUTE.length;
        const goal = pickSite(sim, sites, ROUTE[a.step]);
        a.gx = goal.x + (sim.rand() - 0.5) * 0.04; a.gy = goal.y + (sim.rand() - 0.5) * 0.04;
        a.rest = 1 + sim.rand() * 3;
      }
    }
    let fx = (gx / gd) * (gd < ARRIVE ? 0.2 : 1), fy = (gy / gd) * (gd < ARRIVE ? 0.2 : 1);
    fx += sx * 2.2; fy += sy * 2.2;
    if (near) {
      fx += (ax / near) * 4; fy += (ay / near) * 4;                          // alignment
      fx += (cx / near - a.x) * 2; fy += (cy / near - a.y) * 2;              // cohesion
    }
    a.vx += fx * 0.12 * dt; a.vy += fy * 0.12 * dt;
    a.vx *= 0.96; a.vy *= 0.96;
    const sp = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
    if (sp > MAX_SPEED) { a.vx *= MAX_SPEED / sp; a.vy *= MAX_SPEED / sp; }
  }
  for (const a of A) {
    a.x = Math.min(0.99, Math.max(0.01, a.x + a.vx * dt));
    a.y = Math.min(0.99, Math.max(0.01, a.y + a.vy * dt));
  }
}
