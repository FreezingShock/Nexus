import test from 'node:test';
import assert from 'node:assert/strict';
import { quietSim as createSim } from './support/quiet.js';
import { freshState } from '../src/sim/state.js';
import { sanitize } from '../src/sim/save.js';
import { GRID_HALF, TILE, tileIndex, worldToTile } from '../src/world/grid.js';
import { heightAt, baseHeightAt, editAt, setLandEdits } from '../src/world/terrain.js';
import { CN, C_EDGE, LAND_TOP, editsFromPairs, pairsFromEdits, sanitizeLand, cornerIndex, editable } from '../src/world/land.js';
import { landPrice } from '../src/sim/systems/land.js';

const mk = (over = {}) => { const state = Object.assign(freshState(), over); state.coins = 100000; return createSim({ state }); };
// Open meadow east of the starter cottages (the zoning tests use it), and a spot on the river.
const P = { x: 6 * TILE + 1, z: 4 * TILE + 1 };
const dab = (sim, tool, extra = {}) => sim.dispatch({ type: 'terraform', tool, x: P.x, z: P.z, size: 'medium', stroke: 1, ...extra });

test('the corner lattice in terrain.js is the one land.js uses', () => {
  const e = new Float32Array(CN * CN);
  e[cornerIndex(50, 50)] = 2;
  setLandEdits(e);
  try {
    const x = C_EDGE + 50 * TILE, z = C_EDGE + 50 * TILE;
    assert.ok(Math.abs(editAt(x, z) - 2) < 1e-6, 'full offset on the corner');
    assert.ok(Math.abs(editAt(x + TILE / 2, z) - 1) < 1e-6, 'half way to the next corner');
    assert.equal(editAt(x + TILE, z), 0);
  } finally { setLandEdits(null); }
});

test('saved edits: pairs round trip, junk is dropped, and a save without any loads unchanged', () => {
  const e = new Float32Array(CN * CN); e[10] = 1.25; e[400] = -0.5;
  assert.deepEqual(pairsFromEdits(e), [[10, 125], [400, -50]]);
  assert.deepEqual(Array.from(editsFromPairs([[10, 125], [400, -50]])).filter((v) => v), [1.25, -0.5]);
  assert.deepEqual(sanitizeLand([[1, 2], ['x', 3], [CN * CN, 5], [3, NaN], [4], 'no', [5, 99999]]), [[1, 2], [5, 4000]]);
  assert.deepEqual(sanitizeLand(undefined), []);
  const old = freshState(); delete old.land;
  const s = sanitize(old);
  assert.deepEqual(s.land, []);
  createSim({ state: s });
  assert.equal(heightAt(P.x, P.z), baseHeightAt(P.x, P.z), 'no edits: the land as made');
});

test('Raise lifts the ground, charges for the earth, and the grid reads the tile again', () => {
  const sim = mk(), h0 = heightAt(P.x, P.z), c0 = sim.state.coins;
  const [gx, gz] = worldToTile(P.x, P.z), i = tileIndex(gx, gz), thi0 = sim.grid.thi[i];
  dab(sim, 'raise');
  const h1 = heightAt(P.x, P.z);
  assert.ok(h1 > h0 + 0.2, `raised ${h0} -> ${h1}`);
  assert.ok(sim.state.coins < c0, 'paid');
  assert.ok(sim.grid.thi[i] > thi0 + 0.2, 'grid sees the new ground');
  dab(sim, 'lower', { stroke: 2 });
  assert.ok(heightAt(P.x, P.z) < h1, 'Lower takes it down');
});

test('Flatten pulls ground to the level where the stroke began', () => {
  const sim = mk();
  for (let s = 0; s < 6; s++) dab(sim, 'raise');
  const top = heightAt(P.x, P.z);
  for (let s = 0; s < 12; s++) dab(sim, 'flatten', { stroke: 3, level: 0.5 });
  assert.ok(Math.abs(heightAt(P.x, P.z) - 0.5) < Math.abs(top - 0.5) * 0.2, 'mostly back to the level');
});

test('one drag is one undo step, with its coins back', () => {
  const sim = mk(), h0 = heightAt(P.x, P.z), c0 = sim.state.coins;
  for (let s = 0; s < 4; s++) dab(sim, 'raise', { stroke: 7, x: P.x + s, z: P.z });
  assert.ok(heightAt(P.x, P.z) > h0 + 0.5);
  sim.dispatch({ type: 'undo' });
  assert.ok(Math.abs(heightAt(P.x, P.z) - h0) < 1e-6, 'ground back');
  assert.equal(sim.state.coins, c0, 'coins back');
});

test('the tools never touch the river, the mountain rim or the tunnel mountain', () => {
  const sim = mk({ terrainSeed: 99 }); // seeded land: walled by mountains
  const spots = [{ x: 52 + 7 * Math.sin(0.6), z: 0 }, { x: -140, z: 0 }, { x: 0, z: 141 }, { x: 80, z: 0 }];
  for (const p of spots) {
    const h0 = heightAt(p.x, p.z), c0 = sim.state.coins;
    sim.dispatch({ type: 'terraform', tool: 'raise', x: p.x, z: p.z, size: 'small', stroke: 9, first: true });
    assert.equal(heightAt(p.x, p.z), h0, `${p.x},${p.z} stays`);
    assert.equal(sim.state.coins, c0);
  }
  createSim({ state: freshState() }); // back to the pinned land
});

test('raised ground stops below the mountain line', () => {
  const sim = mk();
  for (let s = 0; s < 120; s++) dab(sim, 'raise');
  assert.ok(heightAt(P.x, P.z) <= LAND_TOP + 1e-6);
});

test('not enough coins: nothing moves', () => {
  const sim = mk(); sim.state.coins = 0;
  const h0 = heightAt(P.x, P.z);
  dab(sim, 'raise');
  assert.equal(heightAt(P.x, P.z), h0);
});

test('edits survive a save and load', () => {
  const sim = mk();
  dab(sim, 'raise');
  const h = heightAt(P.x, P.z);
  const saved = JSON.parse(JSON.stringify(sim.prepareSave()));
  assert.ok(saved.land.length > 0);
  setLandEdits(null);
  createSim({ state: sanitize(saved) });
  assert.ok(Math.abs(heightAt(P.x, P.z) - h) < 0.01);
});

test('the price follows the earth moved', () => {
  assert.equal(landPrice(0), 0);
  assert.ok(landPrice(3) > landPrice(1));
});

test('on seeded land steep hills are within reach and the high mountains are not', () => {
  createSim({ state: Object.assign(freshState(), { terrainSeed: 1234567 }) });
  let steep = 0, high = 0;
  for (let j = 2; j < CN - 2; j++) for (let i = 2; i < CN - 2; i++) {
    const x = C_EDGE + i * TILE, z = C_EDGE + j * TILE, h = baseHeightAt(x, z);
    const ok = editable(i, j, 'sweep');
    if (h > LAND_TOP) { assert.equal(ok, false, 'mountain'); high++; }
    if (ok && Math.abs(baseHeightAt(x + 3, z) - baseHeightAt(x - 3, z)) > 1.8) steep++;
  }
  assert.ok(high > 200, `the rim is locked (${high})`);
  assert.ok(steep > 50, `steep hillsides can be shaped (${steep})`);
  createSim({ state: freshState() });
});

test('digging never puts a road or a building under water', () => {
  const sim = mk();
  const k = Object.keys(sim.state.roads)[3], gx = k % 96, gz = Math.floor(k / 96);
  const x = (gx - GRID_HALF) * TILE, z = (gz - GRID_HALF) * TILE;
  for (let s = 0; s < 80; s++) sim.dispatch({ type: 'terraform', tool: 'lower', x, z, size: 'large', stroke: 4 });
  assert.ok(heightAt(x, z) > -0.15, `the road stays dry (${heightAt(x, z)})`);
  assert.notEqual(sim.grid.baseAt(gx, gz), 1, 'not water');
});
