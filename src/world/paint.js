// Paint for placed buildings: wall colours (a palette) and roof colours. Pure data and rules: no DOM, no THREE.
// Repainting costs coins by the building's footprint. The newer colours need a one-time Parts unlock, then every building can wear them.
// A record keeps its choice as `pal` (wall palette key) and `roof` (a ROOFS key, or none for the palette's own roof).
import { PAL, ROOFS } from './palettes.js';

// parts: one-time Parts to unlock the colour (0 is open from the start). The first four are the district palettes.
export const WALL_PARTS = { warm: 0, pastel: 0, slate: 0, green: 0, butter: 0, rose: 0, sage: 60, sky: 120, lilac: 180, brick: 300, plum: 450, teal: 600 };
export const ROOF_PARTS = { tile: 0, slate: 0, rose: 0, moss: 60, plum: 120, ochre: 180, harbour: 240, copper: 450 };
export const WALL_COST = 90;  // coins per footprint tile
export const ROOF_COST = 60;

export const wallKeys = () => Object.keys(WALL_PARTS);
export const roofKeys = () => Object.keys(ROOF_PARTS);
export const wallUnlockId = (key) => 'w:' + key;
export const roofUnlockId = (key) => 'r:' + key;

export const isWall = (key) => Object.prototype.hasOwnProperty.call(WALL_PARTS, key) && !!PAL[key];
export const isRoof = (key) => Object.prototype.hasOwnProperty.call(ROOF_PARTS, key) && !!ROOFS[key];
export const wallOpen = (key, unlocks) => WALL_PARTS[key] === 0 || unlocks.includes(wallUnlockId(key));
export const roofOpen = (key, unlocks) => ROOF_PARTS[key] === 0 || unlocks.includes(roofUnlockId(key));

export const wallCost = (rec) => WALL_COST * rec.fw * rec.fd;
export const roofCost = (rec) => ROOF_COST * rec.fw * rec.fd;

// Untrusted unlock list in, known ids that really need Parts out.
export function sanitizeUnlocks(raw) {
  const ok = (id) => typeof id === 'string' && ((id.startsWith('w:') && isWall(id.slice(2)) && WALL_PARTS[id.slice(2)] > 0) || (id.startsWith('r:') && isRoof(id.slice(2)) && ROOF_PARTS[id.slice(2)] > 0));
  return [...new Set((Array.isArray(raw) ? raw : []).filter(ok))];
}
