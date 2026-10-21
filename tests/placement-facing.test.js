import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { getLayout } from '../src/world/layout.js';
import { frontRoadCount } from '../src/world/placement.js';
import { tileIndex } from '../src/world/grid.js';

const layout = getLayout();

// A 2 x 1 lot at (20, 20) with a road only on the tile in front of it, for each turn.
function roadAt(sim, x, z) { sim.grid.road[tileIndex(x, z)] = 1; }

test('a building faces +z at turn 0, and each quarter turn follows the renderer (rotation.y)', () => {
  const sim = createSim({ layout });
  roadAt(sim, 21, 21); // one tile past the +z edge of the lot (x 20..21, z 20)
  assert.equal(frontRoadCount(sim.grid, 20, 20, 2, 1, 0), 1, 'turn 0 faces +z');
  assert.equal(frontRoadCount(sim.grid, 20, 20, 2, 1, 2), 0, 'turn 2 faces -z');
});

test('the front strip counts every tile along the edge, and skips the lot itself', () => {
  const sim = createSim({ layout });
  roadAt(sim, 20, 21); roadAt(sim, 21, 21); roadAt(sim, 20, 20); // the last one is inside the lot
  assert.equal(frontRoadCount(sim.grid, 20, 20, 2, 1, 0), 2);
});

test('turns 1 and 3 face +x and -x', () => {
  const sim = createSim({ layout });
  roadAt(sim, 22, 20); // one tile past the +x edge of a 2 x 1 lot at (20, 20)
  assert.equal(frontRoadCount(sim.grid, 20, 20, 2, 1, 1), 1, 'turn 1 faces +x');
  assert.equal(frontRoadCount(sim.grid, 20, 20, 2, 1, 3), 0, 'turn 3 faces -x');
  assert.equal(frontRoadCount(sim.grid, 20, 20, 2, 1, 1 + 4), 1, 'turns wrap');
});

test('a strip off the edge of the grid counts nothing', () => {
  const sim = createSim({ layout });
  assert.equal(frontRoadCount(sim.grid, 0, 0, 1, 1, 2), 0);
});
