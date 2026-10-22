import test from 'node:test';
import assert from 'node:assert/strict';
import { getLayout } from '../src/world/layout.js';
import { GRID_N, TILE, BASE, createGrid, tileCenter, worldToTile, snapToTile, rectTiles, inBounds, tileIndex, tileOf } from '../src/world/grid.js';
import { createSim } from '../src/sim/sim.js';
import { starterPlaced, starterStreetTiles, TUNNEL_GATE } from '../src/world/starter.js';
import { lotTiles } from '../src/world/placement.js';

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

test('the starter village is plain ground: no town pads, and the grid leaves its streets to the road system', () => {
  const g = createGrid(getLayout());
  assert.ok(g.road.every((v) => v === 0), 'roads come from state.roads, not from the layout');
  // streets are land, except the bridge over the river, which is water under its road
  for (const [gx, gz] of starterStreetTiles()) assert.ok([BASE.LAND, BASE.WATER].includes(g.baseAt(gx, gz)), `${gx},${gz}`);
  assert.equal(g.baseAt(TUNNEL_GATE.gx, TUNNEL_GATE.gz), BASE.LAND, 'the tunnel gate is level ground');
  for (const r of starterPlaced()) for (const [x, z] of lotTiles(r.gx, r.gz, r.fw, r.fd)) assert.equal(g.baseAt(x, z), BASE.LAND);
  // hills at the map edge are not buildable, river is water
  assert.equal(g.baseAt(0, 0), BASE.STEEP);
  assert.equal(g.baseAt(worldToTile(52, 0)[0], 32), BASE.WATER);
  // there is real open land to zone
  let open = 0;
  for (let gz = 0; gz < GRID_N; gz++) for (let gx = 0; gx < GRID_N; gx++) if (g.isOpen(gx, gz)) open++;
  assert.ok(open > 600, 'open tiles: ' + open);
});

test('roadWithin and roadNeighbors', () => {
  const g = createSim({ layout: getLayout() }).grid; // the starter streets are on the grid
  assert.ok(g.roadWithin(32, 31, 1));
  assert.equal(g.roadNeighbors(38, 31), 1);
  assert.ok(!g.roadWithin(2, 2, 2));
  assert.ok(g.canRoad(32, 31) === (g.baseAt(32, 31) === BASE.LAND));
});
