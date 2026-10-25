// Roads on hills: only cliffs refuse a road; on a hillside the road cuts and fills its way at no more than GRADE a tile.
import test from 'node:test';
import assert from 'node:assert/strict';
import { quietSim as createSim } from './support/quiet.js';
import { freshState } from '../src/sim/state.js';
import { BASE, GRID_N, GRID_HALF, TILE, tileIndex } from '../src/world/grid.js';
import { heightAt } from '../src/world/terrain.js';
import { roadBlock } from '../src/world/roadnet.js';
import { GRADE, profile } from '../src/world/grade.js';

const seeded = () => { const state = freshState(); state.terrainSeed = 1234567; state.coins = 1e7; return createSim({ state }); };
const cy = (gx, gz) => Math.max(0, heightAt((gx - GRID_HALF) * TILE, (gz - GRID_HALF) * TILE));

// A straight run of open hillside, rising more than GRADE somewhere along it.
function hillRun(sim, len = 8) {
  const g = sim.grid;
  for (let gz = 8; gz < GRID_N - 8; gz++) for (let gx = 8; gx < GRID_N - 8 - len; gx++) {
    const path = Array.from({ length: len }, (_, k) => [gx + k, gz]);
    if (!path.every(([x, z]) => g.isOpen(x, z) && roadBlock(g, null, sim.state, x, z) === null)) continue;
    let steep = false;
    for (let k = 1; k < len; k++) if (Math.abs(cy(gx + k, gz) - cy(gx + k - 1, gz)) > GRADE + 0.3) steep = true;
    if (steep) return path;
  }
  return null;
}

test('hillsides take roads: only cliffs say too steep', () => {
  const sim = seeded(), g = sim.grid;
  for (let i = 0; i < g.base.length; i++) {
    const gx = i % GRID_N, gz = Math.floor(i / GRID_N), why = roadBlock(g, null, sim.state, gx, gz);
    if (why === 'steep') assert.equal(g.base[i], BASE.STEEP);
  }
  createSim({ state: freshState() });
});

test('a road up a steep hillside grades itself to the limit, costs its earthworks and undoes cleanly', () => {
  const sim = seeded();
  const path = hillRun(sim);
  assert.ok(path, 'found a steep run');
  const before = path.map(([x, z]) => cy(x, z)), c0 = sim.state.coins;
  const works = sim.roadWorks(path);
  assert.ok(works > 0, 'earthworks priced');
  sim.dispatch({ type: 'drawRoad', roadType: 'two', path });
  assert.ok(path.every(([x, z]) => sim.state.roads[tileIndex(x, z)]), 'the road is laid');
  for (let k = 1; k < path.length; k++) {
    const d = Math.abs(cy(...path[k]) - cy(...path[k - 1]));
    assert.ok(d <= GRADE + 0.06, `climb ${d.toFixed(2)} at ${k}`);
  }
  assert.ok(c0 - sim.state.coins >= works, 'paid road and earthworks');
  sim.dispatch({ type: 'undo' });
  path.forEach(([x, z], k) => assert.ok(Math.abs(cy(x, z) - before[k]) < 0.03, 'the hill is back'));
  assert.equal(sim.state.coins, c0, 'coins back');
  createSim({ state: freshState() });
});

test('the profile keeps every step within the grade and meets existing streets where they are', () => {
  createSim({ state: Object.assign(freshState(), { terrainSeed: 1234567 }) });
  const path = Array.from({ length: 30 }, (_, k) => [20 + k, 30]);
  const p = profile(path, {});
  for (let k = 1; k < p.length; k++) assert.ok(Math.abs(p[k] - p[k - 1]) <= GRADE + 1e-9);
  const roads = { [tileIndex(20, 30)]: { t: 'two', p: 0 } };
  assert.equal(profile(path, roads)[0], Math.max(0.05, cy(20, 30)));
  createSim({ state: freshState() });
});
