// The grid grew from 64 to 96 tiles a side. The middle of the map is still the origin, the old ground is unchanged, the
// new ring is mostly buildable, and version 4 saves move their tile keys to the wider grid without moving anything in the world.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GRID_N, GRID_HALF, BASE, TILE, createGrid, tileCenter, tileIndex, worldToTile } from '../src/world/grid.js';
import { getLayout } from '../src/world/layout.js';
import { heightAt } from '../src/world/terrain.js';
import { starterPlaced } from '../src/world/starter.js';
import { starterRoads } from '../src/world/roadnet.js';
import { freshState } from '../src/sim/state.js';
import { SAVE_VERSION, unwrap } from '../src/sim/save.js';

const AREA = GRID_N * GRID_N;

test('the grid is 96 tiles a side and its middle is the origin', () => {
  assert.equal(GRID_N, 96);
  assert.deepEqual(tileCenter(GRID_HALF, GRID_HALF), [0, 0]);
  assert.equal(TILE, 3);
  assert.equal(SAVE_VERSION, 7);
});

test('the old 64-tile ground is unchanged: the same land, water and steep tiles as before the grid grew', () => {
  const g = createGrid(null); // the ground alone, without the farm plots
  const counts = [0, 0, 0, 0];
  for (let gz = 0; gz < GRID_N; gz++) for (let gx = 0; gx < GRID_N; gx++) {
    const [cx, cz] = tileCenter(gx, gz);
    if (Math.abs(cx) <= 93 && Math.abs(cz) <= 93) counts[g.base[tileIndex(gx, gz)]]++;
  }
  assert.deepEqual(counts, [1362, 256, 2351, 0]);
});

test('the new ring is mostly buildable plain, not hills', () => {
  const g = createGrid(getLayout());
  let land = 0, ring = 0;
  for (let gz = 0; gz < GRID_N; gz++) for (let gx = 0; gx < GRID_N; gx++) {
    const [cx, cz] = tileCenter(gx, gz);
    if (Math.abs(cx) <= 96 && Math.abs(cz) <= 96) continue;
    ring++;
    if (g.baseAt(gx, gz) === BASE.LAND) land++;
  }
  assert.ok(land / ring > 0.4, 'land share of the ring: ' + (land / ring).toFixed(2));
  // the far ground stays finite and low enough to read as a plain
  for (const [x, z] of [[-130, -60], [-120, 60], [0, -130], [0, 130]]) assert.ok(Math.abs(heightAt(x, z)) < 4, `${x},${z}`);
});

test('a version 4 save moves its tiles to the wider grid and keeps them where they were in the world', () => {
  const old = (gx, gz) => gz * 64 + gx; // version 4 tile index
  const v4 = {
    ...freshState(), // today's fields, then the parts a version 4 town had on the old grid
    roads: { [old(32, 32)]: { t: 'two', p: 0 }, [old(33, 32)]: { t: 'one', d: 2, p: 0 } },
    zones: '0'.repeat(64 * 64).split('').map((c, i) => (i === old(33, 33) ? '2' : c)).join(''),
    lots: [[old(33, 33), 1, 7]],
    dmap: '0'.repeat(64 * 64).split('').map((c, i) => (i === old(34, 33) ? '3' : c)).join(''),
    placed: [{ id: 'b1000', model: 'cottage', gx: 31, gz: 27, fw: 1, fd: 1, rot: 1, pal: 0, seed: 5, starter: true }],
    trees: [], districts: [{ slot: 3, name: 'Thistle Row', pal: 0, style: 0 }],
  };
  const r = unwrap(JSON.stringify({ v: 4, savedAt: 1, state: v4 }));
  assert.equal(r.ok, true, r.error);
  const s = r.state;
  const at = (gx, gz) => tileIndex(gx, gz);
  assert.ok(s.roads[at(GRID_HALF, GRID_HALF)], 'the cross street is still on the origin');
  assert.equal(s.roads[at(GRID_HALF, GRID_HALF)].t, 'two');
  assert.equal(s.roads[at(GRID_HALF + 1, GRID_HALF)].d, 2, 'one-way direction survives');
  assert.equal(s.zones.length, AREA);
  assert.equal(s.zones[at(GRID_HALF + 1, GRID_HALF + 1)], '2', 'zone paint moved with its tile');
  assert.equal(s.zones.split('2').length - 1, 1, 'and nothing else is painted');
  assert.deepEqual(s.lots, [[at(GRID_HALF + 1, GRID_HALF + 1), 1, 7]]);
  assert.equal(s.dmap[at(GRID_HALF + 2, GRID_HALF + 1)], '3');
  assert.deepEqual(s.placed[0].gx, GRID_HALF - 1);
  assert.deepEqual(s.placed[0].gz, GRID_HALF - 5);
  assert.equal(s.districts[0].name, 'Thistle Row');
});

test('a version 2 save becomes the starter town on today\'s grid and is not moved again', () => {
  const r = unwrap(JSON.stringify({ v: 2, savedAt: 1, state: { coins: 1, roads: {}, speed: 1, levels: {}, removed: [] } }));
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.state.placed.map((p) => [p.gx, p.gz]), starterPlaced().map((p) => [p.gx, p.gz]));
  assert.deepEqual(Object.keys(r.state.roads).map(Number).sort((a, b) => a - b), Object.keys(starterRoads()).map(Number).sort((a, b) => a - b));
});
