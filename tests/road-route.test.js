// Route planning and the grid rules for drawn roads (src/world/roadnet.js): pivots, L legs, validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { getLayout } from '../src/world/layout.js';
import { tileIndex, GRID_HALF } from '../src/world/grid.js';
import { BLOCK_TEXT, planStroke, routeThrough, starterRoads, validateRoute } from '../src/world/roadnet.js';

const layout = getLayout();
const C = GRID_HALF;
const costOf = () => 20;
const open = () => null;
const reasons = (path, roads = {}, blockedBy = open) => validateRoute(path, roads, blockedBy).map((p) => p.reason);
const line = (a, b) => routeThrough([a, b]).path;
// a street along a row or column, as road tiles
const row = (z, x0, x1) => { const r = {}; for (let x = x0; x <= x1; x++) r[tileIndex(x, z)] = { t: 'two', p: 0 }; return r; };
const col = (x, z0, z1) => { const r = {}; for (let z = z0; z <= z1; z++) r[tileIndex(x, z)] = { t: 'two', p: 0 }; return r; };
const merge = (...rs) => Object.assign({}, ...rs);

test('an L: one automatic corner, longer leg first, flip swaps the legs', () => {
  const r = routeThrough([[2, 2], [5, 4]]);
  assert.deepEqual(r.path.map((t) => t.join()), ['2,2', '3,2', '4,2', '5,2', '5,3', '5,4']);
  assert.deepEqual(r.stops, [0, 5]);
  const flipped = routeThrough([[2, 2], [5, 4]], { flip: true });
  assert.deepEqual(flipped.path.map((t) => t.join()), ['2,2', '2,3', '2,4', '3,4', '4,4', '5,4']);
});

test('a pivot joins two L legs and building continues from it', () => {
  const r = routeThrough([[0, 0], [3, 0], [3, 4]]);
  assert.equal(r.path[r.stops[1]].join(), '3,0');
  assert.equal(r.path[r.path.length - 1].join(), '3,4');
  assert.equal(r.path.length, 1 + 3 + 4, 'the start, three steps, then four more');
  assert.equal(new Set(r.path.map((t) => t.join())).size, r.path.length, 'no tile is repeated');
});

test('Shift makes each leg a straight ruler line', () => {
  const r = routeThrough([[2, 2], [6, 3]], { straight: true });
  assert.deepEqual(r.path.map((t) => t.join()), ['2,2', '3,2', '4,2', '5,2', '6,2']);
});

test('a clean L on open ground has no problems and costs per tile', () => {
  const path = routeThrough([[4, 4], [8, 6]]).path;
  assert.deepEqual(reasons(path), []);
  const plan = planStroke({ path, type: 'two', roads: {}, blockedBy: open, costOf });
  assert.equal(plan.tiles.length, path.length);
  assert.equal(plan.cost, 20 * path.length);
  assert.deepEqual(plan.joins, []);
});

test('a route may not cross itself, nor close a loop around a tile', () => {
  assert.ok(reasons([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]).includes('revisit'));
  const ring = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]];
  assert.ok(reasons(ring).includes('loop'), 'a ring of eight touches its own start');
});

test('a 2 by 2 block of road is refused as a tiny loop', () => {
  assert.ok(reasons([[0, 0], [1, 0], [1, 1], [0, 1]]).includes('loop'));
  const roads = merge(row(10, 0, 1), col(1, 10, 11));
  assert.ok(reasons([[1, 11], [0, 11]], roads).includes('loop'), 'closing the corner of two streets');
});

test('a new tile may not hug a street it does not join', () => {
  const roads = row(11, 0, 10);
  assert.ok(reasons(line([0, 12], [3, 12]), roads).includes('hug'));
  assert.deepEqual(reasons(line([0, 14], [3, 14]), roads), [], 'three tiles off the street leaves room for a lot');
});

test('a route that joins a street at its end, or crosses it, is not hugging', () => {
  const roads = row(11, 0, 10);
  assert.deepEqual(reasons([[3, 15], [3, 14], [3, 13], [3, 12], [3, 11]], roads), [], 'a T into the street');
  assert.deepEqual(reasons([[3, 9], [3, 10], [3, 11], [3, 12], [3, 13]], roads), [], 'a crossing');
});

test('straight runs may not sit one tile from a parallel street', () => {
  const roads = row(10, 0, 10);
  assert.ok(reasons(line([0, 12], [4, 12]), roads).includes('gap'));
  assert.deepEqual(reasons(line([0, 13], [4, 13]), roads), [], 'three tiles from the street leaves two tiles of lot');
});

test('no zig-zags: two turns with one tile between them are refused', () => {
  assert.ok(reasons([[0, 0], [1, 0], [1, 1], [2, 1]]).includes('zigzag'));
  assert.deepEqual(reasons([[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]]), [], 'two tiles between turns is fine');
});

test('blocked tiles report their reason; over-long routes are refused', () => {
  const water = (gx) => (gx === 2 ? 'water' : null);
  assert.deepEqual(reasons(line([0, 0], [4, 0]), {}, water), ['water']);
  const long = Array.from({ length: 241 }, (_, i) => [i % 64, Math.floor(i / 64)]);
  assert.ok(reasons(long).includes('long'));
});

test('a route that starts on a street and runs out of the town joins it cleanly', () => {
  const roads = starterRoads();
  const path = [[C + 16, C], [C + 17, C], [C + 18, C], [C + 19, C]];
  const plan = planStroke({ path, type: 'two', roads, blockedBy: open, costOf });
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.joins, [[C + 16, C]], 'the joined street shows as a junction');
  assert.equal(plan.tiles.length, 3, 'only the three new tiles are paid for');
});

test('pivots off a street join it: the junction is a join, not a hug', () => {
  const roads = row(11, 0, 10);
  const path = routeThrough([[3, 15], [3, 11]]).path;
  const plan = planStroke({ path, type: 'two', roads, blockedBy: open, costOf });
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.joins, [[3, 11]]);
});

test('drawRoad refuses a looping route and charges nothing', () => {
  const sim = createSim({ layout });
  sim.state.coins = 5000;
  const free = [C - 6, C - 14];
  const ring = [[free[0], free[1]], [free[0] + 1, free[1]], [free[0] + 2, free[1]], [free[0] + 2, free[1] + 1], [free[0] + 2, free[1] + 2], [free[0] + 1, free[1] + 2], [free[0], free[1] + 2], [free[0], free[1] + 1]];
  sim.dispatch({ type: 'drawRoad', roadType: 'two', path: ring });
  assert.equal(sim.state.coins, 5000);
  assert.equal(sim.state.roads[tileIndex(free[0], free[1])], undefined);
});

test('every grid rule has a sheet-friendly message', () => {
  for (const r of ['revisit', 'loop', 'hug', 'gap', 'zigzag', 'long']) assert.ok(BLOCK_TEXT[r], r);
});
