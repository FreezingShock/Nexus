// The starter town: a small village core on the shared grid. Pure data and math: no DOM, no THREE.
//
// Its buildings are placed records, built from the same catalog models as anything the player places, flagged
// `starter: true`. Its streets are ordinary road tiles. So bulldoze, undo, zoning, rebuilding, happiness and
// Renewal treat every tile of the starting town exactly like player-built content. There is no special ground.
// Tile rules: docs/GRID.md. Town rules: docs/STARTER-TOWN.md.
import { GRID_HALF, inBounds, tileIndex } from './grid.js';
import { lotTiles, planPlacement } from './placement.js';
import { seedOf } from './models.js';

// The first starter record is b1000. Player placements count on from after the last one.
export const STARTER_FIRST = 1000;

// The middle of the map. The village is written from it, so it stays on the origin when the grid grows.
const M = GRID_HALF;

// Straight streets as inclusive tile rectangles [gx0, gz0, gx1, gz1]. A T: a bar north to south through the middle of
// the village, and a stem east from its middle. The stem crosses the river on the bridge and ends at the tunnel gate.
// Tile (M, M) is the middle of the map, so the village sits on the origin.
export const STARTER_STREETS = [
  [M, M - 6, M, M + 6],
  [M + 1, M, M + 23, M],
];

// The tunnel gate: the stem's last tile. It is a dead end at the foot of the mountain. Cars and townsfolk come out of
// the tunnel here and drive or walk into it (see render/vehicle-agents.js and render/townsfolk.js).
export const TUNNEL_GATE = { gx: M + 23, gz: M };

// The bridge and the road into the tunnel: the stem from just before the river to the gate. Bulldozing is refused here,
// so the village always keeps its way out. The rest of the village stays editable.
export const PROTECTED_STRIP = { gz: M, gx0: M + 15, gx1: M + 23 };
export const starterProtected = () => {
  const set = new Set();
  for (let gx = PROTECTED_STRIP.gx0; gx <= PROTECTED_STRIP.gx1; gx++) set.add(tileIndex(gx, PROTECTED_STRIP.gz));
  return set;
};

// Buildings: model, lowest tile, footprint on the grid after turning (fw x fd), and the quarter turn that faces the
// front towards a street. Every building touches a street through its front, so it can be reached and it earns. They sit
// along the bar and the stem, a tile off the kerb here and there, so the village reads as scattered rather than a grid.
export const STARTER_LOTS = [
  { model: 'cottage',  gx: M - 1, gz: M - 5, fw: 1, fd: 1, rot: 1 },
  { model: 'terrace',  gx: M - 1, gz: M - 3, fw: 1, fd: 2, rot: 1 },
  { model: 'green',    gx: M - 2, gz: M + 2, fw: 2, fd: 2, rot: 1 },
  { model: 'cottage',  gx: M - 1, gz: M + 5, fw: 1, fd: 1, rot: 1 },
  { model: 'shop-row', gx: M + 1, gz: M - 5, fw: 1, fd: 2, rot: 3 },
  { model: 'cafe',     gx: M + 1, gz: M + 3, fw: 1, fd: 1, rot: 3 },
  { model: 'terrace',  gx: M + 1, gz: M + 5, fw: 1, fd: 2, rot: 3 },
  { model: 'cottage',  gx: M + 4, gz: M - 1, fw: 1, fd: 1, rot: 0 },
  { model: 'terrace',  gx: M + 6, gz: M - 1, fw: 2, fd: 1, rot: 0 },
  { model: 'cottage',  gx: M + 10, gz: M - 1, fw: 1, fd: 1, rot: 0 },
  { model: 'cottage',  gx: M + 4, gz: M + 1, fw: 1, fd: 1, rot: 2 },
  { model: 'mansard',  gx: M + 9, gz: M + 1, fw: 2, fd: 1, rot: 2 },
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
