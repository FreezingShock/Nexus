import test from 'node:test';
import assert from 'node:assert/strict';
import { quietSim as createSim } from './support/quiet.js';
import { getLayout } from '../src/world/layout.js';
import { checkLot } from '../src/world/placement.js';
import { scanArea, ASK_BUILDINGS } from '../src/world/bulldoze-area.js';
import { starterProtected } from '../src/world/starter.js';
import { tileIndex } from '../src/world/grid.js';

const layout = getLayout();
const lot = (x, z) => ({ model: 'cottage', gx: x, gz: z, fw: 1, fd: 1, rot: 0 });
function openRun(sim, n) {
  for (let z = 4; z < 60; z++) for (let x = 4; x + n < 60; x++) {
    let ok = true;
    for (let k = 0; k < n && ok; k++) ok = checkLot(sim.grid, x + k, z, 1, 1).ok;
    if (ok) return [x, z];
  }
  throw new Error('no free run');
}
const mine = (sim) => sim.state.placed.filter((r) => !r.starter);

test('a box over placed buildings clears them all and one undo brings them back', () => {
  const sim = createSim({ layout });
  sim.state.coins = 1e9;
  const [x, z] = openRun(sim, 4);
  sim.dispatch({ type: 'placeRow', ...lot(x, z), count: 4 });
  if (mine(sim).length < 4) for (let k = 0; k < 4; k++) if (!mine(sim).some((r) => r.gx === x + k)) sim.dispatch({ type: 'place', ...lot(x + k, z) });
  assert.equal(mine(sim).length, 4);
  const scan = scanArea(sim.state, sim.grid, [x, z], [x + 3, z], starterProtected());
  assert.equal(scan.buildings.length, 4);
  assert.equal(scan.asks, false);
  sim.dispatch({ type: 'bulldozeArea', a: [x, z], b: [x + 3, z] });
  assert.equal(mine(sim).length, 0);
  sim.dispatch({ type: 'undo' });
  assert.equal(mine(sim).length, 4);
});

test('roads in the box refund half and come back whole on undo; the bridge stays', () => {
  const sim = createSim({ layout });
  const keep = starterProtected();
  const before = { ...sim.state.roads }, coins = sim.state.coins;
  sim.dispatch({ type: 'bulldozeArea', a: [0, 0], b: [95, 95] });
  for (const i of keep) assert.ok(sim.state.roads[i], 'protected road tile kept');
  sim.dispatch({ type: 'undo' });
  assert.deepEqual(sim.state.roads, before);
  assert.equal(sim.state.coins, coins);
});

test('trees in the box go and return as one step; empty ground says so', () => {
  const sim = createSim({ layout });
  const n = sim.state.trees.length;
  assert.ok(n > 0);
  sim.dispatch({ type: 'bulldozeArea', a: [0, 0], b: [95, 95] });
  assert.ok(sim.state.trees.length < n, "trees inside the grid went");
  sim.dispatch({ type: 'undo' });
  assert.equal(sim.state.trees.length, n);
});

test('a big box asks first', () => {
  const sim = createSim({ layout });
  const s = scanArea(sim.state, sim.grid, [0, 0], [95, 95], starterProtected());
  assert.equal(s.asks, s.count >= ASK_BUILDINGS || s.refund > 1000);
  assert.ok(s.hit.length > 0);
  assert.equal(tileIndex(0, 0), 0);
});
