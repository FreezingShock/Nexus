// Land edits: the player's terrain tools raise, lower, flatten and smooth the ground. Pure data and math, no DOM, no THREE.
//
// An edit is a height offset at a tile corner: the (GRID_N + 1) squared lattice the tile overlays already use (render/
// ground.js), 3 units apart. terrain.js adds the offsets to the seeded land, blended across each tile, so heightAt (and so
// the grid, roads, buildings and the ground mesh) all see the edited land. Saved in state.land as [corner, offset] pairs,
// offsets in hundredths. A save without it has no edits, so old towns load exactly as they were. See docs/TERRAIN.md.
//
// The tools only reach the buildable ground: the mountain rim at the edge of the map, the tunnel mountain, the river and
// its banks stay as the land made them (`editable`). Raised ground stops below the mountain line (LAND_TOP).
import { GRID_N, GRID_HALF, TILE, MOUNTAIN_TOP } from './grid.js';
import { baseHeightAt, riverX } from './terrain.js';

export const CN = GRID_N + 1;                      // corners a side
export const C_EDGE = -GRID_HALF * TILE - TILE / 2; // world x (and z) of corner 0
export const LAND_TOP = MOUNTAIN_TOP - 4;          // ground the tools raise stops here: hills, never new mountains
export const LAND_LOW = -2;                        // and digging stops here: a pond is about this deep
export const MAX_EDITS = CN * CN;
export const STEP = 0.05;                          // offsets are stored to this precision

export const cornerIndex = (i, j) => j * CN + i;
export const cornerOf = (k) => [k % CN, Math.floor(k / CN)];
export const cornerWorld = (i) => C_EDGE + i * TILE;

// Can the tools touch this corner? Inside the grid, off the river and its banks, west of the tunnel mountain, and on
// ground that is not already part of the mountains (by the land as it was made, so an edit never unlocks its neighbour).
let lockCache = null, lockKey = '';
export function editable(i, j, key = '') {
  if (!lockCache || lockKey !== key) { lockCache = new Int8Array(CN * CN); lockKey = key; }
  const k = cornerIndex(i, j);
  if (!lockCache[k]) {
    const x = cornerWorld(i), z = cornerWorld(j);
    const edge = i < 2 || j < 2 || i > CN - 3 || j > CN - 3;
    const ok = !edge && Math.abs(x - riverX(z)) > 7.5 && x < 66 && baseHeightAt(x, z) < LAND_TOP;
    lockCache[k] = ok ? 1 : 2;
  }
  return lockCache[k] === 1;
}

// Offsets as a Float32Array over the corners, from the saved pairs (untrusted). Bad entries are dropped.
export function editsFromPairs(pairs) {
  const out = new Float32Array(CN * CN);
  if (!Array.isArray(pairs)) return out;
  for (const p of pairs.slice(0, MAX_EDITS)) {
    if (!Array.isArray(p) || p.length !== 2) continue;
    const [k, v] = p;
    if (!Number.isInteger(k) || k < 0 || k >= CN * CN || !Number.isFinite(v)) continue;
    out[k] = Math.max(-4000, Math.min(4000, Math.round(v))) / 100;
  }
  return out;
}
// The saved form: only corners that moved, [corner, hundredths].
export function pairsFromEdits(edits) {
  const out = [];
  for (let k = 0; k < edits.length; k++) { const v = Math.round(edits[k] * 100); if (v) out.push([k, v]); }
  return out;
}
export function sanitizeLand(raw) { return pairsFromEdits(editsFromPairs(raw)); }

// ---- the brush ----
// One dab of a tool at world (x, z) with radius r (world units). `h(x, z)` is the current ground (with edits);
// `locked(i, j)` says a corner must not move (out of reach); `low(i, j)` is the deepest it may be dug (ground under a road
// or a building never goes under water). Changes `edits` in place and returns { moved: [corner...], earth } where earth is how much ground moved, in
// corner-height units, for the price.
//   raise / lower: push the ground up or down, most in the middle of the brush.
//   flatten: pull the ground toward `level` (the height where the stroke started).
export const TOOLS = ['raise', 'lower', 'flatten'];
export const BRUSH = { small: 3, medium: 6, large: 10 };
export const RATE = { raise: 0.6, lower: 0.6, flatten: 0.7 };

export function brush(edits, { tool, x, z, r = BRUSH.medium, level = 0, strength = 1 }, h, locked, low = () => LAND_LOW) {
  const moved = [];
  let earth = 0;
  if (!TOOLS.includes(tool) || !Number.isFinite(x) || !Number.isFinite(z)) return { moved, earth };
  r = Math.max(1.5, Math.min(15, r));
  const i0 = Math.max(0, Math.floor((x - r - C_EDGE) / TILE)), i1 = Math.min(CN - 1, Math.ceil((x + r - C_EDGE) / TILE));
  const j0 = Math.max(0, Math.floor((z - r - C_EDGE) / TILE)), j1 = Math.min(CN - 1, Math.ceil((z + r - C_EDGE) / TILE));
  const want = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const cx = cornerWorld(i), cz = cornerWorld(j), d = Math.hypot(cx - x, cz - z);
    if (d > r || locked(i, j)) continue;
    const w = (1 - (d / r) ** 2) ** 2 * strength * RATE[tool]; // soft falloff: full in the middle, nothing at the rim
    const now = h(cx, cz);
    let to = now;
    if (tool === 'raise') to = now + w;
    else if (tool === 'lower') to = now - w;
    else to = now + (level - now) * Math.min(1, w * 1.4);
    // Stay inside the band, but never yank ground that already lies outside it (a high plateau stays put under Lower).
    if (to > now) to = Math.max(now, Math.min(LAND_TOP, to));
    else to = Math.min(now, Math.max(low(i, j), to));
    want.push([cornerIndex(i, j), to - now]);
  }
  for (const [k, dh] of want) {
    const v = Math.round((edits[k] + dh) / STEP) * STEP;
    const change = Math.abs(v - edits[k]);
    if (change < STEP / 2) continue;
    edits[k] = v; moved.push(k); earth += change;
  }
  return { moved, earth };
}

// The tiles whose ground a set of moved corners touches, as [gx, gz] (each corner is shared by up to four tiles).
export function tilesOfCorners(moved) {
  const seen = new Set(), out = [];
  for (const k of moved) {
    const [i, j] = cornerOf(k);
    for (const [gx, gz] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) {
      if (gx < 0 || gz < 0 || gx >= GRID_N || gz >= GRID_N) continue;
      const t = gz * GRID_N + gx;
      if (!seen.has(t)) { seen.add(t); out.push([gx, gz]); }
    }
  }
  return out;
}
