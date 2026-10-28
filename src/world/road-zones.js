// How roads and zone paint touch each other, as pure reads of the grid (the sim acts on them, the road tool previews them).
// A grown house (grid.lot === tile + 1) gives way to a road; a placed building (lot >= 40000) still blocks one.
// Paint only exists beside a road, so taking a road away strands the empty paint that leaned on it.
import { inBounds, tileIndex } from './grid.js';

const NEIGH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const isGrownLot = (grid, i) => grid.lot[i] === i + 1;

// What laying road on these tile indices clears: the grown houses on them, and every painted tile (houses included).
export function clearedBy(grid, idxs) {
  const houses = [], paint = [];
  for (const i of idxs) if (grid.zone[i]) { paint.push(i); if (isGrownLot(grid, i)) houses.push(i); }
  return { houses, paint };
}

// Empty painted tiles beside these (road) tile indices that would have no road beside them if those roads went.
// Grown houses stay standing, as they always have, so only empty paint counts.
export function strandedAfter(grid, idxs) {
  const gone = new Set(idxs), seen = new Set(), out = [];
  for (const i of idxs) {
    const gx = i % grid.N, gz = (i / grid.N) | 0;
    for (const [dx, dz] of NEIGH) {
      const x = gx + dx, z = gz + dz;
      if (!inBounds(x, z)) continue;
      const n = tileIndex(x, z);
      if (seen.has(n) || !grid.zone[n] || grid.lot[n] || gone.has(n)) continue;
      seen.add(n);
      let fed = false;
      for (const [ex, ez] of NEIGH) { const mx = x + ex, mz = z + ez; if (inBounds(mx, mz)) { const m = tileIndex(mx, mz); if (grid.road[m] && !gone.has(m)) { fed = true; break; } } }
      if (!fed) out.push(n);
    }
  }
  return out;
}

// Empty painted tiles beside these (new road) tile indices that have no road beside them yet: they can start growing.
export function wakenedBy(grid, idxs) {
  const on = new Set(idxs), seen = new Set(), out = [];
  for (const i of idxs) {
    const gx = i % grid.N, gz = (i / grid.N) | 0;
    for (const [dx, dz] of NEIGH) {
      const x = gx + dx, z = gz + dz;
      if (!inBounds(x, z)) continue;
      const n = tileIndex(x, z);
      if (seen.has(n) || on.has(n) || !grid.zone[n] || grid.lot[n] || grid.road[n]) continue;
      seen.add(n);
      if (!NEIGH.some(([ex, ez]) => inBounds(x + ex, z + ez) && grid.road[tileIndex(x + ex, z + ez)])) out.push(n);
    }
  }
  return out;
}
