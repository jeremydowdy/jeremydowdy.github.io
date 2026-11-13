// The map: a small pixel-art world drawn on a 2D canvas at 320x200 and scaled
// up with hard edges, so it stays light and looks like an old game.
// Terrain and trees are painted once; fires, water, settlers and the
// expedition party are drawn fresh every frame.
import { createWorld, hash2, MAP_W as W, MAP_H as H } from './world.js';
import { createSim, syncCount, step } from './agents.js';
import { makeSprite, spriteSize } from './sprites.js';

const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
// Land colors, from low ground to high: grass, forest floor, hill, rock.
const LAND = ['#56a85a', '#4a9a50', '#3f8a47', '#357a3e', '#5f7f3c', '#82764a', '#92826a', '#9a9aa2'].map(rgb);
const WATER = { deep: rgb('#2557b8'), mid: rgb('#2f6cd2'), edge: rgb('#4f8be8') };
const SAND = rgb('#dcc783'), DIRT = rgb('#a98d5a'), DIRT_DARK = rgb('#8d7549');
const BAYER = [[0.125, 0.625], [0.875, 0.375]];     // 2x2 ordered dithering
const SETTLER_COLORS = ['#e0653f', '#f0d060', '#e8e8e8', '#b070e0', '#e08aa0'];
const MAX_SLOTS = 40;
const TAU = Math.PI * 2;

export function createPixelMap(canvas, { seed, reducedMotion = false }) {
  const ctx = canvas.getContext('2d', { alpha: false });
  canvas.width = W; canvas.height = H;
  ctx.imageSmoothingEnabled = false;

  let world = createWorld(seed);
  let sim = createSim(seed);
  let view = { pop: 0, structures: {}, flags: {}, parties: [], turn: 1 };
  let terrain = null, ripples = [];
  let raf = 0, last = 0, acc = 0, time = 0, running = false;
  let pulses = [];
  let partyPos = null;
  const sprites = { campfire: makeSprite('campfire'), shelter: makeSprite('shelter'), 'drying-rack': makeSprite('drying-rack'),
    oak: makeSprite('oak'), pine: makeSprite('pine'), bush: makeSprite('bush') };

  const toPx = (p) => ({ x: p.x * W, y: p.y * H });

  // ---------------------------------------------------------------- terrain
  function paintTerrain() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    const d = img.data;
    const camp = toPx(world.camp);
    ripples = [];
    for (let y = 0; y < H; y++) {
      const v = y / H, cu = world.riverU(v) * W, half = world.riverHalf(y);
      for (let x = 0; x < W; x++) {
        const dx = Math.abs(x - cu);
        let col;
        if (dx < half) {
          col = dx < half * 0.45 ? WATER.deep : dx > half - 1.4 ? WATER.edge : WATER.mid;
        } else if (dx < half + 2.5 && hash2(x, y, 3) < 0.9 - (dx - half) * 0.25) {
          col = SAND;
        } else {
          const u = x / W, h = world.heightAt(u, v);
          const t = Math.min(LAND.length - 1.001, Math.max(0, ((h - 0.1) / 0.78) * (LAND.length - 1)));
          const band = Math.floor(t), frac = t - band;
          col = LAND[band + (frac > BAYER[y & 1][x & 1] ? 1 : 0)];
          if (band < 4 && hash2(x, y, 7) < 0.05) col = LAND[Math.min(LAND.length - 1, band + 1)];   // grass speckle
          const cd = Math.hypot(x - camp.x, (y - camp.y) * 1.25);
          if (cd < 21 && hash2(x, y, 11) < (21 - cd) / 6) col = hash2(x, y, 13) < 0.2 ? DIRT_DARK : DIRT;
        }
        const i = (y * W + x) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);

    // Sparkles on the water, drawn per frame so they can move.
    for (let k = 0; k < 90; k++) {
      const y = Math.floor(hash2(k, 1, 21) * H);
      const half = world.riverHalf(y);
      ripples.push({ x: Math.round(world.riverU(y / H) * W + (hash2(k, 2, 22) * 2 - 1) * (half - 2)), y, k });
    }

    // Trees, sorted so lower ones overlap higher ones, and berry bushes.
    const items = [];
    for (let gy = 6; gy < H - 2; gy += 6) {
      for (let gx = 5; gx < W - 4; gx += 7) {
        const x = gx + Math.floor(hash2(gx, gy, 31) * 5) - 2, y = gy + Math.floor(hash2(gx, gy, 32) * 4) - 2;
        const u = x / W, v = y / H, h = world.heightAt(u, v);
        const dxr = Math.abs(x - world.riverU(v) * W);
        if (dxr < world.riverHalf(y) + 8 || h > 0.7) continue;
        if (world.forestAt(u, v) < 0.5 + hash2(x, y, 33) * 0.12) continue;
        if (Math.hypot(x - camp.x, (y - camp.y) * 1.25) < 28) continue;
        if (world.sites.some((s) => s.kind === 'food' && Math.hypot(x - s.x * W, y - s.y * H) < 9)) continue;
        items.push({ y, x, sprite: h > 0.42 ? 'pine' : 'oak' });
      }
    }
    for (const s of world.sites) if (s.kind === 'food') items.push({ x: Math.round(s.x * W), y: Math.round(s.y * H), sprite: 'bush' });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      const { w, h } = spriteSize(it.sprite);
      g.drawImage(sprites[it.sprite][0], Math.round(it.x - w / 2), Math.round(it.y - h));
    }
    terrain = c;
  }

  // ---------------------------------------------------------------- where things go
  const campPx = () => toPx(world.camp);
  const bankX = (y) => world.riverU(y / H) * W;

  // Keeps a spot on the camp's side of the river, and off the water.
  function fixSide(x, y) {
    const cu = bankX(y), half = world.riverHalf(y) + 9;
    let dx = x - cu;
    if (Math.sign(dx || world.side) !== world.side) dx = -dx;
    if (Math.abs(dx) < half) dx = half * world.side; else dx = Math.abs(dx) * world.side;
    return { x: Math.min(W - 8, Math.max(8, cu + dx)), y: Math.min(H - 8, Math.max(10, y)) };
  }

  // Spot number i for a kind of structure. Positions only depend on the seed,
  // so structures never jump around as more are built.
  function slot(kind, i) {
    const c = campPx();
    if (kind === 'campfire') {
      const r = 7 + 4.2 * Math.sqrt(i), a = i * 2.4 + 0.6;
      return fixSide(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * 0.8);
    }
    if (kind === 'shelter') {
      const r = 25 + 5.5 * Math.sqrt(i), a = i * 2.4 + 1.3;
      return fixSide(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * 0.75);
    }
    const dv = (i % 2 ? 1 : -1) * (14 + 11 * Math.floor(i / 2));
    const y = c.y + dv;
    return fixSide(bankX(y) + world.side * 20, y);
  }

  function campSites() {
    const sites = world.sites.slice();
    const fires = Math.min(view.structures.campfire || 0, MAX_SLOTS);
    for (let i = 0; i < fires; i++) { const p = slot('campfire', i); sites.push({ kind: 'camp', x: p.x / W, y: p.y / H }); }
    return sites;
  }

  function constrain(a) {
    const cu = world.riverU(a.y), half = (world.riverHalf(a.y * H) + 2) / W;
    const dx = a.x - cu;
    if (Math.abs(dx) < half) { a.x = cu + Math.sign(dx || world.side) * half; a.vx = 0; }
  }

  // ---------------------------------------------------------------- drawing
  function drawSettler(a, i) {
    const x = Math.round(a.x * W), y = Math.round(a.y * H);
    ctx.fillStyle = '#f2c48a'; ctx.fillRect(x, y - 3, 2, 1);
    ctx.fillStyle = SETTLER_COLORS[i % SETTLER_COLORS.length]; ctx.fillRect(x, y - 2, 2, 2);
  }

  function drawParty() {
    const p = view.parties[0];
    if (!p) { partyPos = null; return; }
    const c = campPx();
    const total = Math.max(1, p.due - p.start + 1);
    const progress = Math.min(1, Math.max(0, (view.turn - p.start) / total));
    const reach = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
    const dir = ((p.start * 7) % 3) - 1;                       // which way they head, from the trip itself
    const dest = { x: Math.min(W - 14, Math.max(14, c.x + world.side * -1 * (60 + 40 * Math.abs(dir)) + dir * 30)), y: dir >= 0 ? 24 : H - 24 };
    const want = { x: c.x + (dest.x - c.x) * reach, y: c.y + (dest.y - c.y) * reach };
    if (!partyPos) partyPos = { ...c };
    partyPos.x += (want.x - partyPos.x) * 0.06; partyPos.y += (want.y - partyPos.y) * 0.06;
    const x = Math.round(partyPos.x), y = Math.round(partyPos.y);
    for (let i = 0; i < Math.min(p.people, 4); i++) {
      ctx.fillStyle = '#f2c48a'; ctx.fillRect(x + i * 3, y - 3, 2, 1);
      ctx.fillStyle = '#ffd166'; ctx.fillRect(x + i * 3, y - 2, 2, 2);
    }
    ctx.fillStyle = '#e04a48'; ctx.fillRect(x - 1, y - 8, 3, 2);   // a little flag
    ctx.fillStyle = '#6b4423'; ctx.fillRect(x - 1, y - 8, 1, 7);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now; acc += dt;
    if (acc < 1 / 30) return;                                  // 30 frames a second is plenty
    const step_dt = acc; acc = 0; time += step_dt;
    step(sim, step_dt, campSites(), constrain);
    pulses = pulses.filter((p) => time - p.start < 0.9);

    ctx.drawImage(terrain, 0, 0);

    // Sparkling water.
    const tick = reducedMotion ? 0 : Math.floor(time * 2);
    ctx.fillStyle = '#9cc4ff';
    for (const r of ripples) if ((tick + r.k) % 5 === 0) ctx.fillRect(r.x, r.y, 3, 1);

    // Stone weir across the river, if the player built one.
    if (view.flags.weir) {
      const y = Math.round(campPx().y + 22), cu = bankX(y), half = world.riverHalf(y);
      for (let x = Math.floor(cu - half - 1); x <= cu + half + 1; x += 3) {
        ctx.fillStyle = '#8d8d94'; ctx.fillRect(x, y, 3, 3);
        ctx.fillStyle = '#c4c4cc'; ctx.fillRect(x, y, 3, 1);
      }
      ctx.fillStyle = '#e8f2ff'; for (let x = Math.floor(cu - half); x < cu + half; x += 4) ctx.fillRect(x, y + 3, 2, 1);
    }

    // Structures, back to front.
    const things = [];
    for (const [kind, n] of Object.entries(view.structures)) {
      if (!sprites[kind]) continue;
      for (let i = 0; i < Math.min(n, MAX_SLOTS); i++) things.push({ kind, ...slot(kind, i), i });
    }
    things.sort((a, b) => a.y - b.y);
    for (const t of things) {
      const frames = sprites[t.kind];
      const f = t.kind === 'campfire' && !reducedMotion ? frames[Math.floor(time * 5 + t.i) % frames.length] : frames[0];
      const x = Math.round(t.x - f.width / 2), y = Math.round(t.y - f.height);
      if (t.kind === 'campfire') {
        ctx.globalAlpha = 0.14 + (reducedMotion ? 0 : 0.05 * Math.sin(time * 6 + t.i));
        ctx.fillStyle = '#ffb040'; ctx.fillRect(x - 6, y - 4, f.width + 12, f.height + 8);
        ctx.fillRect(x - 3, y - 7, f.width + 6, f.height + 14);
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(f, x, y);
      if (t.kind === 'campfire' && !reducedMotion) {          // smoke
        for (let s = 0; s < 3; s++) {
          const rise = (time * 9 + s * 5 + t.i * 3) % 15;
          ctx.globalAlpha = 0.5 * (1 - rise / 15);
          ctx.fillStyle = '#d8d8d8';
          ctx.fillRect(Math.round(t.x + Math.sin(time * 2 + s + t.i) * 1.5), Math.round(y - 1 - rise), 1, 1);
        }
        ctx.globalAlpha = 1;
      }
    }

    // Settlers.
    sim.agents.forEach(drawSettler);
    drawParty();

    // A ring that flares where something was just built.
    for (const p of pulses) {
      const t = (time - p.start) / 0.9;
      ctx.globalAlpha = (1 - t) * (reducedMotion ? 0.8 : 1);
      ctx.fillStyle = '#ffffff';
      const r = reducedMotion ? 9 : 3 + t * 14;
      for (let k = 0; k < 16; k++) ctx.fillRect(Math.round(p.x + Math.cos((k / 16) * TAU) * r), Math.round(p.y + Math.sin((k / 16) * TAU) * r * 0.8), 2, 2);
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- control
  function fit() {
    const box = canvas.parentElement.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const scale = Math.min(box.width / W, box.height / H);
    const s = scale >= 1 ? Math.floor(scale * 2) / 2 : scale;    // half-steps keep the pixels crisp
    canvas.style.width = Math.round(W * s) + 'px';
    canvas.style.height = Math.round(H * s) + 'px';
  }
  const resizer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  if (resizer) resizer.observe(canvas.parentElement);
  window.addEventListener('resize', fit);

  function start() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { running = false; cancelAnimationFrame(raf); }
  const onVisibility = () => { if (document.hidden) stop(); else start(); };
  document.addEventListener('visibilitychange', onVisibility);

  paintTerrain();
  fit();
  if (!document.hidden) start();

  return {
    setState(state) {
      if (state.seed !== seed) { seed = state.seed; world = createWorld(seed); sim = createSim(seed); paintTerrain(); }
      view = { pop: state.pop, structures: { ...state.structures }, flags: { ...state.flags }, parties: state.parties.map((p) => ({ ...p })), turn: state.turn };
      syncCount(sim, state.pop, campSites());
    },
    setReducedMotion(v) { reducedMotion = v; },
    pulse(kind) {
      const n = view.structures[kind] || 1;
      const p = kind in sprites ? slot(kind, Math.max(0, Math.min(n, MAX_SLOTS) - 1)) : campPx();
      pulses.push({ x: p.x, y: p.y - 4, start: time });
    },
    fit,
    stats: () => ({ agents: sim.agents.length, running, canvas: `${W}x${H}` }),
    destroy() { stop(); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('resize', fit); if (resizer) resizer.disconnect(); },
  };
}
