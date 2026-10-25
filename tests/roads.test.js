import test from 'node:test';
import assert from 'node:assert/strict';
import { quietSim as createSim } from './support/quiet.js';
import { freshState } from '../src/sim/state.js';
import { sanitize, unwrap, wrap } from '../src/sim/save.js';
import { getLayout } from '../src/world/layout.js';
import { tileIndex, GRID_HALF } from '../src/world/grid.js';
import {
  DIRS, connMask, elbowPath, pathDirs, planStroke, roadBlock, rulerPath, shapeOf, starterRoads,
} from '../src/world/roadnet.js';

const layout = getLayout();
const C = GRID_HALF; // grid tile of world (0, 0)
const key = (gx, gz) => tileIndex(gx, gz);
const costOf = (t) => ({ two: 20, bike: 35, one: 45 })[t];
// open ground north of the town, clear of blocks, water and hills
const free = [C - 6, C - 14];

test('starter streets are editable tiles: a main street and a cross street meeting at the square', () => {
  const r = starterRoads();
  assert.equal(Object.keys(r).length, 36); // a bar of 13 tiles and a stem of 23, the crossing counted once
  assert.equal(shapeOf(connMask(r, C, C)).kind, 'tee', 'the bar meets the stem');
  assert.equal(shapeOf(connMask(r, C, C - 4)).kind, 'straight');
  assert.equal(shapeOf(connMask(r, C + 6, C)).kind, 'straight', 'the stem runs east');
  assert.equal(shapeOf(connMask(r, C + 23, C)).kind, 'end', 'the stem ends at the tunnel gate');
  assert.equal(shapeOf(connMask(r, C, C - 6)).kind, 'end');
  assert.equal(shapeOf(connMask(r, C - 4, C)).kind, 'iso', 'there is no west arm');
  assert.equal(shapeOf(connMask(r, C + 3, C + 3)).kind, 'iso', 'the open land beside the streets is not a road');
});

test('shapes follow the connections', () => {
  const r = { [key(5, 5)]: { t: 'two' } };
  assert.equal(shapeOf(connMask(r, 5, 5)).kind, 'iso');
  r[key(6, 5)] = { t: 'two' };
  assert.equal(shapeOf(connMask(r, 5, 5)).kind, 'end');
  r[key(5, 6)] = { t: 'two' };
  assert.deepEqual(shapeOf(connMask(r, 5, 5)), { kind: 'corner', dirs: [0, 1] });
  r[key(4, 5)] = { t: 'two' };
  assert.equal(shapeOf(connMask(r, 5, 5)).kind, 'tee');
});

test('ruler and elbow helpers', () => {
  assert.deepEqual(rulerPath([2, 2], [6, 3]), [[2, 2], [3, 2], [4, 2], [5, 2], [6, 2]]);
  assert.deepEqual(elbowPath([2, 2], [4, 4]).map((t) => t.join()), ['2,2', '3,2', '4,2', '4,3', '4,4']);
  assert.deepEqual(elbowPath([1, 1], [1, 1]), [[1, 1]]);
  assert.deepEqual(elbowPath([2, 2], [4, 4], true).map((t) => t.join()), ['2,2', '2,3', '2,4', '3,4', '4,4']); // flipped: the vertical leg first
});

test('one-way directions follow the route and the last tile keeps its heading', () => {
  assert.deepEqual(pathDirs([[0, 0], [1, 0], [1, 1]]), [0, 1, 1]);
  assert.deepEqual(pathDirs([[4, 4]]), [0]);
});

test('planStroke: upgrades pay the difference, same type is free', () => {
  const roads = { [key(1, 1)]: { t: 'two', p: 20 }, [key(2, 1)]: { t: 'bike', p: 35 } };
  const path = [[1, 1], [2, 1], [3, 1]];
  const plan = planStroke({ path, type: 'bike', roads, blockedBy: () => null, costOf });
  assert.deepEqual(plan.tiles.map((t) => [t.gx, t.price]), [[1, 15], [3, 35]]);
  assert.equal(plan.cost, 50);
  assert.equal(plan.length, 3);
});

test('roads cannot go on water, hills, parks or standing buildings', () => {
  const sim = createSim({ layout });
  const { grid, state } = sim;
  assert.equal(roadBlock(grid, layout, state, free[0], free[1]), null);
  assert.equal(roadBlock(grid, layout, state, C + 18, C), 'water');
  assert.equal(roadBlock(grid, layout, state, -1, 0), 'bounds');
  // a starter house (the terrace on the north side of the main street) and the starter park are built lots
  const house = state.placed.find((r) => r.id === 'b1000');
  assert.equal(roadBlock(grid, layout, state, house.gx, house.gz), 'lot');
  const park = state.placed.find((r) => r.model === 'green');
  assert.equal(roadBlock(grid, layout, state, park.gx, park.gz), 'lot');
  sim.dispatch({ type: 'bulldoze', id: house.id });
  assert.equal(roadBlock(grid, layout, state, house.gx, house.gz), null, 'a bulldozed building frees its tiles');
});

const stroke = (n, from = free) => Array.from({ length: n }, (_, i) => [from[0] + i, from[1]]);

test('drawRoad charges once, writes state and the grid layer, and clears zone paint', () => {
  const sim = createSim({ layout });
  const { state, grid } = sim;
  state.coins = 1000;
  grid.zone[key(free[0] + 1, free[1])] = 2;
  const seen = [];
  sim.subscribe((e) => seen.push(e.type));
  sim.dispatch({ type: 'drawRoad', roadType: 'two', path: stroke(5) });
  assert.equal(state.coins, 700);
  assert.equal(state.roads[key(free[0], free[1])].p, 60);
  assert.ok(grid.road[key(free[0] + 4, free[1])] > 0);
  assert.equal(grid.zone[key(free[0] + 1, free[1])], 0);
  assert.ok(seen.includes('roadsChanged'));
  sim.dispatch({ type: 'drawRoad', roadType: 'two', path: stroke(5) }); // same again: nothing new, nothing charged
  assert.equal(state.coins, 700);
});

test('drawRoad refuses bad input: unaffordable, blocked, locked, disconnected', () => {
  const sim = createSim({ layout });
  const { state } = sim;
  state.coins = 50;
  sim.dispatch({ type: 'drawRoad', roadType: 'two', path: stroke(5) });
  assert.equal(state.coins, 50);
  assert.equal(state.roads[key(free[0], free[1])], undefined);
  state.coins = 5000;
  sim.dispatch({ type: 'drawRoad', roadType: 'bus', path: stroke(3) });
  sim.dispatch({ type: 'drawRoad', roadType: 'two', path: [[free[0], free[1]], [free[0] + 2, free[1]]] });
  sim.dispatch({ type: 'drawRoad', roadType: 'two', path: [[C + 18, C], [C + 19, C]] });
  sim.dispatch({ type: 'drawRoad', roadType: 'nope', path: stroke(2) });
  sim.dispatch({ type: 'drawRoad', roadType: 'two', path: 'x' });
  assert.equal(state.coins, 5000);
});

test('one-way roads take their direction from the stroke', () => {
  const sim = createSim({ layout });
  sim.state.coins = 1000; sim.state.parts = 450;
  sim.dispatch({ type: 'unlockRoad', roadType: 'one' });
  sim.dispatch({ type: 'drawRoad', roadType: 'one', path: [[free[0], free[1]], [free[0], free[1] + 1], [free[0] + 1, free[1] + 1]] });
  const r = sim.state.roads;
  assert.equal(r[key(free[0], free[1])].d, 1);
  assert.equal(r[key(free[0], free[1] + 1)].d, 0);
  assert.equal(r[key(free[0] + 1, free[1] + 1)].d, 0);
});

test('undo gives the coins back, bulldoze refunds half, starter streets refund nothing', () => {
  const sim = createSim({ layout });
  const { state } = sim;
  state.coins = 1000;
  sim.dispatch({ type: 'drawRoad', roadType: 'two', path: stroke(4) });
  assert.equal(state.coins, 760);
  sim.dispatch({ type: 'undoRoad' });
  assert.equal(state.coins, 1000);
  assert.equal(state.roads[key(free[0], free[1])], undefined);
  assert.equal(sim.grid.road[key(free[0], free[1])], 0);
  sim.dispatch({ type: 'drawRoad', roadType: 'two', path: stroke(4) });
  sim.dispatch({ type: 'bulldozeRoad', tiles: [[free[0], free[1]], [C, C]] });
  assert.equal(state.coins, 760 + 30);
  assert.equal(state.roads[key(C, C)], undefined);
  sim.dispatch({ type: 'undoRoad' }); // brings both tiles back and takes the refund again
  assert.ok(state.roads[key(C, C)] && state.roads[key(free[0], free[1])]);
  assert.equal(state.coins, 760);
  sim.dispatch({ type: 'undoRoad' });
  sim.dispatch({ type: 'undoRoad' }); // nothing left: no change
  assert.equal(state.coins, 1000);
});

test('bus avenue unlocks with Parts, once', () => {
  const sim = createSim({ layout });
  const { state } = sim;
  sim.dispatch({ type: 'unlockRoad', roadType: 'bus' });
  assert.deepEqual(state.roadUnlocks, []);
  state.parts = 2100; state.coins = 1000;
  sim.dispatch({ type: 'unlockRoad', roadType: 'bus' });
  sim.dispatch({ type: 'unlockRoad', roadType: 'bus' });
  assert.deepEqual(state.roadUnlocks, ['bus']);
  assert.equal(state.parts, 300);
  sim.dispatch({ type: 'drawRoad', roadType: 'bus', path: stroke(2) });
  assert.equal(state.coins, 640);
});

test('roads survive save and load; bad road data is dropped; old saves get the starter streets', () => {
  const s = freshState();
  s.roads[key(free[0], free[1])] = { t: 'one', d: 2, p: 45 };
  const back = unwrap(JSON.stringify(wrap(s, 1))).state;
  assert.deepEqual(back.roads[key(free[0], free[1])], { t: 'one', d: 2, p: 45 });
  const dirty = sanitize({ roads: { 5: { t: 'lava' }, nope: { t: 'two' }, [key(1, 1)]: { t: 'two', p: -4 }, 999999: { t: 'two' } }, roadUnlocks: ['bus', 'two', 'free', 'x'] });
  assert.deepEqual(Object.keys(dirty.roads), [String(key(1, 1))]);
  assert.equal(dirty.roads[key(1, 1)].p, 0);
  assert.deepEqual(dirty.roadUnlocks, ['bus', 'free']);
  const old = sanitize({ coins: 5 });
  assert.equal(Object.keys(old.roads).length, Object.keys(starterRoads()).length);
  assert.deepEqual(sanitize({ roads: {} }).roads, {}, 'a town with every road bulldozed stays empty');
});

test('DIRS and opposite agree', () => {
  assert.deepEqual(DIRS.map((d) => d.join()), ['1,0', '0,1', '-1,0', '0,-1']);
});

test('roadRun follows a street between junctions; a junction is a run of one', async () => {
  const { roadRun } = await import('../src/world/roadnet.js');
  const roads = {};
  const put = (x, z) => { roads[key(x, z)] = { t: 'two', p: 0 }; };
  for (let x = 10; x <= 16; x++) put(x, 10);            // a street east-west
  put(13, 11); put(13, 12); put(14, 12);                // a side street off its middle, with a corner
  const k = (t) => t.join(',');
  assert.deepEqual(roadRun(roads, [11, 10]).map(k), ['10,10', '11,10', '12,10']);
  assert.deepEqual(roadRun(roads, [13, 10]).map(k), ['13,10'], 'the tee on its own');
  assert.deepEqual(roadRun(roads, [13, 12]).map(k).sort(), ['13,11', '13,12', '14,12'], 'round the corner, up to the tee');
  assert.deepEqual(roadRun(roads, [40, 40]), [], 'no road, no run');
});

test('replaceRoad retypes a street for the difference and undoes', async () => {
  const { ROAD_TYPES } = await import('../src/sim/catalog.js');
  const cost = (id) => ROAD_TYPES.find((r) => r.id === id).cost;
  const sim = createSim({ layout });
  const { state } = sim;
  state.coins = 5000; state.parts = 5000;
  sim.dispatch({ type: 'unlockRoad', roadType: 'one' });
  sim.dispatch({ type: 'unlockRoad', roadType: 'bike' });
  sim.dispatch({ type: 'drawRoad', roadType: 'two', path: stroke(4) });
  const before = state.coins;
  sim.dispatch({ type: 'replaceRoad', roadType: 'bike', path: stroke(4) });
  assert.equal(state.coins, before - 4 * Math.max(0, cost('bike') - cost('two')));
  assert.equal(state.roads[key(free[0] + 2, free[1])].t, 'bike');
  sim.dispatch({ type: 'replaceRoad', roadType: 'one', path: stroke(4) });
  assert.equal(state.roads[key(free[0], free[1])].d, 0, 'one-way heads east, the way the run was given');
  sim.dispatch({ type: 'undoRoad' });
  assert.equal(state.roads[key(free[0], free[1])].t, 'bike', 'undo puts the bike lane back');
  // A run that steps off the road, or a locked type, changes nothing.
  const snap = JSON.stringify(state.roads);
  sim.dispatch({ type: 'replaceRoad', roadType: 'two', path: [...stroke(4), [free[0] + 4, free[1]]] });
  sim.dispatch({ type: 'replaceRoad', roadType: 'free', path: stroke(4) });
  assert.equal(JSON.stringify(state.roads), snap);
});

test('replaceRoad leaves the bridge and the tunnel road as they are', async () => {
  const { starterProtected } = await import('../src/world/starter.js');
  const sim = createSim({ layout });
  const { state } = sim;
  state.coins = 1e6;
  const idx = [...starterProtected()][0], gx = idx % 96, gz = Math.floor(idx / 96);
  const t = state.roads[idx].t;
  sim.dispatch({ type: 'replaceRoad', roadType: 'bike', path: [[gx, gz]] });
  assert.equal(state.roads[idx].t, t);
  assert.equal(state.coins, 1e6);
});
