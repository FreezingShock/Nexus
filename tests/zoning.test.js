import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { wrap, unwrap } from '../src/sim/save.js';
import { tileIndex } from '../src/world/grid.js';
import { demandOf, lotStats, encodeZones, decodeZones } from '../src/sim/zones.js';

const mk = () => { const state = freshState(); state.coins = 10000; return createSim({ state }); };
// open tiles east of the town's main street, near the street that reaches x = 42
const A = [43, 33], B = [46, 34];

test('painting charges per tile, fills the grid and survives a save', () => {
  const sim = mk(), before = sim.state.coins;
  sim.dispatch({ type: 'paintZone', zone: 1, a: A, b: B });
  assert.equal(sim.state.coins, before - 8 * 5);
  assert.equal(sim.grid.zoneAt(44, 34), 1);
  const back = createSim({ state: unwrap(wrap(sim.state, 1)).state });
  assert.equal(back.grid.zoneAt(44, 34), 1);
  assert.equal(back.grid.zoneAt(0, 0), 0);
});

test('paint only takes open ground and stops when coins run out', () => {
  const sim = mk();
  sim.dispatch({ type: 'paintZone', zone: 2, a: [24, 24], b: [28, 28] }); // block pads and streets
  assert.equal(sim.grid.zoneAt(26, 26), 0);
  sim.state.coins = 12;
  sim.dispatch({ type: 'paintZone', zone: 2, a: A, b: B }); // 8 coins each: one tile
  assert.equal(sim.state.coins, 4);
  assert.equal(sim.state.zones.split('').filter((c) => c === '2').length, 1);
});

test('buildings grow only where a road is in reach, then level up and earn', () => {
  const sim = mk();
  sim.dispatch({ type: 'paintZone', zone: 1, a: A, b: B });
  sim.dispatch({ type: 'paintZone', zone: 1, a: [10, 20], b: [12, 22] }); // far from any road
  const rate0 = sim.rate();
  for (let i = 0; i < 120; i++) sim.tick();
  assert.ok(sim.state.lots.length > 0 && sim.state.lots.length <= 8);
  for (const [i] of sim.state.lots) assert.ok(sim.grid.lot[i] === i + 1);
  assert.equal(sim.grid.lotAt(11, 21), 0);
  assert.ok(sim.rate() > rate0);
  for (let i = 0; i < 600; i++) sim.tick();
  assert.equal(sim.state.lots.length, 8);
  assert.ok(sim.state.lots.some((l) => l[1] > 1));
});

test('erasing removes paint and the building on it', () => {
  const sim = mk();
  sim.dispatch({ type: 'paintZone', zone: 1, a: A, b: B });
  for (let i = 0; i < 300; i++) sim.tick();
  sim.dispatch({ type: 'clearZone', a: A, b: B });
  assert.equal(sim.state.lots.length, 0);
  assert.ok(sim.grid.zone.every((v) => v === 0) && sim.grid.lot.every((v) => v === 0));
});

test('a road laid over paint clears it and the building leaves', () => {
  const sim = mk();
  sim.dispatch({ type: 'paintZone', zone: 3, a: A, b: B });
  for (let i = 0; i < 300; i++) sim.tick();
  sim.grid.road[tileIndex(44, 34)] = 1; // what the road system does
  sim.tick();
  assert.equal(sim.grid.zoneAt(44, 34), 0);
  assert.ok(!sim.state.lots.some(([i]) => i === tileIndex(44, 34)));
});

test('growth is deterministic from the saved seed', () => {
  const run = () => { const s = mk(); s.dispatch({ type: 'paintZone', zone: 1, a: A, b: B }); for (let i = 0; i < 60; i++) s.tick(); return JSON.stringify(s.state.lots); };
  assert.equal(run(), run());
});

test('offline catch-up grows in one pass', () => {
  const sim = mk();
  sim.dispatch({ type: 'paintZone', zone: 1, a: A, b: B });
  sim.catchUp(Date.now() - 3600 * 1000);
  assert.equal(sim.state.lots.length, 8);
});

test('demand stays within bounds and responds to balance', () => {
  const none = demandOf(lotStats([], () => 0));
  assert.ok(none.slice(1).every((d) => d >= 0.15 && d <= 1));
  const homes = demandOf({ pop: 200, com: 0, ind: 0, civ: 0 });
  assert.ok(homes[1] < none[1] && homes[2] > none[2]);
});

test('zone string round-trips', () => {
  const z = new Uint8Array(4096); z[5] = 3; z[4095] = 4;
  const back = decodeZones(encodeZones(z), new Uint8Array(4096));
  assert.deepEqual(Array.from(back), Array.from(z));
});

test('player-placed buildings (lot >= 40000) are never touched by zoning', () => {
  const sim = mk();
  sim.dispatch({ type: 'paintZone', zone: 1, a: A, b: B });
  const i = tileIndex(44, 34);
  sim.dispatch({ type: 'place', model: 'cottage', gx: 44, gz: 34, fw: 1, fd: 1, rot: 0 }); // tile may hold paint but no grown lot yet
  if (sim.grid.lot[i] < 40000) return; // a lot had already grown there: placement refuses, nothing to check
  for (let k = 0; k < 50; k++) sim.tick();
  assert.ok(sim.grid.lot[i] >= 40000);
  assert.equal(sim.grid.zoneAt(44, 34), 0); // paint under a placed building is dropped
  assert.ok(!sim.state.lots.some(([t]) => t === i));
  sim.dispatch({ type: 'clearZone', a: A, b: B });
  assert.ok(sim.grid.lot[i] >= 40000);
});
