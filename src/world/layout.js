// The town's scenery as plain data, generated from a fixed seed. No DOM, no THREE.
// The village itself (streets, buildings, the starter park) is saved state: see starter.js. This file holds only what
// is not built by the player: wind turbines, and the trees and pines around the village. Farms are buildings the player places (see models.js).
import { makeRng } from './rng.js';
import { heightAt, riverX, farmMask, terrainSeed, fbm } from './terrain.js';
import { TREE_COLORS } from './palettes.js';
import { GRID_HALF, TILE, worldToTile, inBounds, tileIndex } from './grid.js';
import { starterReserved } from './starter.js';

export const SEED = 11;

// One layout per land: the scenery follows the terrain seed (see terrain.js), so it is cached by seed.
let cached = null, cachedSeed = -1;
export function getLayout() {
  const seed = terrainSeed();
  if (!cached || cachedSeed !== seed) { cached = generate(seed); cachedSeed = seed; }
  return cached;
}

// Level ground with room round it, for a mast: no tile of the little patch differs by more than 0.4.
function levelAt(x, z) {
  let lo = Infinity, hi = -Infinity;
  for (const [dx, dz] of [[0, 0], [-3, 0], [3, 0], [0, -3], [0, 3]]) { const h = heightAt(x + dx, z + dz); lo = Math.min(lo, h); hi = Math.max(hi, h); }
  return lo > 0.05 && hi - lo < 0.4;
}

function generate(seed) {
  const rng = makeRng(seed ? seed ^ SEED : SEED);
  const out = { turbines: [], trees: [], pines: [] };

  if (!seed) out.turbines.push({ x: 40, z: -4, speed: 0.9 }, { x: -30, z: -40, speed: 0.7 });
  else {
    // Two masts on level ground, a good walk from the village, on the village side of the river.
    for (let tries = 0; tries < 400 && out.turbines.length < 2; tries++) {
      const x = (rng() - 0.5) * 220, z = (rng() - 0.5) * 220, d = Math.hypot(x, z);
      if (d < 50 || d > 105 || x > riverX(z) - 14 || !levelAt(x, z)) continue;
      out.turbines.push({ x: Math.round(x), z: Math.round(z), speed: 0.7 + rng() * 0.3 });
    }
  }

  // Scenery never stands on a street or a building of the starter town. Trees the player clears are saved, so the
  // town's first trees are only a starting point (see world/trees.js).
  const reserved = starterReserved();
  const free = (x, z) => {
    const [gx, gz] = worldToTile(x, z);
    return inBounds(gx, gz) && !reserved.has(tileIndex(gx, gz));
  };
  const treesRaw = [];

  // street trees along both streets, on the verges (a few tiles out from the centre line)
  for (const off of [-6, -3, 3, 6]) for (let k = -18; k <= 18; k += 3) {
    if (rng() < 0.35) treesRaw.push([k, off]);
    if (rng() < 0.35) treesRaw.push([off, k]);
  }
  // a few scattered trees around the village, leaving the middle open for growth
  for (let i = 0; i < 70; i++) {
    const x = (rng() - 0.5) * 90, z = (rng() - 0.5) * 90;
    if (Math.max(Math.abs(x), Math.abs(z)) < 14) continue;
    if (Math.abs(x - riverX(z)) < 9 || farmMask(x, z) > 0.05 || heightAt(x, z) < 0.05) continue;
    treesRaw.push([x, z]);
  }
  // Pines stand outside the grid, where the land ends: a forest round the valley, so the grid is open for building.
  const pinesRaw = [];
  const edge = GRID_HALF * TILE + 4;
  for (let i = 0; i < 300; i++) {
    const x = (rng() - 0.5) * 360, z = (rng() - 0.5) * 360, d = Math.max(Math.abs(x), Math.abs(z));
    if (d < edge || Math.abs(x - riverX(z)) < 8 || farmMask(x, z) > 0.02 || heightAt(x, z) < 0.4) continue;
    pinesRaw.push([x, z, 1 + rng() * 0.9]);
  }

  // Seeded land also has groves: clumps of trees over the gentler hills and meadows, off the steep ground and the shores.
  if (seed) {
    for (let i = 0, n = 0; i < 1600 && n < 240; i++) {
      const x = (rng() - 0.5) * 270, z = (rng() - 0.5) * 270;
      if (Math.max(Math.abs(x), Math.abs(z)) < 22 || Math.abs(x - riverX(z)) < 9 || x > riverX(z) - 6) continue;
      if (fbm(x * 0.045 + 31, z * 0.045 + 17) < 0.5) continue;
      const h = heightAt(x, z);
      if (h < 0.3 || h > 14 || Math.abs(heightAt(x + 3, z) - h) > 0.7 || Math.abs(heightAt(x, z + 3) - h) > 0.7) continue;
      treesRaw.push([x, z]); n++;
    }
  }

  for (const t of treesRaw) {
    if (!free(t[0], t[1])) continue;
    out.trees.push({ x: t[0], z: t[1], s: 0.8 + rng() * 0.5, rot: rng() * 6, col: Math.floor(rng() * TREE_COLORS.length) });
  }
  for (const t of pinesRaw) out.pines.push({ x: t[0], z: t[1], s: t[2], rot: rng() * 6 });
  return out;
}
