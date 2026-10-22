// Road network helpers on the shared tile grid (see docs/GRID.md). Pure data and math: no DOM, no THREE.
//
// Saved shape: state.roads = { [tileIndex]: { t, d?, p } }
//   t  road type id ('two', 'bike', 'one', 'bus', 'free')
//   d  direction of travel for one-way roads: 0 east (+x), 1 south (+z), 2 west, 3 north
//   p  coins paid for the tile (the starter streets paid nothing), used for refunds
// Tiles connect to every 4-neighbor that is also a road, so shapes (curves, tees, crossings) are derived, never stored.
import { GRID_N, GRID_HALF, inBounds, tileIndex, tileOf } from './grid.js';
import { heightAt, terrainRev, terrainSeed } from './terrain.js';
import { starterStreetTiles } from './starter.js';

// Direction index -> grid step. 0 east (+x), 1 south (+z), 2 west (-x), 3 north (-z).
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const opposite = (d) => (d + 2) & 3;
export const dirOf = (a, b) => DIRS.findIndex(([dx, dz]) => a[0] + dx === b[0] && a[1] + dz === b[1]);

// Numeric kind written to grid.road for each type (0 is "no road").
export const ROAD_KIND = { two: 1, bike: 2, one: 3, bus: 4, free: 5 };
export const ROAD_IDS = Object.keys(ROAD_KIND);
export const MAX_STROKE = 240;

// The streets the village ships with, as editable tiles (see world/starter.js). They paid nothing, so they refund nothing.
export function starterRoads() {
  const roads = {};
  for (const [gx, gz] of starterStreetTiles()) roads[tileIndex(gx, gz)] = { t: 'two', p: 0 };
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

// ---- routes ----
// A road is laid as a chain of pivots: the last committed tile, any pivots added while drawing, and the cursor.
// Between two pivots the route is one L (a leg, a corner, a leg), or a ruler line when `straight`.
// validateRoute then checks the grid rules, so a route can never loop, hug a street or zig-zag.

// The corner sits on the longer leg's far side, so an L reads as a street; `flip` swaps which leg comes first.
export function elbowPath(a, b, flip = false) {
  const horizFirst = (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1])) !== flip;
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

// Straight line from a along the longer axis towards b (the shift ruler).
export function rulerPath(a, b) {
  const horiz = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  const n = Math.min(MAX_STROKE - 1, horiz ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1]));
  const s = horiz ? Math.sign(b[0] - a[0]) : Math.sign(b[1] - a[1]);
  const out = [];
  for (let k = 0; k <= n; k++) out.push(horiz ? [a[0] + s * k, a[1]] : [a[0], a[1] + s * k]);
  return out;
}

// One leg between two pivots: an L, or a ruler line when `straight`.
export const legPath = (a, b, { straight = false, flip = false } = {}) => (straight ? rulerPath(a, b) : elbowPath(a, b, flip));

// The whole chain through the pivots, as one ordered list of tiles. `stops[k]` is the index in `path` of points[k].
export function routeThrough(points, opts = {}) {
  const path = [[points[0][0], points[0][1]]], stops = [0];
  for (let k = 1; k < points.length; k++) {
    const leg = legPath(points[k - 1], points[k], opts);
    for (let j = 1; j < leg.length && path.length < MAX_STROKE; j++) path.push(leg[j]);
    stops.push(path.length - 1);
  }
  return { path, stops };
}

// ---- auto-pick ----
// Each leg has two L shapes: the longer leg first (the default) or the shorter first. chooseRoute scores every
// combination of picks and keeps the cleanest route: fewest grid problems, then the least riding along existing
// roads (a leg that runs along a street scores worse than a T into it), then the fewest new tiles. `flip` (the L key)
// inverts every pick, so the key becomes an override. Shift makes every leg a single straight shape.
const PICK_PROBLEM = 1000, PICK_OVERLAP = 4, PICK_ALONG = 6, PICK_LEGS = 6;
export function chooseRoute({ points, straight = false, flip = false, roads = {}, blockedBy = () => null }) {
  const shapes = [];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1], b = points[k];
    if (straight) { shapes.push([rulerPath(a, b)]); continue; }
    const first = elbowPath(a, b, false), other = elbowPath(a, b, true);
    const same = first.length === other.length && first.every((t, i) => t[0] === other[i][0] && t[1] === other[i][1]);
    shapes.push(same ? [first] : [first, other]);
  }
  if (!shapes.length) return { path: [[points[0][0], points[0][1]]], stops: [0] };

  const build = (pick) => {
    const path = [shapes[0][pick[0]][0]], stops = [0];
    shapes.forEach((opts, k) => {
      const leg = opts[pick[k]];
      for (let j = 1; j < leg.length && path.length < MAX_STROKE; j++) path.push(leg[j]);
      stops.push(path.length - 1);
    });
    return { path: path.map((t) => [t[0], t[1]]), stops };
  };
  const cost = (route, pick) => {
    let c = validateRoute(route.path, roads, blockedBy).length * PICK_PROBLEM;
    for (let k = 1; k < route.path.length; k++) {
      const [x, z] = route.path[k], [px, pz] = route.path[k - 1];
      if (hasRoad(roads, x, z)) { c += PICK_OVERLAP; if (hasRoad(roads, px, pz)) c += PICK_ALONG; } else c += 1;
    }
    return c + 0.01 * pick.reduce((a, p) => a + p, 0); // ties keep the default shape
  };

  // Enumerate picks for the first few legs; any later leg keeps its default shape.
  const free = Math.min(shapes.length, PICK_LEGS);
  const radix = shapes.slice(0, free).map((o) => o.length);
  const total = radix.reduce((a, r) => a * r, 1);
  let best = null, bestCost = Infinity, bestPick = null;
  for (let c = 0; c < total; c++) {
    const pick = new Array(shapes.length).fill(0);
    let rest = c;
    for (let k = 0; k < free; k++) { pick[k] = rest % radix[k]; rest = Math.floor(rest / radix[k]); }
    const route = build(pick), v = cost(route, pick);
    if (v < bestCost) { bestCost = v; best = route; bestPick = pick; }
  }
  if (!flip) return best;
  return build(bestPick.map((p, k) => (shapes[k].length > 1 ? 1 - p : p)));
}

// Direction of travel on each route tile: towards the next tile, the last tile keeps the heading it arrived with.
export function pathDirs(path) {
  const d = path.map((t, k) => (k < path.length - 1 ? dirOf(t, path[k + 1]) : -1));
  if (path.length === 1) return [0];
  d[d.length - 1] = d[d.length - 2];
  return d;
}

// Tiles of the route that count as "new": the grid rules below apply only to these, and existing roads are
// joins or crossings, which are always allowed.
// The grid rules. Every problem is { reason, at, k } in path order; reason is a key of BLOCK_TEXT. `blockedBy(gx, gz)`
// returns why a tile cannot hold a road (from roadBlock), or null.
//   revisit  the route crosses itself
//   loop     a tile touches the route somewhere other than its neighbors, or closes a 2 by 2 block of road
//   hug      a new tile touches an existing street that the route does not join at that tile
//   zigzag   two turns in a row with a single tile between them
//   long     longer than one road may be
export function validateRoute(path, roads, blockedBy = () => null) {
  const n = path.length, problems = [], flag = (reason, k) => problems.push({ reason, at: path[k], k });
  if (n > MAX_STROKE) flag('long', MAX_STROKE - 1);
  const at = new Map(); // tile index -> position in the route
  path.forEach(([gx, gz], k) => {
    const idx = tileIndex(gx, gz);
    if (at.has(idx)) flag('revisit', k); else at.set(idx, k);
    const why = blockedBy(gx, gz);
    if (why && at.get(idx) === k) flag(why, k);
  });
  const mine = (gx, gz) => at.has(tileIndex(gx, gz));
  const roadish = (gx, gz) => hasRoad(roads, gx, gz) || mine(gx, gz);
  const onStreet = (gx, gz, k) => {
    const prev = path[k - 1], next = path[k + 1];
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
      const nx = gx + dx, nz = gz + dz;
      if (!hasRoad(roads, nx, nz)) return false;
      const linked = (prev && prev[0] === nx && prev[1] === nz) || (next && next[0] === nx && next[1] === nz);
      return !linked;
    });
  };

  path.forEach(([gx, gz], k) => {
    if (at.get(tileIndex(gx, gz)) !== k) return; // a revisit is already reported
    const fresh = !hasRoad(roads, gx, gz);
    for (const [dx, dz] of DIRS) {
      const j = inBounds(gx + dx, gz + dz) ? at.get(tileIndex(gx + dx, gz + dz)) : undefined;
      if (j !== undefined && Math.abs(j - k) > 1) { flag('loop', k); break; }
    }
    if (!fresh) return;
    const prev = path[k - 1], next = path[k + 1];
    const end = k === 0 || k === n - 1;
    // Touching the network is expected only at the ends, where the road joins it.
    if (!end && onStreet(gx, gz, k)) flag('hug', k);
    for (const [ox, oz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const sq = [[gx + ox, gz + oz], [gx + ox + 1, gz + oz], [gx + ox, gz + oz + 1], [gx + ox + 1, gz + oz + 1]];
      if (sq.every(([x, z]) => inBounds(x, z) && roadish(x, z))) { flag('loop', k); break; }
    }
  });

  let lastTurn = -Infinity;
  for (let k = 1; k < n - 1; k++) {
    if (dirOf(path[k - 1], path[k]) === dirOf(path[k], path[k + 1])) continue;
    if (k - lastTurn === 1) flag('zigzag', k);
    lastTurn = k;
  }
  return problems.sort((a, b) => a.k - b.k);
}

// Turns a route into the list of tile edits it would make, plus what it costs.
//   costOf(type) coins per tile. blockedBy(gx, gz) is roadBlock's reason for a tile, or null.
// Same type again is free and skipped; a different type is an upgrade that pays only the difference.
// `joins` lists the route's tiles that already hold a road (where it meets the network). `problems` is validateRoute.
export function planStroke({ path, type, roads, blockedBy = () => null, costOf }) {
  const dirs = pathDirs(path), seen = new Set(), tiles = [], joins = [];
  path.forEach(([gx, gz], k) => {
    const idx = tileIndex(gx, gz);
    if (seen.has(idx)) return;
    seen.add(idx);
    const old = roads[idx] || null;
    if (old) joins.push([gx, gz]);
    if (old && old.t === type && (type !== 'one' || old.d === dirs[k])) return;
    const d = type === 'one' ? dirs[k] : undefined;
    const price = old ? Math.max(0, costOf(type) - costOf(old.t)) : costOf(type);
    tiles.push({ gx, gz, idx, t: type, d, price, old });
  });
  const problems = validateRoute(path, roads, blockedBy);
  return { tiles, joins, problems, cost: tiles.reduce((a, t) => a + t.price, 0), length: seen.size };
}

export const tileOfKey = (k) => tileOf(Number(k));

// ---- what may hold a road ----
// Roads follow the ground, but a tile that rises or tilts too much still reads as too steep for one.
let slope = new Int8Array(GRID_N * GRID_N), slopeRev = -1; // 0 unknown, 1 flat, 2 steep; dropped when the land changes
function tooSteep(gx, gz) {
  if (slopeRev !== terrainRev()) { slope = new Int8Array(GRID_N * GRID_N); slopeRev = terrainRev(); }
  const k = tileIndex(gx, gz);
  if (!slope[k]) {
    const cx = (gx - GRID_HALF) * 3, cz = (gz - GRID_HALF) * 3;
    let hi = -Infinity, lo = Infinity;
    for (const [dx, dz] of [[0, 0], [-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) { const h = Math.max(0, heightAt(cx + dx, cz + dz)); hi = Math.max(hi, h); lo = Math.min(lo, h); }
    // The same slope rule as zones and farms. Old land also refused any road higher than 0.9; seeded land has plateaus.
    slope[k] = (terrainSeed() === 0 && hi > 0.9) || hi - lo > 0.5 ? 2 : 1;
  }
  return slope[k] === 2;
}

// Why a road cannot go on this tile, or null when it can. Roads may cover zone paint (the paint clears) and may
// replace other roads, but not water, hills, farmland, or a lot that is built (a starter or player building, or grown).
// `layout` and `state` are kept for the callers; buildings are on the grid's lot layer, so only the grid is read here.
export function roadBlock(grid, layout, state, gx, gz) {
  if (!inBounds(gx, gz)) return 'bounds';
  const b = grid.baseAt(gx, gz);
  if (b === 1) return 'water';
  if (b === 2 || tooSteep(gx, gz)) return 'steep';
  if (b === 3) return 'farm';
  if (grid.lotAt(gx, gz)) return 'lot';
  return null;
}

// Why a route or tile is refused, in words for the reason chip and the toast. Keys are the reasons from roadBlock and validateRoute.
export const BLOCK_TEXT = {
  bounds: 'The map ends here', water: 'Water in the way', steep: 'Too steep for a road', farm: 'Farmland in the way',
  lot: 'A building is in the way', building: 'A building is in the way', park: 'A park is in the way',
  revisit: 'The road would cross itself', loop: 'That would close a tiny loop', hug: 'Too close to another street',
  zigzag: 'No zig-zags: give each turn a tile to breathe', long: 'Too long for one road',
};
