// Rules for putting a building on the shared grid. Pure data and math: no DOM, no THREE.
// Used by the placement sim system (to decide), the UI (to color the ghost) and tests.
import { GRID_N, TILE, BASE, tileIndex, tileCenter, inBounds } from './grid.js';
import { modelById, fitFootprint } from './models.js';

// Tiles of a placed building are written into the grid's `lot` layer with numbers from here up, so the road system
// and zoning (which both test `lot`) treat them as built. Lots grown by zoning stay below this.
export const LOT_BASE = 40000;
export const MAX_PLACED = 400;

export function lotTiles(gx, gz, fw, fd) {
  const out = [];
  for (let z = gz; z < gz + fd; z++) for (let x = gx; x < gx + fw; x++) out.push([x, z]);
  return out;
}

// Why a tile cannot take a building, or '' when it can.
export function tileProblem(grid, gx, gz) {
  if (!inBounds(gx, gz)) return 'outside';
  const i = tileIndex(gx, gz), b = grid.base[i];
  if (b === BASE.WATER) return 'water';
  if (b === BASE.STEEP) return 'steep';
  if (b === BASE.FARM) return 'farm';
  if (b === BASE.TOWN) return 'town';
  if (grid.road[i] !== 0) return 'road';
  if (grid.lot[i] !== 0) return 'taken';
  return '';
}

const WORDS = {
  outside: 'That is off the edge of the map',
  water: 'Too wet to build here',
  steep: 'Too steep to build here',
  farm: 'These fields are farmed',
  town: 'The old town streets are already full',
  road: 'A road is in the way',
  taken: 'Something is already built here',
};
export const problemText = (p) => WORDS[p] || '';

// Can a fw x fd lot with lowest tile (gx, gz) be built on? { ok, problem, blocked: [[gx, gz], ...], road }
//   road: a road runs within two tiles (a hint only; buildings can wait for their street)
export function checkLot(grid, gx, gz, fw, fd) {
  const blocked = [];
  let problem = '';
  for (const [x, z] of lotTiles(gx, gz, fw, fd)) {
    const p = tileProblem(grid, x, z);
    if (p) { blocked.push([x, z]); if (!problem) problem = p; }
  }
  let road = false;
  for (let z = gz - 2; z < gz + fd + 2 && !road; z++) for (let x = gx - 2; x < gx + fw + 2 && !road; x++) if (inBounds(x, z) && grid.road[tileIndex(x, z)] !== 0) road = true;
  return { ok: blocked.length === 0, problem, blocked, road };
}

// District palette by where a building stands, matching the four blocks of the founding town.
export function districtPal(x, z) { return x < 0 ? (z < 0 ? 'warm' : 'slate') : (z < 0 ? 'pastel' : 'green'); }

// Normalizes a placement request into a record, or { error }. Pure: does not touch the grid.
//   cmd: { model, gx, gz, fw, fd, rot }  with fw x fd the lot on the grid, after turning
// A model that was not drawn for that lot shrinks to the largest drawn size that fits, centered in the lot.
export function planPlacement(cmd) {
  const def = modelById(cmd && cmd.model);
  if (!def) return { error: 'unknown model' };
  const ints = [cmd.gx, cmd.gz, cmd.fw, cmd.fd].every(Number.isInteger);
  if (!ints || cmd.fw < 1 || cmd.fd < 1 || cmd.fw > 6 || cmd.fd > 6) return { error: 'bad lot' };
  const fit = fitFootprint(def, cmd.fw, cmd.fd);
  if (!fit) return { error: 'does not fit' };
  let rot = Number.isInteger(cmd.rot) ? ((cmd.rot % 4) + 4) % 4 : 0;
  if (def.tile === 'row' && fit.fw !== fit.fd) { const want = fit.fw > fit.fd ? 0 : 1; if (rot % 2 !== want) rot = (rot + 1) % 4; }
  const gx = cmd.gx + Math.floor((cmd.fw - fit.fw) / 2), gz = cmd.gz + Math.floor((cmd.fd - fit.fd) / 2);
  const [cx, cz] = tileCenter(gx, gz);
  const x = cx + (fit.fw - 1) * TILE / 2, z = cz + (fit.fd - 1) * TILE / 2;
  return { def, gx, gz, fw: fit.fw, fd: fit.fd, rot, exact: fit.exact, x, z, pal: districtPal(x, z) };
}

// Lot origins for a row dragged from tile `start` to tile `end`. Lots of fw x fd sit edge to edge along the longer
// drag direction, the first one centered on `start`. A plain click (start == end) gives one lot. Pure.
export const MAX_ROW = 40;
export function rowOrigins(start, end, fw, fd, max = MAX_ROW) {
  const dx = end[0] - start[0], dz = end[1] - start[1];
  const along = Math.abs(dx) >= Math.abs(dz);
  const step = along ? fw : fd, len = along ? dx : dz, dir = len < 0 ? -1 : 1;
  const n = Math.min(max, Math.floor(Math.abs(len) / step) + 1);
  const ox = Math.floor((fw - 1) / 2), oz = Math.floor((fd - 1) / 2);
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = dir * i * step;
    const cx = along ? start[0] + k : start[0], cz = along ? start[1] : start[1] + k;
    out.push([cx - ox, cz - oz]);
  }
  return out;
}

export { GRID_N };
