// Road network helpers on the shared tile grid (see docs/GRID.md). Pure data and math: no DOM, no THREE.
//
// Saved shape: state.roads = { [tileIndex]: { t, d?, p } }
//   t  road type id ('two', 'bike', 'one', 'bus', 'free')
//   d  direction of travel for one-way roads: 0 east (+x), 1 south (+z), 2 west, 3 north
//   p  coins paid for the tile (the starter streets paid nothing), used for refunds
// Tiles connect to every 4-neighbor that is also a road, so shapes (curves, tees, crossings) are derived, never stored.
import { GRID_N, GRID_HALF, inBounds, tileIndex, tileOf } from './grid.js';
import { LINES } from './layout.js';
import { heightAt } from './terrain.js';

// Direction index -> grid step. 0 east (+x), 1 south (+z), 2 west (-x), 3 north (-z).
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const opposite = (d) => (d + 2) & 3;
export const dirOf = (a, b) => DIRS.findIndex(([dx, dz]) => a[0] + dx === b[0] && a[1] + dz === b[1]);

// Numeric kind written to grid.road for each type (0 is "no road", 255 is reserved for ROAD_STATIC).
export const ROAD_KIND = { two: 1, bike: 2, one: 3, bus: 4, free: 5 };
export const ROAD_IDS = Object.keys(ROAD_KIND);
export const MAX_STROKE = 240;

// The streets the town ships with, as editable tiles (a 5 by 5 street grid plus the road east to the workshop).
export function starterRoads() {
  const roads = {};
  const put = (gx, gz) => { roads[tileIndex(gx, gz)] = { t: 'two', p: 0 }; };
  for (const L of LINES) {
    const g = GRID_HALF + L / 3;
    for (let k = -8; k <= 8; k++) { put(g, GRID_HALF + k * 1); put(GRID_HALF + k, g); }
  }
  for (let gx = GRID_HALF + 9; gx <= GRID_HALF + 16; gx++) put(gx, GRID_HALF);
  return roads;
}

export const hasRoad = (roads, gx, gz) => inBounds(gx, gz) && roads[tileIndex(gx, gz)] !== undefined;
export const roadAt = (roads, gx, gz) => (inBounds(gx, gz) ? roads[tileIndex(gx, gz)] || null : null);

// Bit d is set when the neighbor in direction d is a road.
export function connMask(roads, gx, gz) {
  let m = 0;
  for (let d = 0; d < 4; d++) if (hasRoad(roads, gx + DIRS[d][0], gz + DIRS[d][1])) m |= 1 << d;
  return m;
}
export const dirsOfMask = (m) => [0, 1, 2, 3].filter((d) => m & (1 << d));

// What a tile looks like given its connections.
//   iso (none), end (one), straight (two opposite), corner (two at a right angle), tee (three), cross (four)
export function shapeOf(mask) {
  const dirs = dirsOfMask(mask);
  switch (dirs.length) {
    case 0: return { kind: 'iso', dirs };
    case 1: return { kind: 'end', dirs };
    case 2: return { kind: dirs[1] - dirs[0] === 2 ? 'straight' : 'corner', dirs };
    case 3: return { kind: 'tee', dirs };
    default: return { kind: 'cross', dirs };
  }
}

// ---- pencil strokes ----
// A stroke is an ordered list of 4-connected tiles [gx, gz]. It may revisit tiles (a loop that closes on itself).

// One step towards `target`, preferring the longer axis; on a tie it turns, so diagonals become even staircases.
function nextToward(path, target) {
  const last = path[path.length - 1], prev = path[path.length - 2];
  const dx = target[0] - last[0], dz = target[1] - last[1];
  let axis;
  if (Math.abs(dx) > Math.abs(dz)) axis = 0;
  else if (Math.abs(dz) > Math.abs(dx)) axis = 1;
  else axis = prev && prev[1] === last[1] ? 1 : 0;
  return axis === 0 ? [last[0] + Math.sign(dx), last[1]] : [last[0], last[1] + Math.sign(dz)];
}

// Extends (or rewinds) a stroke so it ends at `target`. Stepping back onto the previous tile erases the last tile,
// so the pencil can be dragged backwards to undo. `canStep(tile)` decides what the pencil may enter; a refused tile
// stops the stroke there and is reported in `blocked`.
export function extendStroke(path, target, canStep = () => true) {
  const out = path.slice();
  let blocked = null;
  for (let guard = 0; guard < 4 * GRID_N; guard++) {
    const last = out[out.length - 1];
    if (last[0] === target[0] && last[1] === target[1]) break;
    const n = nextToward(out, target), prev = out[out.length - 2];
    if (prev && prev[0] === n[0] && prev[1] === n[1]) { out.pop(); continue; }
    if (out.length >= MAX_STROKE) break;
    if (!inBounds(n[0], n[1]) || !canStep(n)) { blocked = n; break; }
    out.push(n);
  }
  return { path: out, blocked };
}

// Straight line from a along the longer axis towards b (the shift ruler).
export function rulerPath(a, b) {
  const horiz = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  const n = Math.min(MAX_STROKE - 1, horiz ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1]));
  const s = horiz ? Math.sign(b[0] - a[0]) : Math.sign(b[1] - a[1]);
  const out = [];
  for (let k = 0; k <= n; k++) out.push(horiz ? [a[0] + s * k, a[1]] : [a[0], a[1] + s * k]);
  return out;
}

// One-turn route from a to b: the longer leg first, then the shorter (click, move, click).
export function elbowPath(a, b) {
  const horizFirst = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  const out = [[a[0], a[1]]];
  const walk = (axis, to) => {
    while (out.length < MAX_STROKE) {
      const l = out[out.length - 1];
      if (l[axis] === to) return;
      out.push(axis === 0 ? [l[0] + Math.sign(to - l[0]), l[1]] : [l[0], l[1] + Math.sign(to - l[1])]);
    }
  };
  if (horizFirst) { walk(0, b[0]); walk(1, b[1]); } else { walk(1, b[1]); walk(0, b[0]); }
  return out;
}

// Direction of travel on each stroke tile: towards the next tile, the last tile keeps the heading it arrived with.
export function pathDirs(path) {
  const d = path.map((t, k) => (k < path.length - 1 ? dirOf(t, path[k + 1]) : -1));
  if (path.length === 1) return [0];
  d[d.length - 1] = d[d.length - 2];
  return d;
}

// Turns a stroke into the list of tile edits it would make, plus what it costs.
//   costOf(type) coins per tile. canRoad(gx, gz) says whether a tile may hold a road.
// Same type again is free and skipped; a different type is an upgrade that pays only the difference.
export function planStroke({ path, type, roads, canRoad, costOf }) {
  const dirs = pathDirs(path), seen = new Set(), tiles = [], blocked = [];
  path.forEach(([gx, gz], k) => {
    const idx = tileIndex(gx, gz);
    if (seen.has(idx)) return;
    seen.add(idx);
    if (!canRoad(gx, gz)) { blocked.push([gx, gz]); return; }
    const d = type === 'one' ? dirs[k] : undefined;
    const old = roads[idx] || null;
    if (old && old.t === type && (type !== 'one' || old.d === d)) return;
    const price = old ? Math.max(0, costOf(type) - costOf(old.t)) : costOf(type);
    tiles.push({ gx, gz, idx, t: type, d, price, old });
  });
  return { tiles, blocked, cost: tiles.reduce((a, t) => a + t.price, 0), length: seen.size };
}

export const tileOfKey = (k) => tileOf(Number(k));

// ---- what may hold a road ----
// Roads follow the ground, but a tile that rises or tilts too much still reads as too steep for one.
const slope = new Int8Array(GRID_N * GRID_N); // 0 unknown, 1 flat, 2 steep
function tooSteep(gx, gz) {
  const k = tileIndex(gx, gz);
  if (!slope[k]) {
    const cx = (gx - GRID_HALF) * 3, cz = (gz - GRID_HALF) * 3;
    let hi = -Infinity, lo = Infinity;
    for (const [dx, dz] of [[0, 0], [-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) { const h = Math.max(0, heightAt(cx + dx, cz + dz)); hi = Math.max(hi, h); lo = Math.min(lo, h); }
    slope[k] = hi > 0.9 || hi - lo > 0.5 ? 2 : 1;
  }
  return slope[k] === 2;
}

const blockerCache = new WeakMap();
// Map tileIndex -> { ids: [building ids overlapping the tile], park: bool } for the town's hand-placed blocks.
function blockersOf(layout) {
  let m = blockerCache.get(layout);
  if (m) return m;
  m = new Map();
  const at = (gx, gz) => { const k = tileIndex(gx, gz); let e = m.get(k); if (!e) { e = { ids: [], park: false }; m.set(k, e); } return e; };
  const tile = (x) => Math.floor(x / 3 + 0.5) + GRID_HALF;
  for (const b of layout.buildings) {
    const quarter = Math.abs(Math.sin(b.rotY || 0)) > 0.5;
    const hw = (quarter ? b.d : b.w) / 2, hd = (quarter ? b.w : b.d) / 2;
    for (let gx = tile(b.x - hw); gx <= tile(b.x + hw); gx++) for (let gz = tile(b.z - hd); gz <= tile(b.z + hd); gz++) {
      const cx = (gx - GRID_HALF) * 3, cz = (gz - GRID_HALF) * 3;
      if (Math.min(b.x + hw, cx + 1.5) - Math.max(b.x - hw, cx - 1.5) > 0.5 && Math.min(b.z + hd, cz + 1.5) - Math.max(b.z - hd, cz - 1.5) > 0.5) at(gx, gz).ids.push(b.id);
    }
  }
  for (const p of layout.pads) if (p.park) {
    for (let gx = tile(p.x - 4); gx <= tile(p.x + 4); gx++) for (let gz = tile(p.z - 4); gz <= tile(p.z + 4); gz++) at(gx, gz).park = true;
  }
  blockerCache.set(layout, m);
  return m;
}

// Why a road cannot go on this tile, or null when it can. Roads may cover zone paint (the paint clears) and may
// replace other roads, but not water, hills, farmland, grown lots, parks or buildings that are still standing.
export function roadBlock(grid, layout, state, gx, gz) {
  if (!inBounds(gx, gz)) return 'bounds';
  const b = grid.baseAt(gx, gz);
  if (b === 1) return 'water';
  if (b === 2 || tooSteep(gx, gz)) return 'steep';
  if (b === 3) return 'farm';
  if (grid.lotAt(gx, gz)) return 'lot';
  if (b === 4) {
    const e = blockersOf(layout).get(tileIndex(gx, gz));
    if (e && e.park) return 'park';
    if (e && e.ids.some((id) => !state.removed.includes(id))) return 'building';
  }
  return null;
}

export const BLOCK_TEXT = {
  bounds: 'The map ends here', water: 'Water in the way', steep: 'Too steep for a road', farm: 'Farmland in the way',
  lot: 'A building is in the way', building: 'A building is in the way', park: 'A park is in the way',
};
