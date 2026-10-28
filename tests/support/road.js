// Paint only takes tiles with a road directly beside them, so a test that paints a bare tile lays a street next to it first.
import { inBounds, tileIndex } from '../../src/world/grid.js';

// Puts road on a neighbour of every tile in the list that has none yet (above it, or below on the top row).
export function roadBesideTiles(sim, tiles) {
  for (const [gx, gz] of tiles) {
    if (sim.grid.roadBeside(gx, gz)) continue;
    const [nx, nz] = inBounds(gx, gz - 1) ? [gx, gz - 1] : [gx, gz + 1];
    sim.grid.road[tileIndex(nx, nz)] = 1;
  }
}
