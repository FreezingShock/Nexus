// The starter town: a small village core on the shared grid. Pure data and math: no DOM, no THREE.
//
// Its buildings are placed records, built from the same catalog models as anything the player places, flagged
// `starter: true`. Its streets are ordinary road tiles. So bulldoze, undo, zoning, rebuilding, happiness and
// Renewal treat every tile of the starting town exactly like player-built content. There is no special ground.
// Tile rules: docs/GRID.md. Town rules: docs/STARTER-TOWN.md.
import { inBounds, tileIndex } from './grid.js';
import { lotTiles, planPlacement } from './placement.js';
import { seedOf } from './models.js';

// The first starter record is b1000. Player placements count on from after the last one.
export const STARTER_FIRST = 1000;

// Straight streets as inclusive tile rectangles [gx0, gz0, gx1, gz1]: a main street and a cross street, meeting at the
// village square. Tile (32, 32) is the middle of the map, so the village sits on the origin.
export const STARTER_STREETS = [
  [26, 32, 38, 32],
  [32, 26, 32, 38],
];

// Buildings: model, lowest tile, footprint on the grid after turning (fw x fd), and the quarter turn that faces the
// front towards a street. Every building touches a street through its front, so it can be reached and it earns.
export const STARTER_LOTS = [
  { model: 'terrace',  gx: 26, gz: 31, fw: 2, fd: 1, rot: 0 },
  { model: 'cottage',  gx: 28, gz: 31, fw: 1, fd: 1, rot: 0 },
  { model: 'mansard',  gx: 30, gz: 28, fw: 2, fd: 1, rot: 1 },
  { model: 'shop-row', gx: 34, gz: 31, fw: 2, fd: 1, rot: 0 },
  { model: 'cafe',     gx: 37, gz: 31, fw: 1, fd: 1, rot: 0 },
  { model: 'cottage',  gx: 33, gz: 27, fw: 1, fd: 1, rot: 3 },
  { model: 'cottage',  gx: 27, gz: 33, fw: 1, fd: 1, rot: 2 },
  { model: 'terrace',  gx: 34, gz: 33, fw: 2, fd: 1, rot: 2 },
  { model: 'cottage',  gx: 37, gz: 33, fw: 1, fd: 1, rot: 2 },
  { model: 'green',    gx: 30, gz: 34, fw: 2, fd: 2, rot: 0 },
];
export const STARTER_COUNT = STARTER_LOTS.length;

// Every street tile, once each (the crossing is shared).
export function starterStreetTiles() {
  const seen = new Set(), out = [];
  for (const [x0, z0, x1, z1] of STARTER_STREETS) {
    for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
      const k = tileIndex(gx, gz);
      if (!seen.has(k)) { seen.add(k); out.push([gx, gz]); }
    }
  }
  return out;
}

// The starter buildings as placed records. Each lot must be exactly the footprint its model is drawn for.
export function starterPlaced() {
  return STARTER_LOTS.map((l, i) => {
    const id = 'b' + (STARTER_FIRST + i);
    const plan = planPlacement({ model: l.model, gx: l.gx, gz: l.gz, fw: l.fw, fd: l.fd, rot: l.rot });
    if (plan.error || !plan.exact) throw new Error('starter lot ' + id + ' does not match its model');
    return { id, model: l.model, gx: plan.gx, gz: plan.gz, fw: plan.fw, fd: plan.fd, rot: plan.rot, pal: plan.pal, seed: seedOf(id), starter: true };
  });
}

// Tile indexes the starter town takes (its streets and its buildings). The layout keeps scenery off them.
export function starterReserved() {
  const set = new Set(starterStreetTiles().map(([gx, gz]) => tileIndex(gx, gz)));
  for (const r of starterPlaced()) for (const [x, z] of lotTiles(r.gx, r.gz, r.fw, r.fd)) if (inBounds(x, z)) set.add(tileIndex(x, z));
  return set;
}
