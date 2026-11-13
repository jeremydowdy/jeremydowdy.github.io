// The world, generated from the seed: a river valley with hills and forest.
// Coordinates are 0..1 across the map ("u" across, "v" down). The pixel map
// scales them to MAP_W x MAP_H.
import { makeStream } from './rng.js';

export const MAP_W = 320;
export const MAP_H = 200;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function lattice(rand, gw, gh) {
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  return (u, v) => {
    const x = u * (gw - 1), y = v * (gh - 1);
    const x0 = Math.min(gw - 2, Math.floor(x)), y0 = Math.min(gh - 2, Math.floor(y));
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = g[y0 * gw + x0], b = g[y0 * gw + x0 + 1], c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x0 + 1];
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}

// A cheap, repeatable hash of a pixel position, 0..1. Used for texture and
// tree placement so the same seed always draws the same map.
export function hash2(x, y, k = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(k | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createWorld(seed) {
  const rand = makeStream(seed + ':map');
  const n1 = lattice(rand, 6, 5), n2 = lattice(rand, 13, 10), nForest = lattice(rand, 8, 6);
  const p1 = rand() * 6.28, p2 = rand() * 6.28;
  const riverU = (v) => 0.5 + 0.15 * Math.sin(v * 4.2 + p1) + 0.05 * Math.sin(v * 9.5 + p2);
  // Half-width of the river in pixels, varying a little down its length.
  const riverHalf = (y) => 4.2 + 1.3 * Math.sin(y * 0.07 + p2);
  const heightAt = (u, v) => {
    const base = 0.65 * n1(u, v) + 0.35 * n2(u, v);
    return (0.12 + 0.88 * base) * smooth(0.015, 0.3, Math.abs(u - riverU(v)));
  };
  const forestAt = (u, v) => nForest(u, v);

  const campV = 0.52;
  const side = rand() < 0.5 ? -1 : 1;
  const camp = { kind: 'camp', x: riverU(campV) + side * 0.1, y: campV };
  const sites = [camp];
  for (const dv of [-0.07, 0, 0.07]) sites.push({ kind: 'water', x: riverU(campV + dv) + side * 0.027, y: campV + dv });
  let tries = 0;
  while (sites.filter((s) => s.kind === 'food').length < 4 && tries++ < 400) {
    const x = 0.1 + rand() * 0.8, y = 0.12 + rand() * 0.76;
    const far = Math.hypot(x - camp.x, y - camp.y);
    const onCampSide = Math.sign(x - riverU(y)) === side && Math.abs(x - riverU(y)) > 0.05;
    if (far > 0.14 && far < 0.4 && heightAt(x, y) < 0.5 && onCampSide) sites.push({ kind: 'food', x, y });
  }
  return { seed, heightAt, forestAt, riverU, riverHalf, sites, camp, campV, side };
}
