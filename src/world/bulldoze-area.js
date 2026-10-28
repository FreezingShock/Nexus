// What a bulldoze box would take. Pure and shared: the preview in the UI and the sim command read the same answer.
// Buildings are placed records and grown lots; roads give back half of what each tile cost (the bridge and the tunnel
// road stay); zone paint and trees go too. Placed buildings give nothing back, as when they are bulldozed one by one.
import { rectTiles, tileIndex, worldToTile } from './grid.js';
import { lotTiles } from './placement.js';

// Buildings at or above this count, or more coins back than REFUND_ASK, ask first.
export const ASK_BUILDINGS = 12;
export const ASK_REFUND = 1000;

// a, b: corner tiles. protectedRoads: a Set of road tile indexes that must stay.
export function scanArea(state, grid, a, b, protectedRoads) {
  const tiles = rectTiles(a, b);
  const inside = new Set(tiles.map(([gx, gz]) => tileIndex(gx, gz)));
  const roads = [], hit = new Map(); // hit: tile index -> [gx, gz], every tile that has something on it
  const mark = (gx, gz) => { const i = tileIndex(gx, gz); if (inside.has(i)) hit.set(i, [gx, gz]); };
  let refund = 0, zones = 0, grown = 0;
  for (const [gx, gz] of tiles) {
    const i = tileIndex(gx, gz), r = state.roads[i];
    if (r && !protectedRoads.has(i)) { roads.push([gx, gz]); refund += Math.floor(r.p / 2); mark(gx, gz); }
    if (grid.zone[i]) { zones++; mark(gx, gz); if (grid.lot[i] === i + 1) grown++; }
  }
  const gone = new Set(state.removed);
  const buildings = [];
  for (const rec of state.placed) {
    if (gone.has(rec.id)) continue;
    const foot = lotTiles(rec.gx, rec.gz, rec.fw, rec.fd).filter(([gx, gz]) => inside.has(tileIndex(gx, gz)));
    if (!foot.length) continue;
    buildings.push(rec.id);
    for (const [gx, gz] of foot) mark(gx, gz);
  }
  const trees = [];
  for (const t of state.trees || []) {
    const [gx, gz] = worldToTile(t.x, t.z);
    if (inside.has(tileIndex(gx, gz))) { trees.push(t.id); mark(gx, gz); }
  }
  return {
    roads, refund, zones, grown, buildings, trees, hit: [...hit.values()],
    count: buildings.length + grown,                       // buildings in all
    empty: !roads.length && !zones && !buildings.length && !trees.length,
    asks: buildings.length + grown >= ASK_BUILDINGS || refund > ASK_REFUND,
  };
}
