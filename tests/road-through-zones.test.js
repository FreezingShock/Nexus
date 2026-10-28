// Roads go through grown houses (clearing them), placed buildings still block, and paint that loses its road fades.
// One undo puts everything back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { quietSim as createSim } from './support/quiet.js';
import { freshState } from '../src/sim/state.js';
import { GRID_HALF, tileIndex } from '../src/world/grid.js';
import { roadBlock } from '../src/world/roadnet.js';
import { clearedBy, strandedAfter, wakenedBy } from '../src/world/road-zones.js';
import { ZONE_DEFS } from '../src/sim/zones.js';

const mk = () => { const state = freshState(); state.coins = 100000; return createSim({ state }); };
// the row just south of the stem street, as zoning.test.js uses it
const S1 = [GRID_HALF + 3, GRID_HALF + 1], S2 = [GRID_HALF + 10, GRID_HALF + 1];
function grownRow(sim) {
  sim.dispatch({ type: 'paintZone', zone: 1, a: S1, b: S2 });
  for (let i = 0; i < 800 && sim.state.lots.length < 3; i++) sim.tick();
  assert.ok(sim.state.lots.length >= 3, 'houses grew: ' + sim.state.lots.length);
  return sim.state.lots.map(([i]) => i);
}

test('a grown house no longer blocks a road, a placed building still does', () => {
  const sim = mk();
  const [i] = grownRow(sim), gx = i % 96, gz = Math.floor(i / 96);
  assert.equal(roadBlock(sim.grid, sim.layout, sim.state, gx, gz), null);
  sim.grid.lot[tileIndex(gx + 20, gz + 20)] = 40001;
  assert.equal(roadBlock(sim.grid, sim.layout, sim.state, gx + 20, gz + 20), 'lot');
});

test('drawing a road through grown houses clears them and the paint, and one undo brings them back', () => {
  const sim = mk();
  const lots = grownRow(sim), before = JSON.stringify(sim.state.lots), zones = sim.state.zones;
  const [gx, gz] = [lots[0] % 96, Math.floor(lots[0] / 96)];
  const path = [[gx, gz], [gx, gz + 1]];
  assert.ok(clearedBy(sim.grid, path.map(([x, z]) => tileIndex(x, z))).houses.includes(lots[0]), 'the preview names the house');
  sim.dispatch({ type: 'drawRoad', roadType: 'two', path });
  assert.ok(sim.state.roads[tileIndex(gx, gz)], 'the road is there');
  assert.ok(!sim.state.lots.some(([i]) => i === lots[0]), 'the house is gone');
  assert.equal(sim.grid.lotAt(gx, gz), 0);
  assert.equal(sim.grid.zoneAt(gx, gz), 0);
  sim.dispatch({ type: 'undoRoad' });
  assert.ok(!sim.state.roads[tileIndex(gx, gz)], 'the road is gone');
  assert.ok(sim.state.lots.some(([i]) => i === lots[0]), 'the house is back');
  assert.equal(sim.grid.lotAt(gx, gz), lots[0] + 1);
  assert.equal(sim.state.zones, zones, 'and so is its paint');
  assert.equal(JSON.stringify(sim.state.lots.slice().sort((a, b) => a[0] - b[0])), JSON.stringify(JSON.parse(before).sort((a, b) => a[0] - b[0])));
});

test('bulldozing a street fades the empty paint that leaned on it, refunds it, and undo restores it', () => {
  const sim = mk();
  // a lone painted tile whose only road is a street of our own
  const gx = 30, gz = 30;
  for (const [x, z] of [[gx, gz], [gx, gz - 1], [gx + 1, gz]]) sim.grid.road[tileIndex(x, z)] = 0;
  sim.dispatch({ type: 'drawRoad', roadType: 'two', path: [[gx + 1, gz - 3], [gx + 1, gz - 2], [gx + 1, gz - 1], [gx + 1, gz], [gx + 1, gz + 1]] });
  assert.ok(sim.state.roads[tileIndex(gx + 1, gz)], 'a street was drawn');
  sim.dispatch({ type: 'paintZone', zone: 1, a: [gx, gz], b: [gx, gz] });
  assert.equal(sim.grid.zoneAt(gx, gz), 1, 'painted beside it');
  const c0 = sim.state.coins;
  const run = [[gx + 1, gz - 3], [gx + 1, gz - 2], [gx + 1, gz - 1], [gx + 1, gz], [gx + 1, gz + 1]];
  assert.deepEqual(strandedAfter(sim.grid, run.map(([x, z]) => tileIndex(x, z))), [tileIndex(gx, gz)]);
  let faded = null;
  sim.subscribe((e) => { if (e.type === 'zoneFaded') faded = e.tiles; });
  sim.dispatch({ type: 'bulldozeRoad', tiles: run });
  assert.equal(sim.grid.zoneAt(gx, gz), 0, 'the paint faded');
  assert.deepEqual(faded, [[gx, gz]]);
  assert.ok(sim.state.coins >= c0 + ZONE_DEFS[1].cost, 'its paint cost came back');
  sim.dispatch({ type: 'undoRoad' });
  assert.equal(sim.grid.zoneAt(gx, gz), 1, 'undo puts the paint back');
  assert.equal(sim.state.coins, c0);
});

test('paint beside a new road is named as waking up, once the road is there it is not', () => {
  const sim = mk();
  const gx = 40, gz = 40;
  sim.grid.road[tileIndex(gx + 1, gz)] = 1; // paint needs a road beside it
  sim.dispatch({ type: 'paintZone', zone: 2, a: [gx, gz], b: [gx, gz] });
  assert.equal(sim.grid.zoneAt(gx, gz), 2);
  sim.grid.road[tileIndex(gx + 1, gz)] = 0;
  assert.deepEqual(wakenedBy(sim.grid, [tileIndex(gx - 1, gz)]), [tileIndex(gx, gz)]);
  sim.grid.road[tileIndex(gx + 1, gz)] = 1;
  assert.deepEqual(wakenedBy(sim.grid, [tileIndex(gx - 1, gz)]), []);
});
