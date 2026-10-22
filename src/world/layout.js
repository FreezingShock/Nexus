// The town's scenery as plain data, generated from a fixed seed. No DOM, no THREE.
// The village itself (streets, buildings, the starter park) is saved state: see starter.js. This file holds only what
// is not built by the player: wind turbines, and the trees and pines around the village. Farms are buildings the player places (see models.js).
import { makeRng } from './rng.js';
import { heightAt, riverX, farmMask } from './terrain.js';
import { TREE_COLORS } from './palettes.js';
import { GRID_HALF, TILE, worldToTile, inBounds, tileIndex } from './grid.js';
import { starterReserved } from './starter.js';

export const SEED = 11;

let cached = null;
export function getLayout() {
  if (!cached) cached = generate();
  return cached;
}

function generate() {
  const rng = makeRng(SEED);
  const out = { turbines: [], trees: [], pines: [] };

  out.turbines.push({ x: 40, z: -4, speed: 0.9 }, { x: -30, z: -40, speed: 0.7 });

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
    if (Math.abs(x - riverX(z)) < 9 || farmMask(x, z) > 0.05) continue;
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

  for (const t of treesRaw) {
    if (!free(t[0], t[1])) continue;
    out.trees.push({ x: t[0], z: t[1], s: 0.8 + rng() * 0.5, rot: rng() * 6, col: Math.floor(rng() * TREE_COLORS.length) });
  }
  for (const t of pinesRaw) out.pines.push({ x: t[0], z: t[1], s: t[2], rot: rng() * 6 });
  return out;
}
