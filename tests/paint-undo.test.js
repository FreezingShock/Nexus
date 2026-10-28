import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { getLayout } from '../src/world/layout.js';
import { tileIndex } from '../src/world/grid.js';
import { roadBesideTiles } from './support/road.js';

const layout = getLayout();

// The first open tile, scanning from the corner of the map.
function openTile(sim) {
  for (let z = 4; z < 60; z++) for (let x = 4; x < 60; x++) if (sim.grid.isOpen(x, z)) return [x, z];
  throw new Error('no open tile in the test town');
}

test('undo takes back a zone paint and refunds what it cost', () => {
  const sim = createSim({ layout });
  sim.state.coins = 1000;
  const [x, z] = openTile(sim), i = tileIndex(x, z);
  const c0 = sim.state.coins;
  roadBesideTiles(sim, [[x, z]]);
  sim.dispatch({ type: 'paintZone', zone: 1, a: [x, z], b: [x, z] });
  assert.equal(sim.grid.zone[i], 1);
  assert.ok(sim.state.coins < c0);
  sim.dispatch({ type: 'undo' });
  assert.equal(sim.grid.zone[i], 0);
  assert.equal(sim.state.coins, c0);
});

test('undo takes back an erase, and the paint comes back', () => {
  const sim = createSim({ layout });
  sim.state.coins = 1000;
  const [x, z] = openTile(sim), i = tileIndex(x, z);
  roadBesideTiles(sim, [[x, z]]);
  sim.dispatch({ type: 'paintZone', zone: 2, a: [x, z], b: [x, z] });
  sim.dispatch({ type: 'clearZone', a: [x, z], b: [x, z] });
  assert.equal(sim.grid.zone[i], 0);
  sim.dispatch({ type: 'undo' });
  assert.equal(sim.grid.zone[i], 2);
});

test('undo takes back a district paint and leaves the district itself in place', () => {
  const sim = createSim({ layout });
  const [x, z] = openTile(sim), i = tileIndex(x, z);
  sim.dispatch({ type: 'newDistrict' });
  const slot = sim.state.districts[0].slot;
  sim.dispatch({ type: 'paintDistrict', slot, a: [x, z], b: [x, z] });
  assert.equal(sim.grid.district[i], slot);
  sim.dispatch({ type: 'undo' });
  assert.equal(sim.grid.district[i], 0);
  assert.equal(sim.state.districts.length, 1);
});
