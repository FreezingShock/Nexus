import test from 'node:test';
import assert from 'node:assert/strict';
import { getLayout } from '../src/world/layout.js';
import { GRID_N, TILE, BASE, ROAD_STATIC, createGrid, tileCenter, worldToTile, snapToTile, rectTiles, inBounds, tileIndex, tileOf } from '../src/world/grid.js';

test('tile centers round-trip and sit on multiples of the tile size', () => {
  for (const [gx, gz] of [[0, 0], [32, 32], [63, 63], [10, 50]]) {
    const [x, z] = tileCenter(gx, gz);
    assert.equal((x % TILE) + 0, 0); assert.equal((z % TILE) + 0, 0);
    assert.deepEqual(worldToTile(x, z), [gx, gz]);
    assert.deepEqual(worldToTile(x + 1.4, z - 1.4), [gx, gz]);
  }
  assert.deepEqual(tileCenter(32, 32).map((v) => v + 0), [0, 0]);
  assert.deepEqual(snapToTile(7.4, -4.4), [6, -3]);
});

test('inBounds and index helpers', () => {
  assert.ok(inBounds(0, 0) && inBounds(63, 63));
  assert.ok(!inBounds(-1, 0) && !inBounds(0, 64) && !inBounds(1.5, 2));
  assert.deepEqual(tileOf(tileIndex(5, 9)), [5, 9]);
});

test('rectTiles is inclusive, order independent and clipped', () => {
  assert.equal(rectTiles([2, 2], [4, 3]).length, 6);
  assert.deepEqual(rectTiles([4, 3], [2, 2]), rectTiles([2, 2], [4, 3]));
  assert.equal(rectTiles([-5, -5], [1, 1]).length, 4);
  assert.equal(rectTiles([60, 60], [70, 70]).length, 16);
});

test('the shipped town is stamped into the grid', () => {
  const g = createGrid(getLayout());
  // the main street crossing the middle of town
  assert.equal(g.roadAt(32, 32), ROAD_STATIC);
  assert.equal(g.roadAt(36, 32), ROAD_STATIC);
  assert.equal(g.roadAt(32, 28), ROAD_STATIC);
  // a block pad is town ground, not open
  assert.equal(g.baseAt(26, 26), BASE.TOWN);
  assert.ok(!g.isOpen(26, 26));
  // hills at the map edge are not buildable, river is water
  assert.equal(g.baseAt(0, 0), BASE.STEEP);
  assert.equal(g.baseAt(worldToTile(52, 0)[0], 32), BASE.WATER);
  // there is real open land to zone
  let open = 0;
  for (let gz = 0; gz < GRID_N; gz++) for (let gx = 0; gx < GRID_N; gx++) if (g.isOpen(gx, gz)) open++;
  assert.ok(open > 600, 'open tiles: ' + open);
});

test('roadWithin and roadNeighbors', () => {
  const g = createGrid(getLayout());
  assert.ok(g.roadWithin(32, 31, 1));
  assert.equal(g.roadNeighbors(43, 31), 1);
  assert.ok(!g.roadWithin(2, 2, 2));
  assert.ok(g.canRoad(32, 31) === (g.baseAt(32, 31) === BASE.LAND));
});
