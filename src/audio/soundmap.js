// Where the town's sounds come from, and how they reach the camera. The map is a coarse grid of cells, each holding how
// much street, homes, shops, workshops, farmland, green and water it has. hear() turns a listener (the camera's eye) into
// a level and a gentle left-right pan for each kind of place, plus how muffled the town is from up high.
// Zoomed in, the cells right under the camera dominate, so a riverbank sounds of water and a high street of feet and
// wheels. Zoomed out, the hearing circle widens and the town blends into a soft, muffled hum that never goes silent.
// Pure: no DOM, no Web Audio, no Three.js. Reads the sim's grid and records; changes nothing.
import { GRID_N, TILE, GRID_HALF, BASE, tileIndex } from '../world/grid.js';
import { MODELS } from '../world/models.js';
import { PLACED_LOT_MIN } from '../sim/zones.js';
import { falloff } from './attenuation.js';

export const CELL = 4;                       // tiles per cell side
export const CELLS = Math.ceil(GRID_N / CELL); // cells per map side
const CELL_W = CELL * TILE;                  // world units per cell side
export const KINDS = ['street', 'homes', 'shops', 'work', 'farm', 'green', 'water'];

// Tiles of a kind it takes to fill a cell (16 tiles), so a single road through a cell already reads as a street.
const FULL = { street: 4, homes: 7, shops: 5, work: 5, farm: 8, green: 5, water: 6 };
const CAT_KIND = { home: 'homes', shop: 'shops', work: 'work', service: 'shops', landmark: 'shops', farm: 'farm', park: 'green' };
const ZONE_KIND = [null, 'homes', 'shops', 'work', 'shops'];
const catOf = new Map(MODELS.map((m) => [m.id, m.cat]));

// How the camera height turns into hearing. Orbit eye heights run from about 8 (zoomed right in) to about 42 (all the
// way out); free-fly can go lower or higher.
export const HEAR = {
  low: 9, high: 48,        // eye heights for fully close and fully distant
  floor: 0.38,             // the share of level the town keeps when fully zoomed out: a soft hum, never silence
  radius: [10, 2],         // hearing circle: base + per unit of height, so zooming out hears a wider patch
  boost: 1.7,              // how dense a patch must be to play a kind at full level
  pan: 0.4,                // the widest a sound leans left or right (gentle stereo)
  wild: 0.3,               // open land counts a little as green, so the countryside has birds and crickets
};

// Builds the map: { cells: { kind: Float32Array(CELLS * CELLS) } }, each value 0..1.
// `grid` is the sim grid (base, road, zone, lot arrays); `placed` the building records; `trees` the tree records.
export function buildSoundMap({ grid, placed = [], trees = [] } = {}) {
  const n = CELLS * CELLS;
  const raw = Object.fromEntries(KINDS.map((k) => [k, new Float32Array(n)]));
  const cellOfTile = (gx, gz) => Math.floor(gz / CELL) * CELLS + Math.floor(gx / CELL);
  if (grid && grid.base) {
    for (let gz = 0; gz < GRID_N; gz++) for (let gx = 0; gx < GRID_N; gx++) {
      const i = tileIndex(gx, gz), c = cellOfTile(gx, gz);
      const base = grid.base[i];
      if (base === BASE.WATER) { raw.water[c] += 1; continue; }
      if (base === BASE.FARM) raw.farm[c] += 1;
      if (grid.road && grid.road[i]) { raw.street[c] += 1; continue; }
      const lot = grid.lot ? grid.lot[i] : 0;
      if (lot >= PLACED_LOT_MIN) continue; // placed buildings are counted from their records below
      const zk = grid.zone ? ZONE_KIND[grid.zone[i]] : null;
      if (zk) raw[zk][c] += lot ? 1 : 0.3; // a grown lot is a building; bare paint is a quiet promise of one
      else if (base === BASE.LAND && !lot) raw.green[c] += HEAR.wild;
    }
  }
  for (const r of placed || []) {
    const kind = CAT_KIND[catOf.get(r && r.model)];
    if (!kind || !Number.isFinite(r.gx) || !Number.isFinite(r.gz)) continue;
    const fw = r.fw || 1, fd = r.fd || 1;
    for (let dz = 0; dz < fd; dz++) for (let dx = 0; dx < fw; dx++) {
      const gx = r.gx + dx, gz = r.gz + dz;
      if (gx >= 0 && gz >= 0 && gx < GRID_N && gz < GRID_N) raw[kind][cellOfTile(gx, gz)] += 1;
    }
  }
  for (const t of trees || []) {
    if (!t || !Number.isFinite(t.x) || !Number.isFinite(t.z)) continue;
    const gx = Math.floor(t.x / TILE + 0.5) + GRID_HALF, gz = Math.floor(t.z / TILE + 0.5) + GRID_HALF;
    if (gx >= 0 && gz >= 0 && gx < GRID_N && gz < GRID_N) raw.green[cellOfTile(gx, gz)] += 1;
  }
  const cells = {};
  for (const k of KINDS) {
    cells[k] = raw[k];
    for (let c = 0; c < n; c++) cells[k][c] = Math.min(1, raw[k][c] / FULL[k]);
  }
  return { cells };
}

// The middle of a cell in world units.
export function cellCenter(c) {
  const cx = c % CELLS, cz = Math.floor(c / CELLS);
  return { x: ((cx + 0.5) * CELL - GRID_HALF - 0.5) * TILE, z: ((cz + 0.5) * CELL - GRID_HALF - 0.5) * TILE };
}
const CENTERS = Array.from({ length: CELLS * CELLS }, (_, c) => cellCenter(c));

// The camera's right-hand direction on the ground, from its heading (orbit azimuth or free-fly yaw). Both cameras look
// along (-sin a, -cos a), so right is (cos a, -sin a).
export const rightOf = (a) => (Number.isFinite(a) ? { x: Math.cos(a), z: -Math.sin(a) } : { x: 1, z: 0 });

// How close the town feels from an eye height: 1 right down in the streets, 0 from as high as the camera goes.
export const closeness = (h) => falloff(Number.isFinite(h) ? Math.max(0, h) : HEAR.high, HEAR.low, HEAR.high);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// What the listener hears: { gain: { kind: 0..1 }, pan: { kind: -1..1 }, muffle: 0..1 }, plus derived places:
// `people` (homes and shops together) and `wild` (green and farmland together). Never NaN.
export function hear(map, listener, heading = 0) {
  const gain = {}, pan = {};
  const lx = Number.isFinite(listener && listener.x) ? listener.x : 0;
  const lz = Number.isFinite(listener && listener.z) ? listener.z : 0;
  const near = closeness(listener && listener.h);
  const h = Number.isFinite(listener && listener.h) ? Math.max(0, listener.h) : HEAR.high;
  const muffle = 1 - near;
  const presence = HEAR.floor + (1 - HEAR.floor) * near;
  const radius = HEAR.radius[0] + HEAR.radius[1] * h;
  const right = rightOf(heading);
  const n = CENTERS.length;
  const loc = new Float32Array(n), side = new Float32Array(n);
  let area = 0;
  for (let c = 0; c < n; c++) {
    const p = CENTERS[c], dx = p.x - lx, dz = p.z - lz, d = Math.hypot(dx, dz);
    // a cell counts for at least the share of it inside the circle, so a tight circle zoomed in still hears its own cell
    const l = Math.max(falloff(d, radius * 0.35, radius), d < CELL_W * 0.75 ? 1 : 0);
    loc[c] = l; area += l;
    side[c] = clamp((dx * right.x + dz * right.z) / (d + CELL_W * 0.5), -1, 1);
  }
  const cells = (map && map.cells) || {};
  for (const k of KINDS) {
    const w = cells[k];
    let sum = 0, lean = 0;
    if (w) for (let c = 0; c < n; c++) { if (!loc[c] || !w[c]) continue; const v = w[c] * loc[c]; sum += v; lean += v * side[c]; }
    const density = area > 0 ? sum / area : 0;
    gain[k] = clamp(density * HEAR.boost, 0, 1) * presence;
    pan[k] = sum > 0 ? clamp((lean / sum) * HEAR.pan * (1 - 0.6 * muffle), -HEAR.pan, HEAR.pan) : 0;
  }
  const mix = (a, b, wa = 1, wb = 1) => {
    const g = Math.max(gain[a] * wa, gain[b] * wb);
    const t = gain[a] * wa + gain[b] * wb;
    return { g: clamp(g, 0, 1), p: t > 0 ? (pan[a] * gain[a] * wa + pan[b] * gain[b] * wb) / t : 0 };
  };
  const people = mix('homes', 'shops', 0.75, 1);
  gain.people = people.g; pan.people = people.p;
  const wild = mix('green', 'farm', 1, 0.8);
  gain.wild = wild.g; pan.wild = wild.p;
  return { gain, pan, muffle };
}

// The listener and heading for a camera (camera.mode, camera.view, camera.free in src/render/camera.js).
export function headingOf({ mode, view, free }) {
  if (mode === 'fly' && free) return free.yaw;
  return view ? view.az : 0;
}
