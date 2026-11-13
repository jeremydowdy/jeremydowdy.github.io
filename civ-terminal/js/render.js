// The map: a phosphor wireframe drawn with raw WebGL2 (no library).
// Terrain contours and the river are static line buffers; settlers, huts,
// hearths and the camp glow are all instances in ONE draw call.
import { makeStream } from './rng.js';
import { createSim, syncCount, step, MAX_AGENTS } from './agents.js';

const COLORS = { green: [0.2, 1.0, 0.4], amber: [1.0, 0.69, 0.0], white: [0.93, 0.93, 0.93] };
const MAX_POINTS = MAX_AGENTS + 200;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- world
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

// The world is generated from the seed, on its own random stream.
export function createWorld(seed) {
  const rand = makeStream(seed + ':map');
  const n1 = lattice(rand, 6, 5), n2 = lattice(rand, 13, 10);
  const p1 = rand() * 6.28, p2 = rand() * 6.28;
  const riverU = (v) => 0.5 + 0.15 * Math.sin(v * 4.2 + p1) + 0.05 * Math.sin(v * 9.5 + p2);
  const heightAt = (u, v) => {
    const base = 0.65 * n1(u, v) + 0.35 * n2(u, v);
    return (0.12 + 0.88 * base) * smooth(0.015, 0.3, Math.abs(u - riverU(v)));
  };
  const campV = 0.52;
  const side = rand() < 0.5 ? -1 : 1;
  const camp = { kind: 'camp', x: riverU(campV) + side * 0.075, y: campV };
  const sites = [camp];
  for (const dv of [-0.07, 0, 0.07]) sites.push({ kind: 'water', x: riverU(campV + dv) + side * 0.012, y: campV + dv });
  let tries = 0;
  while (sites.filter((s) => s.kind === 'food').length < 4 && tries++ < 200) {
    const x = 0.12 + rand() * 0.76, y = 0.12 + rand() * 0.76;
    const far = Math.hypot(x - camp.x, y - camp.y);
    if (far > 0.16 && far < 0.42 && heightAt(x, y) < 0.5) sites.push({ kind: 'food', x, y });
  }
  return { heightAt, riverU, sites, camp, campV, side };
}

const toWorld = (u, v, h) => [(u - 0.5) * 2.6, (0.5 - v) * 2.0, h * 0.55];
const edgeFade = (u, v) => smooth(0, 0.09, Math.min(u, 1 - u, v, 1 - v));

function buildLines(world, { weir }) {
  const out = [];
  const push = (u, v, h, b) => { const p = toWorld(u, v, h); out.push(p[0], p[1], p[2], b); };
  // Contours by marching squares.
  const GX = 112, GY = 86;
  const H = new Float32Array((GX + 1) * (GY + 1));
  for (let j = 0; j <= GY; j++) for (let i = 0; i <= GX; i++) H[j * (GX + 1) + i] = world.heightAt(i / GX, j / GY);
  const levels = [0.07, 0.14, 0.21, 0.28, 0.35, 0.42, 0.49, 0.56, 0.63, 0.7];
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
    const a = H[j * (GX + 1) + i], b = H[j * (GX + 1) + i + 1], c = H[(j + 1) * (GX + 1) + i + 1], d = H[(j + 1) * (GX + 1) + i];
    const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
    for (const L of levels) {
      if (L < lo || L > hi) continue;
      const pts = [];
      const edge = (h0, h1, u0, v0, u1, v1) => {
        if ((h0 - L) * (h1 - L) < 0) { const t = (L - h0) / (h1 - h0); pts.push([u0 + (u1 - u0) * t, v0 + (v1 - v0) * t]); }
      };
      const u0 = i / GX, u1 = (i + 1) / GX, v0 = j / GY, v1 = (j + 1) / GY;
      edge(a, b, u0, v0, u1, v0); edge(b, c, u1, v0, u1, v1); edge(c, d, u1, v1, u0, v1); edge(d, a, u0, v1, u0, v0);
      const bright = 0.3 + L * 0.6;
      for (let k = 0; k + 1 < pts.length; k += 2) {
        push(pts[k][0], pts[k][1], L, bright * edgeFade(pts[k][0], pts[k][1]));
        push(pts[k + 1][0], pts[k + 1][1], L, bright * edgeFade(pts[k + 1][0], pts[k + 1][1]));
      }
    }
  }
  // River: two bright bank lines.
  const N = 90;
  for (const off of [-0.007, 0.007]) {
    for (let k = 0; k < N; k++) {
      const v0 = k / N, v1 = (k + 1) / N;
      push(world.riverU(v0) + off, v0, 0.004, 0.95 * edgeFade(0.5, v0)); push(world.riverU(v1) + off, v1, 0.004, 0.95 * edgeFade(0.5, v1));
    }
  }
  if (weir) {
    const v = world.campV + 0.03;
    for (const dv of [0, 0.004]) { push(world.riverU(v) - 0.022, v + dv, 0.02, 1.4); push(world.riverU(v) + 0.022, v + dv, 0.02, 1.4); }
  }
  return new Float32Array(out);
}

// ---------------------------------------------------------------- matrices
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function lookAt(eye, target, up) {
  const z = norm(sub(eye, target)), x = norm(cross(up, z)), y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
}
function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---------------------------------------------------------------- shaders
const LINE_VS = `#version 300 es
in vec4 aPos;            // xyz + brightness
uniform mat4 uMvp;
out float vBright;
void main() {
  gl_Position = uMvp * vec4(aPos.xyz, 1.0);
  float depth = clamp((gl_Position.w - 2.0) / 3.0, 0.0, 1.0);
  vBright = aPos.w * mix(1.0, 0.4, depth);
}`;
const LINE_FS = `#version 300 es
precision mediump float;
in float vBright;
uniform vec3 uColor;
out vec4 o;
void main() { o = vec4(uColor * vBright, 1.0); }`;
const POINT_VS = `#version 300 es
in vec2 aCorner;
in vec4 aInst;           // xyz + size
in vec2 aLook;           // brightness, shape
uniform mat4 uMvp;
uniform vec2 uScale;
out vec2 vUv;
out float vBright;
out float vShape;
void main() {
  vec4 clip = uMvp * vec4(aInst.xyz, 1.0);
  clip.xy += aCorner * aInst.w * uScale;
  gl_Position = clip;
  vUv = aCorner; vBright = aLook.x; vShape = aLook.y;
}`;
const POINT_FS = `#version 300 es
precision mediump float;
in vec2 vUv;
in float vBright;
in float vShape;
uniform vec3 uColor;
out vec4 o;
void main() {
  float d = length(vUv);
  float a;
  if (vShape < 0.5) {                       // settler: bright core, soft halo
    a = smoothstep(0.45, 0.0, d) + 0.35 * smoothstep(1.0, 0.2, d);
  } else if (vShape < 1.5) {                // hut, or a pulse: a ring
    a = smoothstep(0.22, 0.0, abs(d - 0.72));
  } else if (vShape < 2.5) {                // hearth: a solid ember
    a = smoothstep(0.7, 0.1, d);
  } else {                                  // camp glow: wide and faint
    a = 0.5 * pow(max(0.0, 1.0 - d), 2.0);
  }
  o = vec4(uColor * vBright * a, 1.0);
}`;

function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

// ---------------------------------------------------------------- renderer
export function createRenderer(canvas, { seed, theme = 'green', reducedMotion = false }) {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'default' });
  if (!gl) throw new Error('WebGL2 is not available');

  let world = createWorld(seed);
  let sim = createSim(seed);
  let view = { pop: 0, structures: {}, flags: {} };
  let color = COLORS[theme] || COLORS.green;
  let G = null;                 // GL objects; rebuilt after a lost context
  let lineCount = 0, weirShown = false;
  let raf = 0, last = 0, time = 0, running = false;
  let pulses = [];
  const inst = new Float32Array(MAX_POINTS * 6);
  const stats = { frames: 0, ms: 0, drawCalls: 0, points: 0 };

  function init() {
    const lineProg = program(gl, LINE_VS, LINE_FS), pointProg = program(gl, POINT_VS, POINT_FS);
    const lineVao = gl.createVertexArray(), lineBuf = gl.createBuffer();
    gl.bindVertexArray(lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
    const aPos = gl.getAttribLocation(lineProg, 'aPos');
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 4, gl.FLOAT, false, 0, 0);

    const pointVao = gl.createVertexArray();
    gl.bindVertexArray(pointVao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aCorner = gl.getAttribLocation(pointProg, 'aCorner');
    gl.enableVertexAttribArray(aCorner); gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);
    const instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, inst.byteLength, gl.DYNAMIC_DRAW);
    const aInst = gl.getAttribLocation(pointProg, 'aInst'), aLook = gl.getAttribLocation(pointProg, 'aLook');
    gl.enableVertexAttribArray(aInst); gl.vertexAttribPointer(aInst, 4, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(aInst, 1);
    gl.enableVertexAttribArray(aLook); gl.vertexAttribPointer(aLook, 2, gl.FLOAT, false, 24, 16); gl.vertexAttribDivisor(aLook, 1);
    gl.bindVertexArray(null);

    G = { lineProg, pointProg, lineVao, lineBuf, pointVao, instBuf,
      uLineMvp: gl.getUniformLocation(lineProg, 'uMvp'), uLineColor: gl.getUniformLocation(lineProg, 'uColor'),
      uPointMvp: gl.getUniformLocation(pointProg, 'uMvp'), uPointColor: gl.getUniformLocation(pointProg, 'uColor'),
      uScale: gl.getUniformLocation(pointProg, 'uScale') };
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);         // additive: overlapping light adds up, like phosphor
    gl.clearColor(0, 0, 0, 1);
    uploadLines();
  }

  function uploadLines() {
    weirShown = !!view.flags.weir;
    const data = buildLines(world, { weir: weirShown });
    lineCount = data.length / 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, G.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // Looks down on the map more steeply in tall panes, and backs off just far
  // enough that the whole map fits, whatever shape the pane is.
  let fit = { aspect: 0, dist: 4 };
  function camera(aspect, yaw, fov) {
    const elev = 0.66 + 0.5 * (1 - smooth(0.7, 1.7, aspect));     // radians above the horizon
    const build = (dist) => {
      const eye = [Math.sin(yaw) * Math.cos(elev) * dist, -Math.cos(yaw) * Math.cos(elev) * dist, Math.sin(elev) * dist];
      return mul(perspective(fov, aspect, 0.1, 40), lookAt(eye, [0, 0, 0.08], [0, 0, 1]));
    };
    if (Math.abs(aspect - fit.aspect) > 0.001) {
      const fits = (dist) => {
        const m = build(dist).map((x) => x);
        for (const x of [-1.3, 1.3]) for (const y of [-1, 1]) for (const z of [0, 0.4]) {
          const w = m[3] * x + m[7] * y + m[11] * z + m[15];
          const nx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w, ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
          if (w <= 0 || Math.abs(nx) > 0.97 || Math.abs(ny) > 0.95) return false;
        }
        return true;
      };
      let lo = 1.5, hi = 14;
      for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
      fit = { aspect, dist: hi * 1.03 };      // a little slack for the camera drift
    }
    return build(fit.dist);
  }

  function fillPoints() {
    let n = 0;
    const put = (u, v, size, bright, shape, lift = 0.012) => {
      if (n >= MAX_POINTS) return;
      const p = toWorld(u, v, world.heightAt(u, v));
      inst.set([p[0], p[1], p[2] + lift, size, bright, shape], n * 6); n++;
    };
    const camp = world.camp;
    // Camp glow grows with the population ("cities light up as they grow").
    put(camp.x, camp.y, 0.1 + Math.sqrt(view.pop) * 0.022, 0.5, 3);
    // Huts and hearths spiral out from the camp.
    let k = 0;
    const place = (count, size, bright, shape, flicker) => {
      for (let i = 0; i < count && k < 150; i++, k++) {
        const ang = k * 2.39996, r = 0.012 + 0.011 * Math.sqrt(k);
        const f = flicker && !reducedMotion ? 0.8 + 0.3 * Math.sin(time * 7 + k * 1.7) * Math.sin(time * 3.1 + k) : 1;
        put(camp.x + Math.cos(ang) * r, camp.y + Math.sin(ang) * r * 1.2, size, bright * f, shape);
      }
    };
    place(view.structures.hearth || 0, 0.016, 1.3, 2, true);
    place(view.structures.shelter || 0, 0.022, 0.9, 1, false);
    for (const p of pulses) {
      const t = (time - p.start) / p.life;
      put(camp.x, camp.y, reducedMotion ? 0.12 : 0.03 + t * 0.3, (1 - t) * 1.2, 1);
    }
    for (const a of sim.agents) put(a.x, a.y, 0.011, 1.0, 0);
    return n;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const t0 = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now; time += dt;
    step(sim, dt, world.sites);
    pulses = pulses.filter((p) => time - p.start < p.life);
    if (!!view.flags.weir !== weirShown) uploadLines();
    resize();

    const aspect = canvas.width / canvas.height;
    const yaw = reducedMotion ? 0 : 0.14 * Math.sin(time * 0.07);
    const fov = 0.62, f = 1 / Math.tan(fov / 2);
    const mvp = camera(aspect, yaw, fov);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(G.lineProg);
    gl.uniformMatrix4fv(G.uLineMvp, false, mvp);
    gl.uniform3fv(G.uLineColor, color);
    gl.bindVertexArray(G.lineVao);
    gl.drawArrays(gl.LINES, 0, lineCount);

    const n = fillPoints();
    gl.useProgram(G.pointProg);
    gl.uniformMatrix4fv(G.uPointMvp, false, mvp);
    gl.uniform3fv(G.uPointColor, color);
    gl.uniform2f(G.uScale, f / aspect, f);
    gl.bindVertexArray(G.pointVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, G.instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst, 0, n * 6);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);   // every settler, hut, hearth and glow
    gl.bindVertexArray(null);

    stats.frames++; stats.ms += performance.now() - t0; stats.drawCalls = 2; stats.points = n;
  }

  function start() { if (!running && G) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { running = false; cancelAnimationFrame(raf); }

  // Don't draw while the tab is hidden.
  const onVisibility = () => { if (document.hidden) stop(); else start(); };
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); G = null; });
  canvas.addEventListener('webglcontextrestored', () => { init(); start(); });

  init();
  if (!document.hidden) start();

  return {
    setState(state) {
      if (state.seed !== seed) { seed = state.seed; world = createWorld(seed); sim = createSim(seed); if (G) uploadLines(); }
      view = { pop: state.pop, structures: { ...state.structures }, flags: { ...state.flags } };
      syncCount(sim, state.pop, world.sites);
    },
    setTheme(name) { color = COLORS[name] || COLORS.green; },
    setReducedMotion(v) { reducedMotion = v; },
    pulse() { pulses.push({ start: time, life: reducedMotion ? 0.5 : 1.3 }); },
    stats: () => ({ ...stats, avgMs: stats.frames ? stats.ms / stats.frames : 0, running, agents: sim.agents.length }),
    destroy() { stop(); document.removeEventListener('visibilitychange', onVisibility); },
  };
}
