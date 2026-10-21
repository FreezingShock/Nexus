// Traffic math on the road network: BPR travel times, gravity trip split, flow fields and assignment.
// Pure data and math. No DOM, no THREE. See docs/TRAFFIC.md.
//
// Nodes are grid tile indices. An edge is `tile * 4 + d`, where d is the step taken from the tile
// (0 east, 1 south, 2 west, 3 north). Edge ids stay the same when the network is rebuilt.
import { GRID_N, inBounds, tileIndex, worldToTile } from '../world/grid.js';
import { DIRS, opposite } from '../world/roadnet.js';

export const TILES = GRID_N * GRID_N;
export const EDGES = TILES * 4;
export const ZONE_SIDE = 8;                 // traffic zones are 8 x 8 tiles
export const ZONE_N = GRID_N / ZONE_SIDE;   // 8 zones per side
export const ZONES = ZONE_N * ZONE_N;       // 64

// Lanes per direction, planning capacity per lane (vehicles per game minute) and free-flow minutes per tile.
export const ROAD_FLOW = {
  two: { lanes: 1, lane: 10, t0: 1 },
  bike: { lanes: 1, lane: 8, t0: 1.2 },
  one: { lanes: 2, lane: 10, t0: 1 },
  bus: { lanes: 1, lane: 15, t0: 0.8 },
  free: { lanes: 2, lane: 25, t0: 0.5 },
};
// Planning values. Trips are one-way. One town day is DAY_MIN game minutes, which is a tuning knob.
export const TRIPS_PER_RESIDENT_DAY = 1.6;
export const DAY_MIN = 24;
export const BETA = 1.5;                    // gravity distance decay
export const SHARE = { work: 0.6, shop: 0.25, service: 0.1, home: 0.05 }; // sums to 1
export const DAMP = 0.5;                    // share of the last assignment kept each cycle (damped iteration)
export const MIN_EFF = 0.6;                 // commute efficiency floor
export const CLASS = { NONE: 0, FREE: 1, BUSY: 2, JAMMED: 3 };

export const zoneOfTile = (gx, gz) => Math.floor(gz / ZONE_SIDE) * ZONE_N + Math.floor(gx / ZONE_SIDE);
export const zoneOfIdx = (idx) => zoneOfTile(idx % GRID_N, Math.floor(idx / GRID_N));

// Travel time on one edge: t0 * (1 + 0.15 (v/c)^4). `cap` must be positive.
export function bpr(t0, v, cap) { return t0 * (1 + 0.15 * Math.pow(v / cap, 4)); }

// Colour class of a road by its load (volume / capacity): free, busy or jammed.
export function congestionClass(vc) { return vc < 0.6 ? CLASS.FREE : vc < 0.9 ? CLASS.BUSY : CLASS.JAMMED; }

// Commute efficiency from the ratio of congested to free-flow commute time: 1.0 at free flow, falling 1 point per
// point of extra time, floored at 0.6.
export function commuteEfficiency(ratio) {
  if (!Number.isFinite(ratio)) return 1;
  const e = 1 - (ratio - 1);
  return e >= 1 ? 1 : e <= MIN_EFF ? MIN_EFF : e;
}

// Step taken from tile u to its grid neighbour v (-1 when v is not a neighbour).
export function stepBetween(u, v) {
  const dt = v - u;
  return dt === 1 ? 0 : dt === GRID_N ? 1 : dt === -1 ? 2 : dt === -GRID_N ? 3 : -1;
}

// The directed road network built from the saved roads. `open[e]` is 1 when a vehicle may leave the tile by edge e.
// Rules match the cars: a one-way tile only lets traffic leave in its direction, and never enters head-on.
export function buildNet(roads) {
  const active = new Uint8Array(TILES), open = new Uint8Array(EDGES);
  const t0 = new Float64Array(EDGES), cap = new Float64Array(EDGES), cost = new Float64Array(EDGES);
  for (const k of Object.keys(roads)) active[Number(k)] = 1;
  for (const k of Object.keys(roads)) {
    const u = Number(k), r = roads[u], f = ROAD_FLOW[r.t] || ROAD_FLOW.two;
    const gx = u % GRID_N, gz = Math.floor(u / GRID_N);
    for (let d = 0; d < 4; d++) {
      const vx = gx + DIRS[d][0], vz = gz + DIRS[d][1];
      if (!inBounds(vx, vz)) continue;
      const q = roads[tileIndex(vx, vz)];
      if (!q) continue;
      if (r.t === 'one' && r.d !== d) continue;
      if (q.t === 'one' && q.d === opposite(d)) continue;
      const e = u * 4 + d;
      open[e] = 1; t0[e] = f.t0; cap[e] = f.lanes * f.lane;
    }
  }
  return { active, open, t0, cap, cost };
}

// Recomputes the congested travel time of every open edge from the current volumes.
export function refreshCosts(net, flow) {
  for (let e = 0; e < EDGES; e++) if (net.open[e]) net.cost[e] = bpr(net.t0[e], flow[e], net.cap[e]);
  return net;
}

// Anchor road tile of each traffic zone: the road tile nearest the zone centre. Zones without a road of their own
// use the nearest road in town. -1 when the town has no road at all.
export function zoneAnchors(active) {
  const anchors = new Int32Array(ZONES).fill(-1), best = new Float64Array(ZONES).fill(Infinity);
  const roads = [];
  const cx = (z) => (z % ZONE_N) * ZONE_SIDE + (ZONE_SIDE - 1) / 2, cz = (z) => Math.floor(z / ZONE_N) * ZONE_SIDE + (ZONE_SIDE - 1) / 2;
  const d2 = (u, z) => { const gx = u % GRID_N, gz = Math.floor(u / GRID_N); return (gx - cx(z)) ** 2 + (gz - cz(z)) ** 2; };
  for (let u = 0; u < TILES; u++) if (active[u]) {
    roads.push(u);
    const z = zoneOfIdx(u), d = d2(u, z);
    if (d < best[z]) { best[z] = d; anchors[z] = u; }
  }
  for (let z = 0; z < ZONES; z++) {
    if (anchors[z] >= 0 || !roads.length) continue;
    let bd = Infinity;
    for (const u of roads) { const d = d2(u, z); if (d < bd) { bd = d; anchors[z] = u; } }
  }
  return anchors;
}

// Trip origins and attractions per traffic zone. Lots come from zoning (residents, shops, workshops, civic halls).
// The shipped town counts too: houses are homes and every shop-front building is a shop and a job.
export function zoneDemand(state, grid, layout) {
  const pop = new Float64Array(ZONES), jobs = new Float64Array(ZONES), shops = new Float64Array(ZONES), services = new Float64Array(ZONES);
  for (const [i, level] of state.lots) {
    const z = zoneOfIdx(i), kind = grid.zone[i];
    if (kind === 1) pop[z] += 4 * level;
    else if (kind === 2) { shops[z] += 3 * level; jobs[z] += 3 * level; }
    else if (kind === 3) jobs[z] += 4 * level;
    else if (kind === 4) services[z] += level;
  }
  const gone = new Set(state.removed);
  for (const b of layout.buildings) {
    if (gone.has(b.id) || !Number.isFinite(b.x) || !Number.isFinite(b.z)) continue;
    const [gx, gz] = worldToTile(b.x, b.z);
    if (!inBounds(gx, gz)) continue;
    const z = zoneOfTile(gx, gz), f = b.floors || 1;
    if (b.awning >= 0) { shops[z] += 1; jobs[z] += 1; pop[z] += f; } else pop[z] += 2 * f;
  }
  return { pop, jobs, shops, services };
}

// Gravity split. origin[i] is trips per minute leaving zone i for this purpose; attract[j] is the weight of zone j.
// costTo[j * ZONES + i] is the travel time from zone i to zone j. Adds into out[i * ZONES + j].
const wScratch = new Float64Array(ZONES);
export function gravity(origin, attract, costTo, out) {
  for (let i = 0; i < ZONES; i++) {
    if (!(origin[i] > 0)) continue;
    let sum = 0;
    for (let j = 0; j < ZONES; j++) {
      const c = j === i || !(attract[j] > 0) ? Infinity : costTo[j * ZONES + i];
      wScratch[j] = Number.isFinite(c) ? attract[j] * Math.pow(c + 1, -BETA) : 0;
      sum += wScratch[j];
    }
    if (!(sum > 0)) continue;
    for (let j = 0; j < ZONES; j++) if (wScratch[j] > 0) out[i * ZONES + j] += origin[i] * wScratch[j] / sum;
  }
  return out;
}

// ---- minimum heap for Dijkstra (keys are travel times, values tile indices) ----
class MinHeap {
  constructor(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; this.top = 0; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  // Removes the smallest entry: returns its value and leaves its key in `top`.
  pop() {
    const k = this.k, v = this.v;
    this.top = k[0];
    const val = v[0], n = --this.n;
    if (n > 0) {
      const key = k[n], vv = v[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= key) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = key; v[i] = vv;
    }
    return val;
  }
}
const heap = new MinHeap(EDGES + 16);
const dist = new Float64Array(TILES);

// A flow field is the shortest-path tree into one destination anchor: next[u] is the tile to drive to from u
// (-1 at the anchor and at tiles that cannot reach it). order lists the reached tiles by travel time, nearest first.
export function newField() { return { next: new Int32Array(TILES), order: new Int32Array(TILES), count: 0 }; }

// One Dijkstra run into `anchor`, on the congested costs in net.cost. Fills `field`. Distances to every tile are
// left in lastDist() until the next run.
export function solveField(net, anchor, field) {
  dist.fill(Infinity); field.next.fill(-1); field.count = 0; heap.n = 0;
  if (!(anchor >= 0) || !net.active[anchor]) return field;
  dist[anchor] = 0; heap.push(0, anchor);
  while (heap.n) {
    const v = heap.pop(), dv = heap.top;
    if (dv > dist[v]) continue;
    field.order[field.count++] = v;
    const vx = v % GRID_N, vz = Math.floor(v / GRID_N);
    for (let d = 0; d < 4; d++) {
      const ux = vx - DIRS[d][0], uz = vz - DIRS[d][1];
      if (ux < 0 || uz < 0 || ux >= GRID_N || uz >= GRID_N) continue;
      const u = uz * GRID_N + ux, e = u * 4 + d;
      if (!net.open[e]) continue;
      const nd = dv + net.cost[e];
      if (nd < dist[u]) { dist[u] = nd; field.next[u] = v; heap.push(nd, u); }
    }
  }
  field.next[anchor] = -1;
  return field;
}
export const lastDist = () => dist;

// Puts trips on the tree's edges. demand[u] is trips per minute entering the tree at tile u; the leaves are summed
// first, so every tile passes its load to its next hop. Clears demand as it goes. out gets the volume per edge.
export function assignField(field, demand, out) {
  for (let k = field.count - 1; k >= 0; k--) {
    const u = field.order[k], v = field.next[u];
    if (v < 0) continue;
    const q = demand[u];
    if (q === 0) continue;
    demand[u] = 0;
    out[u * 4 + stepBetween(u, v)] += q;
    demand[v] += q;
  }
}

// Free-flow and congested travel time from every reached tile to the anchor, along the field's tree.
export function treeTimes(field, net, tFree, tCong) {
  for (let k = 0; k < field.count; k++) {
    const u = field.order[k], v = field.next[u];
    if (v < 0) { tFree[u] = 0; tCong[u] = 0; continue; }
    const e = u * 4 + stepBetween(u, v);
    tFree[u] = tFree[v] + net.t0[e];
    tCong[u] = tCong[v] + net.cost[e];
  }
  return tCong;
}

// Commute efficiency from work trips: congested over free-flow time, weighted by trips.
export function commuteRatio(num, den) { return den > 0 ? num / den : 1; }
