// What a grown lot looks like: a record for the building model catalog (src/world/models.js).
// Pure and deterministic: the same lot always gives the same building, so nothing visual needs saving.
// Level only adds details (window boxes, chimneys, dormers, bunting), it never re-rolls the house.
// A grown lot answers to the id lot<tile> everywhere a placed building does (inspect, upgrade, bulldoze, pick).
import { tileCenter, tileOf } from './grid.js';
import { describe } from './models.js';

const DIRS = [[0, 1, 0], [1, 0, 1], [0, -1, 2], [-1, 0, 3]]; // dx, dz, quarter turns that face it (front is +z at rot 0)
// Models used per zone on a single tile. Workshops and warehouses were drawn for 1 x 2, here they stand on one tile.
export const ZONE_MODELS = [null, ['cottage', 'terrace', 'cottage', 'mansard'], ['shop-row', 'cafe', 'shop-row'], ['workshop', 'warehouse'], ['clinic', 'police', 'clinic']];

// The building id of the grown lot on a tile index, and the tile index back from an id (null for any other id).
export const lotId = (tile) => 'lot' + tile;
export function lotTileOf(id) {
  const m = typeof id === 'string' ? /^lot(\d+)$/.exec(id) : null;
  return m ? Number(m[1]) : null;
}

// zone 1..4, level 1..5, seed from the saved lot, tile index, and whether a neighbor tile is a road.
export function lotDescription(zone, level, seed, tile, roadAt) {
  const [gx, gz] = tileOf(tile);
  let rot = 0;
  for (const [dx, dz, r] of DIRS) if (roadAt(gx + dx, gz + dz)) { rot = r; break; }
  const models = ZONE_MODELS[zone], model = models[(seed >>> 0) % models.length];
  return describe({ id: lotId(tile), model, gx, gz, fw: 1, fd: 1, rot, seed }, level);
}
export { tileCenter };
