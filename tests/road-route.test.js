// Route planning and the grid rules for drawn roads (src/world/roadnet.js): pivots, L legs, validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSim } from '../src/sim/sim.js';
import { getLayout } from '../src/world/layout.js';
import { tileIndex, GRID_HALF } from '../src/world/grid.js';
import { BLOCK_TEXT, chooseRoute, elbowPath, planStroke, routeThrough, starterRoads, validateRoute } from '../src/world/roadnet.js';

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

test('a street one free tile (one lot) from a parallel street is allowed', () => {
  const roads = row(10, 0, 10);
  assert.deepEqual(reasons(line([0, 12], [4, 12]), roads), [], 'one tile between the streets is enough room for a lot');
  assert.deepEqual(reasons(line([0, 13], [4, 13]), roads), []);
});

test('streets touching side by side are still refused', () => {
  const roads = row(10, 0, 10);
  assert.ok(reasons(line([0, 11], [4, 11]), roads).includes('hug'));
});

test('passing the dead end of a side street makes a T, not a "too close" (nate, 2026-10-25)', () => {
  // A street ending at x = 3 on row 12, and a stub coming down at x = 8 that stops on row 11, one tile above the route.
  const roads = merge(row(12, 0, 3), col(8, 6, 11));
  assert.deepEqual(reasons(line([3, 12], [10, 12]), roads), [], 'carrying on from the end, past the stub');
  assert.deepEqual(reasons(line([4, 12], [10, 12]), roads), [], 'starting beside the end');
  assert.deepEqual(reasons(line([0, 13], [6, 13]).concat([]), row(12, 3, 3)), [], 'a route may touch one tile of a street mid-way');
});

test('a short spur beside a street is refused only where it runs alongside', () => {
  const roads = row(10, 0, 10);
  assert.ok(reasons([[4, 11], [5, 11]], roads).includes('hug'), 'two tiles side by side with the street');
  assert.deepEqual(reasons([[4, 11], [4, 12], [4, 13]], roads), [], 'one tile touching it is a T');
});

test('the auto-bend planner accepts a route one tile from a parallel street', () => {
  const roads = row(10, 0, 10);
  const r = chooseRoute({ points: [[0, 12], [6, 14]], roads, blockedBy: open });
  assert.deepEqual(validateRoute(r.path, roads, open), []);
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
  const path = [[C + 12, C], [C + 12, C - 1], [C + 12, C - 2], [C + 12, C - 3]]; // north from the stem, past the houses
  const plan = planStroke({ path, type: 'two', roads, blockedBy: open, costOf });
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.joins, [[C + 12, C]], 'the joined street shows as a junction');
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

// The two layouts from nate's screenshots: the L's default first leg runs along an existing street.
const onRoads = (path, roads) => path.filter(([x, z]) => roads[tileIndex(x, z)] !== undefined).length;

test('auto-pick: a start below a street ends at a T into it, not along it (screenshot 1 layout)', () => {
  const roads = row(C + 6, C - 10, C + 6);
  const start = [C - 8, C + 9], end = [C - 6, C + 6];
  assert.equal(elbowPath(start, end)[1].join(), [C - 8, C + 8].join(), 'the default leg runs up and along the street');
  const r = chooseRoute({ points: [start, end], roads, blockedBy: open });
  assert.deepEqual(r.path[1], [C - 7, C + 9], 'the auto-pick runs the long way, along the empty row below');
  assert.deepEqual(r.path[r.path.length - 1], end);
  assert.deepEqual(r.path[r.path.length - 2], [C - 6, C + 7], 'the last step comes in from the south, across the street');
  assert.equal(onRoads(r.path, roads), 1, 'only the junction tile is already a road');
  assert.deepEqual(validateRoute(r.path, roads, open), []);
});

test('auto-pick: the L key overrides the pick and brings back the riding route', () => {
  const roads = row(C + 6, C - 10, C + 6);
  const start = [C - 8, C + 9], end = [C - 6, C + 6];
  const flipped = chooseRoute({ points: [start, end], flip: true, roads, blockedBy: open });
  assert.deepEqual(flipped.path[1], [C - 8, C + 8]);
  assert.ok(onRoads(flipped.path, roads) > 1);
});

test('auto-pick: an anchor on a street runs off it instead of along it (screenshot 2 layout)', () => {
  const roads = row(C - 2, C - 12, C + 12);
  const anchor = [C - 12, C - 2], end = [C - 4, C + 6];
  assert.deepEqual(elbowPath(anchor, end)[1], [C - 11, C - 2], 'the default runs east along the street');
  const r = chooseRoute({ points: [anchor, end], roads, blockedBy: open });
  assert.deepEqual(r.path[1], [C - 12, C - 1], 'the auto-pick turns off south first');
  assert.equal(onRoads(r.path, roads), 1, 'only the anchor is already a road');
  assert.deepEqual(validateRoute(r.path, roads, open), []);
});

test('auto-pick: when the cleaner corner is blocked, the long way around wins', () => {
  const roads = row(C + 6, C - 10, C + 6);
  const start = [C - 8, C + 9], end = [C - 6, C + 6];
  const water = (gx, gz) => (gx === C - 6 && gz === C + 9 ? 'water' : null);
  const r = chooseRoute({ points: [start, end], roads, blockedBy: water });
  assert.deepEqual(validateRoute(r.path, roads, water), []);
  assert.deepEqual(r.path[1], [C - 8, C + 8], 'it takes the other shape, which rides the street for a few tiles');
});

test('auto-pick keeps the stops of each pivot, so later pivots still land on the route', () => {
  const r = chooseRoute({ points: [[C - 8, C + 9], [C - 6, C + 6], [C + 2, C + 6]], roads: row(C + 6, C - 10, C + 6), blockedBy: open });
  assert.equal(r.path[r.stops[1]].join(), [C - 6, C + 6].join());
  assert.equal(r.path[r.stops[2]].join(), [C + 2, C + 6].join());
});

test('every grid rule has a sheet-friendly message', () => {
  for (const r of ['revisit', 'loop', 'hug', 'zigzag', 'long']) assert.ok(BLOCK_TEXT[r], r);
});

test('roadEnds lists the dead ends of the network', async () => {
  const { roadEnds } = await import('../src/world/roadnet.js');
  const { tileIndex } = await import('../src/world/grid.js');
  const roads = {};
  for (let x = 10; x <= 14; x++) roads[tileIndex(x, 10)] = { t: 'two', p: 0 };
  roads[tileIndex(12, 11)] = { t: 'two', p: 0 };            // a stub off the middle: a tee and a third end
  roads[tileIndex(30, 30)] = { t: 'two', p: 0 };            // a lone tile is not an end (nothing to carry on from)
  const key = (t) => t.join(',');
  assert.deepEqual(roadEnds(roads).map(key).sort(), ['10,10', '12,11', '14,10']);
});

test('road tool: a laid road lets go of its start (no chaining)', () => {
  const src = readFileSync(new URL('../src/ui/modules/road-tool.js', import.meta.url), 'utf8');
  assert.match(src, /function finish\(\) \{ anchor = null; pivots = \[\]; \}/);
  assert.doesNotMatch(src, /anchor = route\.path\[route\.path\.length - 1\]; pivots/);
  assert.match(src, /if \(drawing\(\) && anchor\) \{ anchor = null;/, 'Ctrl+Z drops a waiting start before undoing');
  assert.doesNotMatch(src, /keepRoad|KEEP_KEY/, 'nate chose no Keep drawing toggle');
});
