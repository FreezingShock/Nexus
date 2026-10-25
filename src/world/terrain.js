// Terrain height, river and farmland masks. Pure math, shared by sim and render.
//
// The land comes from a seed saved with the town (state.terrainSeed, see docs/TERRAIN.md). setTerrainSeed picks it for
// every height query that follows; sim, grid and render all call heightAt, so they always agree. Seed 0 is the old,
// hand-tuned land: towns saved before seeds existed keep it, so nothing they built moves.
import { makeRng } from './rng.js';

export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const hash = (i, j) => {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const vn = (x, y) => {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return hash(i, j) * (1 - u) * (1 - v) + hash(i + 1, j) * u * (1 - v) +
    hash(i, j + 1) * (1 - u) * v + hash(i + 1, j + 1) * u * v;
};

export const fbm = (x, y) => {
  let a = 0.5, s = 0, f = 1;
  for (let o = 0; o < 4; o++) { s += a * vn(x * f, y * f); a *= 0.5; f *= 2.07; }
  return s / 0.9375;
};

export const riverX = (z) => 52 + 7 * Math.sin(z * 0.045 + 0.6);
export const farmMask = (x, z) => (1 - smooth(26, 34, Math.abs(z))) * smooth(-33, -37, x);

function legacyHeight(x, z) {
  const d = Math.max(Math.abs(x), Math.abs(z));
  const f = smooth(30, 85, d);
  let h = f * (Math.pow(fbm(x * 0.021 + 3.1, z * 0.021 + 7.7), 1.5) * 30 + fbm(x * 0.09, z * 0.09) * 1.6);
  h = Math.max(0, h - 0.8);
  // Beyond the old 64-tile grid (96 units out) the ground rolls gently, so the grown grid is mostly buildable plain. Inside
  // the old grid this is zero, so saved roads and zones keep the ground they were built on.
  const far = smooth(100, 124, d);
  if (far > 0) h = h * (1 - far) + (0.9 + 0.9 * fbm(x * 0.03 + 5.3, z * 0.03 - 2.1)) * far;
  h *= 1 - 0.99 * farmMask(x, z);
  if (x > 24) h *= smooth(3, 10, Math.abs(z));
  // The mountain east of the river. The valley road runs straight into its west face, where the tunnel is. The ground
  // there stays flat up to x = 71, so the gate tile and the road before it are level.
  if (x > 71) h += 30 * smooth(71, 80, x) * (1 - smooth(18, 34, Math.abs(z))) * (0.7 + 0.6 * fbm(x * 0.04, z * 0.04));
  const k = 1 - smooth(2.6, 6.5, Math.abs(x - riverX(z)));
  return h * (1 - k) + (-1.3) * k;
}

// ---- seeded land ----
// From the middle out: a flat buildable centre (the village and the road to the tunnel), then meadows, plateaus with cliff
// edges, rolling hills, valleys and the odd lake, and at the map edge a wall of mountains that nothing can be built on.
// The river and the tunnel mountain beyond it are the same on every seed; everything on the village side of the river
// is rolled from the seed. Buildable ground is decided by slope (grid.js), never by height.
const RIM_START = 114, RIM_FULL = 144;          // distance (warped) where the edge mountains begin and reach full height
const EAST_SEED = 4242;                         // the bank beyond the river is always this land

// A fixed value in globalThis.NEXUS_TERRAIN_SEED wins; only the tests set it (tests/support/pin-land.js).
export function newSeed() {
  if (Number.isInteger(globalThis.NEXUS_TERRAIN_SEED)) return globalThis.NEXUS_TERRAIN_SEED;
  return 1 + Math.floor(Math.random() * 2147483646);
}
export const isSeed = (v) => Number.isInteger(v) && v >= 0 && v <= 2147483646;

function paramsFor(seed) {
  const r = makeRng(seed ^ 0x5eed);
  const o = []; for (let i = 0; i < 12; i++) o.push(r() * 900 + 20);
  const lakes = [];
  const nl = 1 + Math.floor(r() * 2.4);
  for (let i = 0; i < nl; i++) {
    const a = Math.PI * (0.55 + r() * 1.0), dist = 62 + r() * 38; // the west half; the road and the river are east
    lakes.push({ x: Math.cos(a) * dist, z: Math.sin(a) * dist, r: 7 + r() * 6 });
  }
  return {
    o, lakes,
    flat: 44 + r() * 8,            // radius of the level centre
    warp: 4 + r() * 6,            // how lopsided the rings are
    hillAmp: 4 + r() * 4,
    levels: 3 + Math.floor(r() * 3), step: 1.8 + r() * 1.6,
    plateau: 0.5 + r() * 0.25,     // share of the land that is terraced rather than rolling
    ridge: 10 + r() * 12,
  };
}
const EAST = paramsFor(EAST_SEED);
let SEED = 0, P = null, REV = 0;
export function setTerrainSeed(seed) {
  const s = isSeed(seed) ? seed : 0;
  if (s === SEED) return;
  SEED = s; P = s ? paramsFor(s) : null; REV++;
}
export const terrainSeed = () => SEED;
export const terrainRev = () => REV;

// Terraces: flat steps with a short ramp between. u runs 0..levels.
function terrace(u, ramp) {
  const i = Math.floor(u), f = u - i;
  return i + smooth(1 - ramp, 1, f);
}

// Ground without the river, for one side of the river.
function ground(x, z, q) {
  const o = q.o, e = Math.hypot(x, z), c = Math.max(Math.abs(x), Math.abs(z));
  const dw = e * 0.4 + c * 0.6 + (fbm(x * 0.012 + o[0], z * 0.012 + o[1]) - 0.5) * q.warp * 2;
  const rise = smooth(q.flat, q.flat + 30, dw);
  let h = 0;
  if (rise > 0) {
    const n1 = fbm(x * 0.012 + o[2], z * 0.012 + o[3]);
    const hills = smooth(0.3, 0.72, n1) * q.hillAmp;
    const n2 = fbm(x * 0.0075 + o[4], z * 0.0075 + o[5]);
    const ramp = 0.15 + 0.4 * fbm(x * 0.02 + o[6], z * 0.02 + o[7]);
    const plat = terrace(Math.min(q.levels, Math.max(0, (n2 - 0.26) / 0.36 * q.levels)), ramp) * q.step;
    const w = smooth(0.5 - 0.06, 0.5 + 0.06, fbm(x * 0.008 + o[8], z * 0.008 + o[9]) + q.plateau - 0.5);
    // Rolling swell over the terraces too, so a plateau top is never dead flat.
    const swell = (fbm(x * 0.03 + o[6], z * 0.03 + o[7]) - 0.5) * 1.1;
    h = rise * (w * (plat + q.step * 0.7 + swell * 0.7) + (1 - w) * (hills + q.hillAmp * 0.2 + swell));
    // Inner mountain ridges, in a few places only.
    h += smooth(0.62, 0.76, fbm(x * 0.014 + o[10], z * 0.014 + o[11])) * smooth(60, 100, dw) * q.ridge;
    h = Math.max(0, h);
  }
  // The edge of the map always climbs into mountains.
  const dr = e * 0.4 + c * 0.6, rim = smooth(RIM_START, RIM_FULL, dr + (fbm(x * 0.03 + 1.7, z * 0.03 + 5.9) - 0.5) * 8); // not lopsided: the edge is always walled
  if (rim > 0) h += rim * (34 + 12 * fbm(x * 0.03 + 9.1, z * 0.03 + 2.7));
  // Past the edge the mountains go on: higher, with peaks and passes, as far as anyone can look.
  const far = smooth(RIM_FULL, RIM_FULL + 90, dr);
  if (far > 0) h += far * (10 + 50 * fbm(x * 0.018 + 4.4, z * 0.018 + 8.8)) + Math.max(0, dr - RIM_FULL) * 0.12;
  // Calm meadows by the river, and the straight valley the road runs along to the tunnel. Both fade out where the
  // mountains begin, so neither cuts a notch through the wall at the edge of the map.
  const keep = 1 - smooth(100, 125, Math.max(Math.abs(x), Math.abs(z)));
  h *= 1 - keep * (1 - smooth(3, 14, Math.abs(x - riverX(z))));
  if (x > 24) h *= 1 - keep * (1 - smooth(4, 18, Math.abs(z)));
  return h;
}

export function baseHeightAt(x, z) {
  if (!SEED) return legacyHeight(x, z);
  const rx = riverX(z), dx = x - rx;
  let h = ground(x, z, dx < 0 ? P : EAST);
  if (dx < 0) {
    for (const l of P.lakes) {
      const d = Math.hypot(x - l.x, z - l.z);
      if (d > l.r * 2.2) continue;
      h *= smooth(l.r * 0.95, l.r * 2.2, d);                 // a low beach round the water
      const k = 1 - smooth(l.r * 0.55, l.r * 0.95, d);
      h = h * (1 - k) + (-1.3) * k;
    }
  }
  // The mountain beyond the river, with the tunnel in its west face. The ground stays flat up to x = 71.
  if (x > 71) h += 30 * smooth(71, 80, x) * (1 - smooth(18, 34, Math.abs(z))) * (0.7 + 0.6 * fbm(x * 0.04, z * 0.04));
  const k = (1 - smooth(2.6, 6.5, Math.abs(dx))) * (1 - smooth(112, 130, Math.abs(z))); // the river runs out in the foothills
  return h * (1 - k) + (-1.3) * k;
}

// ---- the player's edits (world/land.js) ----
// Offsets at the tile corners, (96 + 1) squared, 3 units apart from x = z = -145.5, blended across each tile. The corner
// lattice is repeated here (not imported from grid.js) because grid.js reads this file. `ON` skips the blend while a town
// has no edits, so untouched land costs nothing extra.
const ECN = 97, EEDGE = -145.5, ET = 3;
let EDITS = null, ON = false;
// The town's offsets (a Float32Array of ECN * ECN, kept by reference: the brush changes it in place), or null.
export function setLandEdits(edits) {
  const next = edits && edits.length === ECN * ECN ? edits : null;
  const on = !!next && next.some((v) => v !== 0);
  if (next === EDITS && on === ON) return;
  const was = ON;
  EDITS = next; ON = on;
  if (was || on) REV++;
}
// Call after changing the edits array in place (a brush dab): every cache keyed on terrainRev drops.
export const landEdits = () => EDITS;
export function landEdited() { if (!EDITS) return; ON = EDITS.some((v) => v !== 0); REV++; }
export function editAt(x, z) {
  if (!ON) return 0;
  const u = (x - EEDGE) / ET, v = (z - EEDGE) / ET;
  if (!(u >= 0 && v >= 0 && u <= ECN - 1 && v <= ECN - 1)) return 0;
  const i = Math.min(ECN - 2, Math.floor(u)), j = Math.min(ECN - 2, Math.floor(v)), fu = u - i, fv = v - j, k = j * ECN + i;
  return EDITS[k] * (1 - fu) * (1 - fv) + EDITS[k + 1] * fu * (1 - fv) + EDITS[k + ECN] * (1 - fu) * fv + EDITS[k + ECN + 1] * fu * fv;
}
export const heightAt = (x, z) => (ON ? baseHeightAt(x, z) + editAt(x, z) : baseHeightAt(x, z));
