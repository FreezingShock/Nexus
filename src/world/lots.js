// What a grown lot looks like, as plain data in the same shape as layout buildings (see render/buildings.js makeParts).
// Pure and deterministic: the same lot always gives the same building, so nothing visual needs saving.
import { tileCenter, tileOf, TILE } from './grid.js';
import { heightAt } from './terrain.js';

const DIRS = [[0, 1, 0], [1, 0, Math.PI / 2], [0, -1, Math.PI], [-1, 0, -Math.PI / 2]]; // dx, dz, rotY that faces it
const hash01 = (n) => { let h = Math.imul(n ^ 0x9E3779B9, 0x85EBCA6B); h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

const PALS = ['warm', 'pastel', 'slate', 'green'];

// zone 1..4, level 1..3, seed from the saved lot, tile index, and which neighbor tiles are roads.
export function lotBuilding(zone, level, seed, tile, roadAt) {
  const [gx, gz] = tileOf(tile), [x, z] = tileCenter(gx, gz);
  const r1 = hash01(seed), r2 = hash01(seed + 1), r3 = hash01(seed + 2);
  let rotY = 0;
  for (const [dx, dz, ry] of DIRS) if (roadAt(gx + dx, gz + dz)) { rotY = ry; break; }
  const w = 2.3 + r1 * 0.35, d = 2.3 + r2 * 0.35;
  const b = { id: 'lot' + tile, tile, zone, level, x, z, y: Math.max(0.1, heightAt(x, z)), rotY, w, d, dx: (r3 - 0.5) * 0.3, awning: -1, shop: false };
  const pal = PALS[Math.floor(r3 * 4)];
  if (zone === 1) {
    b.type = 'house'; b.pal = pal;
    b.floors = [2, 3 + Math.floor(r1 * 2), 5 + Math.floor(r2 * 2)][level - 1];
    b.roof = level === 1 ? (r2 < 0.5 ? 'gable' : 'hip') : 'mansard';
    b.name = ['Terrace house', 'Mansard block', 'Tall block'][level - 1];
  } else if (zone === 2) {
    b.type = 'house'; b.pal = pal === 'slate' ? 'pastel' : pal;
    b.floors = [2, 3, 4 + Math.floor(r1 * 2)][level - 1];
    b.roof = level === 3 ? 'flat' : level === 2 ? 'mansard' : (r2 < 0.5 ? 'gable' : 'hip');
    b.awning = Math.floor(r1 * 3);
    b.name = ['Corner shop', 'Shop row', 'Market block'][level - 1];
  } else if (zone === 3) {
    b.type = 'house'; b.pal = 'slate';
    b.floors = [1, 2, 2 + Math.floor(r1 * 2)][level - 1];
    b.roof = 'flat';
    b.name = ['Workshop', 'Works', 'Factory'][level - 1];
  } else {
    b.type = 'house'; b.pal = 'warm';
    b.floors = [2, 3, 4][level - 1];
    b.roof = level === 1 ? 'hip' : 'mansard';
    b.name = ['Civic house', 'Civic hall', 'Grand hall'][level - 1];
  }
  return b;
}
export { TILE };
