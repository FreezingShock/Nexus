// Roads on hills: a new road follows the ground while it is gentle enough, and where it is not, it cuts into the hill and
// builds up an embankment so it climbs at no more than GRADE per tile and lies level across. Pure math over the land
// edits (world/land.js): it says which corners move and by how much, and the roads system applies it with the stroke
// (paid for like the terrain tools, undone with the road). See docs/TERRAIN.md.
import { GRID_N, GRID_HALF, TILE, tileIndex } from './grid.js';
import { heightAt } from './terrain.js';
import { CN, cornerIndex, cornerWorld } from './land.js';

export const GRADE = 0.75; // the steepest climb a road takes, per tile (3 m up over a 12 m tile)
export const TILT = 0.5;   // a tile whose ground tilts more than this across is levelled under the road
const DRY = 0.05;

const centreY = (gx, gz) => Math.max(DRY, heightAt((gx - GRID_HALF) * TILE, (gz - GRID_HALF) * TILE));
function spreadOf(gx, gz) {
  const cx = (gx - GRID_HALF) * TILE, cz = (gz - GRID_HALF) * TILE;
  let hi = -Infinity, lo = Infinity;
  for (const [dx, dz] of [[0, 0], [-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) { const h = Math.max(0, heightAt(cx + dx, cz + dz)); hi = Math.max(hi, h); lo = Math.min(lo, h); }
  return hi - lo;
}

// The road's height at each tile of the path: the ground where that is within GRADE of its neighbours, eased otherwise.
// Tiles that already hold a road keep their height (the new road meets them where they are). Returns numbers per path tile.
export function profile(path, roads) {
  const n = path.length, p = path.map(([gx, gz]) => centreY(gx, gz));
  const fixed = path.map(([gx, gz]) => !!roads[tileIndex(gx, gz)]);
  for (let pass = 0; pass < 6; pass++) {
    for (let k = 1; k < n; k++) if (!fixed[k]) p[k] = Math.min(p[k - 1] + GRADE, Math.max(p[k - 1] - GRADE, p[k]));
    for (let k = n - 2; k >= 0; k--) if (!fixed[k]) p[k] = Math.min(p[k + 1] + GRADE, Math.max(p[k + 1] - GRADE, p[k]));
  }
  return p.map((v) => Math.max(DRY, v));
}

// What grading a new stroke along `path` would do: { moves: Map corner -> offset change, earth }.
// `locked(i, j)` keeps a corner as it is (the river, the rim: world/land.js editable). Only tiles that need it move: one too
// tilted across, or whose height had to change to keep the climb within GRADE.
export function gradeRoute(path, roads, locked) {
  const moves = new Map();
  if (!path.length) return { moves, earth: 0 };
  const p = profile(path, roads), at = new Map();
  path.forEach(([gx, gz], k) => at.set(tileIndex(gx, gz), p[k]));
  // A corner's target: the mean height of the road tiles round it (this stroke's profile, or a street already there).
  const roadY = (gx, gz) => {
    if (gx < 0 || gz < 0 || gx >= GRID_N || gz >= GRID_N) return null;
    const t = tileIndex(gx, gz);
    if (at.has(t)) return at.get(t);
    return roads[t] ? centreY(gx, gz) : null;
  };
  let earth = 0;
  path.forEach(([gx, gz], k) => {
    if (roads[tileIndex(gx, gz)]) return; // an existing street keeps its ground
    const natural = centreY(gx, gz);
    if (Math.abs(p[k] - natural) < 0.05 && spreadOf(gx, gz) <= TILT) return; // gentle enough: the road just follows it
    for (const [i, j] of [[gx, gz], [gx + 1, gz], [gx, gz + 1], [gx + 1, gz + 1]]) {
      if (i < 0 || j < 0 || i >= CN || j >= CN || locked(i, j)) continue;
      const c = cornerIndex(i, j);
      if (moves.has(c)) continue;
      let s = 0, m = 0;
      for (const [tx, tz] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) { const y = roadY(tx, tz); if (y !== null) { s += y; m++; } }
      const dh = s / m - heightAt(cornerWorld(i), cornerWorld(j));
      if (Math.abs(dh) < 0.02) continue;
      moves.set(c, dh); earth += Math.abs(dh);
    }
  });
  return { moves, earth };
}
