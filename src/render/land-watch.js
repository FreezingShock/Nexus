// Which ground the terrain tools just moved, for render code that must follow it. Each watcher keeps its own copy of the
// edits (world/terrain.js landEdits) and, when terrainRev moves, compares: poll() returns null when nothing moved, else
// { all, tiles: Set of tile indexes, box: { x0, z0, x1, z1 } in world units }. `all` means the whole land may have
// changed (a different edits array, or new land): redraw everything. Pure JS, no THREE, so the tests can run it.
import { landEdits, terrainRev } from '../world/terrain.js';
import { CN, C_EDGE, cornerOf } from '../world/land.js';
import { GRID_N, TILE } from '../world/grid.js';

export function createLandWatch() {
  let rev = terrainRev(), src = landEdits(), copy = src ? src.slice() : null;
  return {
    poll() {
      if (terrainRev() === rev) return null;
      rev = terrainRev();
      const now = landEdits();
      if (now !== src || !now || !copy) { src = now; copy = now ? now.slice() : null; return { all: true, tiles: null, box: null }; }
      const tiles = new Set();
      let i0 = CN, j0 = CN, i1 = -1, j1 = -1;
      for (let k = 0; k < now.length; k++) {
        if (now[k] === copy[k]) continue;
        copy[k] = now[k];
        const [i, j] = cornerOf(k);
        if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j;
        for (const [gx, gz] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) if (gx >= 0 && gz >= 0 && gx < GRID_N && gz < GRID_N) tiles.add(gz * GRID_N + gx);
      }
      if (!tiles.size) return null;
      return { all: false, tiles, box: { x0: C_EDGE + i0 * TILE, z0: C_EDGE + j0 * TILE, x1: C_EDGE + i1 * TILE, z1: C_EDGE + j1 * TILE } };
    },
  };
}
