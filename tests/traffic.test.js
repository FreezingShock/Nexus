import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { getLayout } from '../src/world/layout.js';
import { GRID_N, GRID_HALF, tileIndex } from '../src/world/grid.js';
import {
  TILES, EDGES, ZONES, bpr, buildNet, commuteEfficiency, congestionClass, gravity, refreshCosts, solveField,
  newField, assignField, treeTimes, stepBetween, zoneAnchors, zoneOfTile, zoneDemand, CLASS, lastDist,
} from '../src/sim/traffic.js';
import { busTours, buildCars } from '../src/render/cars.js';
import { buildTownsfolk } from '../src/render/townsfolk.js';

const key = (gx, gz) => tileIndex(gx, gz);
// a straight two-way street along row z, from x0 to x1 (inclusive)
const street = (z, x0, x1, t = 'two', extra = {}) => {
  const out = {};
  for (let x = x0; x <= x1; x++) out[key(x, z)] = { t, ...extra };
  return out;
};
const cost0 = (net) => refreshCosts(net, new Float64Array(EDGES));
const E = (gx, gz, d) => key(gx, gz) * 4 + d; // edge id: leave tile (gx, gz) in direction d

test('BPR travel time: free flow at zero volume, 15% more at capacity, steep beyond', () => {
  assert.equal(bpr(1, 0, 10), 1);
  assert.ok(Math.abs(bpr(1, 10, 10) - 1.15) < 1e-12);
  assert.ok(Math.abs(bpr(2, 20, 10) - 2 * (1 + 0.15 * 16)) < 1e-12);
});

test('congestion classes: free below 0.6, busy below 0.9, jammed from there', () => {
  assert.equal(congestionClass(0), CLASS.FREE);
  assert.equal(congestionClass(0.59), CLASS.FREE);
  assert.equal(congestionClass(0.6), CLASS.BUSY);
  assert.equal(congestionClass(0.89), CLASS.BUSY);
  assert.equal(congestionClass(0.9), CLASS.JAMMED);
  assert.equal(congestionClass(3), CLASS.JAMMED);
});

test('commute efficiency runs from 1.0 at free flow down to 0.6, one point per point of extra time', () => {
  assert.equal(commuteEfficiency(1), 1);
  assert.ok(Math.abs(commuteEfficiency(1.2) - 0.8) < 1e-12);
  assert.ok(Math.abs(commuteEfficiency(1.4) - 0.6) < 1e-12);
  assert.equal(commuteEfficiency(5), 0.6);
  assert.equal(commuteEfficiency(NaN), 1);
});

test('steps between neighbouring tiles, -1 otherwise', () => {
  const c = key(10, 10);
  assert.equal(stepBetween(c, key(11, 10)), 0);
  assert.equal(stepBetween(c, key(10, 11)), 1);
  assert.equal(stepBetween(c, key(9, 10)), 2);
  assert.equal(stepBetween(c, key(10, 9)), 3);
  assert.equal(stepBetween(c, key(12, 10)), -1);
});

test('network: two-way streets open both ways; a one-way tile only lets traffic leave in its direction', () => {
  const roads = street(10, 9, 12);
  roads[key(11, 10)] = { t: 'one', d: 0 }; // east only
  const net = buildNet(roads);
  assert.equal(net.open[E(10, 10, 0)], 1);            // 10 -> 11 east, allowed
  assert.equal(net.open[E(11, 10, 2)], 0);            // 11 -> 10 west, against the arrow
  assert.equal(net.open[E(12, 10, 2)], 0);            // into the one-way tile head-on: 12 -> 11 west is refused
  assert.equal(net.open[E(12, 10, 2)], 0);
  assert.equal(net.open[E(11, 10, 0)], 1);            // leaving the one-way tile in its direction
  assert.equal(net.open[E(10, 10, 2)], 1);            // a two-way tile is open both ways
  assert.equal(net.active[key(11, 10)], 1);
  assert.equal(net.active[key(20, 20)], 0);
});

test('flow field on a street: next hops lead to the anchor and the root has none', () => {
  const roads = street(10, 10, 14);
  const net = cost0(buildNet(roads));
  const f = solveField(net, key(14, 10), newField());
  assert.equal(f.next[key(14, 10)], -1);
  assert.equal(f.next[key(10, 10)], key(11, 10));
  assert.equal(f.next[key(12, 10)], key(13, 10));
  assert.equal(f.count, 5);
  // free-flow travel time from the far end is four tiles at one minute each
  assert.ok(Math.abs(lastDist()[key(10, 10)] - 4) < 1e-9);
});

test('unreachable tiles have no next hop', () => {
  const roads = { ...street(10, 10, 12), ...street(20, 20, 22) };
  const net = cost0(buildNet(roads));
  const f = solveField(net, key(12, 10), newField());
  assert.equal(f.next[key(20, 20)], -1);
  assert.equal(f.count, 3);
});

test('flow fields follow congestion: a jammed direct route sends traffic round the detour', () => {
  // A (10,10) to B (14,10): direct street of 4 edges, or a detour row 12 with links at x=10 and x=14 (8 edges)
  const roads = { ...street(10, 10, 14), ...street(12, 10, 14), [key(10, 11)]: { t: 'two' }, [key(14, 11)]: { t: 'two' } };
  const net = cost0(buildNet(roads));
  const free = solveField(net, key(14, 10), newField());
  assert.equal(free.next[key(10, 10)], key(11, 10)); // free flow: straight along the direct street
  const flow = new Float64Array(EDGES);
  for (let x = 10; x < 14; x++) flow[E(x, 10, 0)] = 40; // four tiles at four times capacity
  refreshCosts(net, flow);
  const jammed = solveField(net, key(14, 10), newField());
  assert.equal(jammed.next[key(10, 10)], key(10, 11)); // turns off onto the detour
});

test('a tree carries trips to the root: volumes sum to demand times path length', () => {
  const roads = street(10, 10, 14);
  const net = cost0(buildNet(roads));
  const f = solveField(net, key(14, 10), newField());
  const demand = new Float64Array(TILES), out = new Float64Array(EDGES);
  demand[key(10, 10)] = 6;
  assignField(f, demand, out);
  let total = 0;
  for (let e = 0; e < EDGES; e++) total += out[e];
  assert.ok(Math.abs(total - 6 * 4) < 1e-9);          // four edges, six trips each
  assert.equal(out[E(10, 10, 0)], 6);
  assert.equal(out[E(13, 10, 0)], 6);
  assert.equal(out[E(14, 10, 0)], 0);                 // the root drives nowhere
  assert.equal(demand[key(10, 10)], 0);               // demand is cleared as it moves
});

test('tree times add up free-flow minutes and congested minutes along the path', () => {
  const net = cost0(buildNet(street(10, 10, 13)));
  const f = solveField(net, key(13, 10), newField());
  const tFree = new Float64Array(TILES), tCong = new Float64Array(TILES);
  treeTimes(f, net, tFree, tCong);
  assert.ok(Math.abs(tFree[key(10, 10)] - 3) < 1e-9);
  assert.ok(Math.abs(tCong[key(10, 10)] - 3) < 1e-9);
});

test('gravity: each origin splits all of its trips over the destinations it can reach, nearer ones weigh more', () => {
  const origin = new Float64Array(ZONES), attract = new Float64Array(ZONES);
  const costTo = new Float64Array(ZONES * ZONES).fill(Infinity);
  origin[0] = 30;
  attract[1] = 10; attract[2] = 10;
  costTo[1 * ZONES + 0] = 2; costTo[2 * ZONES + 0] = 8; // zone 1 is closer than zone 2
  const out = gravity(origin, attract, costTo, new Float64Array(ZONES * ZONES));
  const a = out[0 * ZONES + 1], b = out[0 * ZONES + 2];
  assert.ok(Math.abs(a + b - 30) < 1e-9);
  assert.ok(a > b);
  assert.equal(out[0 * ZONES + 0], 0);                // no trips to itself
});

test('gravity: unreachable destinations take no trips, and an origin that reaches nothing sends nothing', () => {
  const origin = new Float64Array(ZONES), attract = new Float64Array(ZONES);
  const costTo = new Float64Array(ZONES * ZONES).fill(Infinity);
  origin[0] = 5; attract[1] = 1;
  const out = gravity(origin, attract, costTo, new Float64Array(ZONES * ZONES));
  for (let k = 0; k < ZONES * ZONES; k++) assert.equal(out[k], 0);
});

test('anchors: the road nearest the zone centre, and a road from elsewhere for zones with none', () => {
  const roads = street(10, 0, 63); // one long street through row 10, which lies in zone row 1
  const anchors = zoneAnchors(buildNet(roads).active);
  const z = zoneOfTile(3, 10);
  const gx = anchors[z] % GRID_N, gz = Math.floor(anchors[z] / GRID_N);
  assert.equal(gz, 10);
  assert.ok(gx >= 0 && gx < GRID_N);
  assert.ok(anchors[zoneOfTile(3, 50)] >= 0, 'an empty zone still gets the nearest road');
  assert.equal(zoneAnchors(new Uint8Array(TILES)).every((a) => a === -1), true);
});

test('zone demand: residential lots are origins, commercial and industrial lots are jobs, shop fronts are shops', () => {
  const state = { lots: [[key(2, 2), 2, 0], [key(3, 2), 1, 0], [key(40, 40), 3, 0]], removed: [] };
  const grid = { zone: new Uint8Array(TILES) };
  grid.zone[key(2, 2)] = 1; grid.zone[key(3, 2)] = 2; grid.zone[key(40, 40)] = 3;
  const d = zoneDemand(state, grid, { buildings: [] });
  const z0 = zoneOfTile(2, 2), z1 = zoneOfTile(40, 40);
  assert.equal(d.pop[z0], 8);       // residential level 2 is 4 per level
  assert.equal(d.jobs[z0], 3);      // the commercial lot at level 1 is 3 jobs
  assert.equal(d.shops[z0], 3);
  assert.equal(d.jobs[z1], 12);     // industrial level 3 is 4 per level
});

test('the sim warms up on the starter town: flows, colours and a commute efficiency in range', () => {
  const sim = createSim({ state: freshState(), layout: getLayout() });
  const m = sim.traffic;
  assert.ok(m.vehicles > 0);
  assert.ok(m.eff >= 0.6 && m.eff <= 1);
  assert.ok(m.penalty <= 0);
  assert.ok(m.dests.length > 0);
  assert.equal(sim.grid.load.length, TILES);
  let road = 0;
  for (let u = 0; u < TILES; u++) {
    const c = sim.grid.load[u];
    assert.ok(c >= 0 && c <= 3);
    if (c) road++;
  }
  assert.ok(road > 0);
});

test('a new road is taken in by the next cycle, which finishes within a bounded number of ticks', () => {
  const sim = createSim({ state: freshState(), layout: getLayout() });
  const m = sim.traffic;
  const tile = key(GRID_HALF + 20, GRID_HALF - 20);
  sim.state.roads = { ...sim.state.roads, [tile]: { t: 'two', p: 0 } };
  let ticks = 0;
  do { sim.tick(); ticks++; } while (m.phase !== 'idle' && ticks < 200);
  assert.ok(ticks < 60, 'one cycle is well under a minute of game time');
  assert.equal(m.net.active[tile], 1, 'the network was rebuilt from the new roads');
});

test('congestion colours are recommitted after every cycle', () => {
  const sim = createSim({ state: freshState(), layout: getLayout() });
  const rev = sim.grid.loadRev;
  for (let t = 0; t < 120; t++) sim.tick();
  assert.ok(sim.grid.loadRev > rev);
  assert.ok(sim.grid.load instanceof Uint8Array);
});

test('bus loops: a bus run of tiles becomes one closed tour that visits every tile; a single tile has none', () => {
  const roads = { ...street(10, 10, 13, 'bus'), [key(13, 11)]: { t: 'bus' }, [key(13, 12)]: { t: 'bus' } };
  const tours = busTours(roads);
  assert.equal(tours.length, 1);
  const tour = tours[0];
  assert.equal(new Set(tour).size, Object.keys(roads).length);
  for (let k = 0; k < tour.length; k++) {
    const a = tour[k], b = tour[(k + 1) % tour.length];
    assert.ok(stepBetween(a, b) >= 0, 'each stop is a neighbour of the next, including the wrap-round');
  }
  assert.deepEqual(busTours({ [key(5, 5)]: { t: 'bus' } }), []);
});

test('visual smoke: cars, buses and townsfolk run on the warmed sim without errors and stay within budget', () => {
  const sim = createSim({ state: freshState(), layout: getLayout() });
  const world = new THREE.Group();
  const camera = { view: { tx: 0, tz: 0, half: 46, zoom: 1 } };
  const cars = buildCars(world, sim.grid, camera);
  const folk = buildTownsfolk(world, sim.grid, camera);
  for (let f = 0; f < 60; f++) {
    sim.tick();
    cars.update(1 / 30, sim.state.roads);
    folk.update(1 / 30, sim.state.roads);
  }
  assert.ok(cars.carCount() <= 300, 'cars stay within the target');
  assert.ok(cars.busCount() <= 16);
  assert.ok(folk.count() <= 300);
  assert.ok(folk.count() > 0);
  // draw calls: cars (bodies, cabins, lines), buses (3), townsfolk (2). Instancing keeps them flat.
  const meshes = world.children.length;
  assert.ok(meshes <= 8, 'a few instanced meshes, not one per vehicle');
});

test('the commute penalty and efficiency are saved: a reload restores them, and bad saved values are clamped', async () => {
  const { sanitize } = await import('../src/sim/save.js');
  const clean = sanitize({ commutePenalty: 5, commuteEff: 0.2 });
  assert.equal(clean.commutePenalty, 0);            // a penalty never adds income
  assert.equal(clean.commuteEff, 0.6);              // the efficiency floor
  assert.equal(sanitize({ commutePenalty: 'x' }).commuteEff, 1);
  const sim = createSim({ state: freshState(), layout: getLayout() });
  sim.state.commutePenalty = -3.5; sim.state.commuteEff = 0.8;
  const back = createSim({ state: JSON.parse(JSON.stringify(sim.state)), layout: getLayout() });
  assert.equal(back.traffic.penalty, -3.5);
  assert.equal(back.traffic.eff, 0.8);
  assert.equal(back.state.commutePenalty, -3.5);
});
