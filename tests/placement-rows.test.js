import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { getLayout } from '../src/world/layout.js';
import { buildCost } from '../src/sim/economy.js';
import { areaCost, modelById } from '../src/world/models.js';
import { LOT_BASE, MAX_ROW, checkLot, rowOrigins } from '../src/world/placement.js';
import { tileIndex } from '../src/world/grid.js';
import { roadBlock } from '../src/world/roadnet.js';

const layout = getLayout();
const cottage = modelById('cottage');
const price = (owned) => buildCost(areaCost(cottage, 1, 1), owned);
const lot = (x, z) => ({ model: 'cottage', gx: x, gz: z, fw: 1, fd: 1, rot: 0 });

// The first run of n free 1 x 1 lots in a row, far enough from the founding streets to scan quickly.
function openRun(sim, n) {
  for (let z = 4; z < 60; z++) for (let x = 4; x + n < 60; x++) {
    let ok = true;
    for (let k = 0; k < n && ok; k++) ok = checkLot(sim.grid, x + k, z, 1, 1).ok;
    if (ok) return [x, z];
  }
  throw new Error('no free run in the test town');
}
// Two free lots in a row that a road may also take (no steep ground, no water).
function openRoadRun(sim) {
  for (let z = 4; z < 60; z++) for (let x = 4; x + 2 < 60; x++) {
    const ok = [0, 1].every((k) => checkLot(sim.grid, x + k, z, 1, 1).ok && !roadBlock(sim.grid, sim.layout, sim.state, x + k, z));
    if (ok) return [x, z];
  }
  throw new Error('no road run in the test town');
}
const rowItems = (x, z, n) => Array.from({ length: n }, (_, i) => lot(x + i, z));
const lastToast = (events) => [...events].reverse().find((e) => e.type === 'toast');

test('rowOrigins lays lots edge to edge along the longer drag, first one centered on the start', () => {
  assert.deepEqual(rowOrigins([10, 10], [10, 10], 3, 1), [[9, 10]]); // a click is one lot
  assert.deepEqual(rowOrigins([10, 10], [16, 11], 3, 1), [[9, 10], [12, 10], [15, 10]]); // mostly along x
  assert.deepEqual(rowOrigins([10, 10], [7, 10], 3, 1), [[9, 10], [6, 10]]); // dragging left
  assert.deepEqual(rowOrigins([10, 10], [11, 15], 1, 2), [[10, 10], [10, 12], [10, 14]]); // mostly along z, 2 deep
  assert.equal(rowOrigins([0, 0], [60, 0], 1, 1).length, MAX_ROW);
});

test('a dragged row places every free lot and charges each at the price it then has', () => {
  const sim = createSim({ layout });
  sim.state.coins = 1e9;
  const [x, z] = openRun(sim, 3);
  const c0 = sim.state.coins;
  sim.dispatch({ type: 'placeMany', items: rowItems(x, z, 3) });
  assert.equal(sim.state.placed.length, 3);
  assert.equal(c0 - sim.state.coins, price(0) + price(1) + price(2));
  assert.equal(new Set(sim.state.placed.map((r) => r.id)).size, 3);
  for (let i = 0; i < 3; i++) assert.ok(sim.grid.lot[tileIndex(x + i, z)] >= LOT_BASE);
});

test('a row skips a lot that is already built and places the rest', () => {
  const sim = createSim({ layout });
  sim.state.coins = 1e9;
  const [x, z] = openRun(sim, 3);
  sim.dispatch({ type: 'place', ...lot(x + 1, z) });
  sim.dispatch({ type: 'placeMany', items: rowItems(x, z, 3) });
  assert.equal(sim.state.placed.length, 3); // one from before, two from the row
  const at = sim.state.placed.map((r) => r.gx).sort((a, b) => a - b);
  assert.deepEqual(at, [x, x + 1, x + 2]);
});

test('a row stops when coins run out and keeps what it built', () => {
  const sim = createSim({ layout });
  const [x, z] = openRun(sim, 3);
  const events = [];
  sim.subscribe((e) => events.push(e));
  sim.state.coins = price(0) + price(1);
  sim.dispatch({ type: 'placeMany', items: rowItems(x, z, 3) });
  assert.equal(sim.state.placed.length, 2);
  assert.equal(sim.state.coins, 0);
  const placed = events.find((e) => e.type === 'placed');
  assert.match(placed.text, /out of coins/);
});

test('undo takes back a whole row and refunds exactly what it cost', () => {
  const sim = createSim({ layout });
  sim.state.coins = 1e9;
  const [x, z] = openRun(sim, 3);
  const c0 = sim.state.coins;
  sim.dispatch({ type: 'placeMany', items: rowItems(x, z, 3) });
  sim.dispatch({ type: 'undo' });
  assert.equal(sim.state.placed.length, 0);
  assert.equal(sim.state.coins, c0);
  assert.equal(sim.grid.lot[tileIndex(x, z)], 0);
});

test('undo goes newest first across single placements and rows, then reports when there is nothing left', () => {
  const sim = createSim({ layout });
  sim.state.coins = 1e9;
  const events = [];
  sim.subscribe((e) => events.push(e));
  const [x, z] = openRun(sim, 3);
  sim.dispatch({ type: 'place', ...lot(x, z) });
  sim.dispatch({ type: 'placeMany', items: rowItems(x + 1, z, 2) });
  sim.dispatch({ type: 'undo' });
  assert.equal(sim.state.placed.length, 1);
  sim.dispatch({ type: 'undo' });
  assert.equal(sim.state.placed.length, 0);
  sim.dispatch({ type: 'undo' });
  assert.equal(lastToast(events).text, 'Nothing to undo');
});

test('undo brings back a bulldozed building on its lot', () => {
  const sim = createSim({ layout });
  sim.state.coins = 1e9;
  const [x, z] = openRun(sim, 1);
  sim.dispatch({ type: 'place', ...lot(x, z) });
  const id = sim.state.placed[0].id;
  sim.dispatch({ type: 'bulldoze', id });
  assert.equal(sim.alive(id), false);
  assert.equal(sim.grid.lot[tileIndex(x, z)], 0);
  sim.dispatch({ type: 'undo' });
  assert.equal(sim.alive(id), true);
  assert.equal(sim.state.placed.length, 1);
  assert.ok(sim.grid.lot[tileIndex(x, z)] >= LOT_BASE);
});

test('one bulldoze sweep is one undo step, however many buildings it took', () => {
  const sim = createSim({ layout });
  sim.state.coins = 1e9;
  const [x, z] = openRun(sim, 3);
  sim.dispatch({ type: 'placeMany', items: rowItems(x, z, 3) });
  const ids = sim.state.placed.map((r) => r.id);
  for (const id of ids) sim.dispatch({ type: 'bulldoze', id, group: 7 });
  assert.ok(ids.every((id) => !sim.alive(id)));
  sim.dispatch({ type: 'undo' });
  assert.ok(ids.every((id) => sim.alive(id)));
  assert.equal(sim.state.placed.length, 3);
});

test('undo takes back the newer of a road stroke and a placement, and leaves the other alone', () => {
  const sim = createSim({ layout });
  sim.state.coins = 1e9;
  const [rx, rz] = openRoadRun(sim);
  sim.dispatch({ type: 'drawRoad', roadType: 'two', path: [[rx, rz], [rx + 1, rz]] });
  const [x, z] = openRun(sim, 1);
  sim.dispatch({ type: 'place', ...lot(x, z) });
  sim.dispatch({ type: 'undo' });
  assert.equal(sim.state.placed.length, 0);
  assert.ok(sim.state.roads[tileIndex(rx, rz)], 'the road stays');
  sim.dispatch({ type: 'undo' });
  assert.equal(sim.state.roads[tileIndex(rx, rz)], undefined, 'then the road goes');
});
