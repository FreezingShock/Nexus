import test from 'node:test';
import assert from 'node:assert/strict';
import { quietSim as createSim } from './support/quiet.js';
import { freshState } from '../src/sim/state.js';
import { wrap, unwrap } from '../src/sim/save.js';
import { GRID_N, GRID_HALF, tileIndex } from '../src/world/grid.js';
import { LOT_BASE } from '../src/world/placement.js';
import { ZONE_DEFS, demandOf, lotStats, encodeZones, decodeZones } from '../src/sim/zones.js';

const mk = (opts = {}) => { const state = freshState(); state.coins = 10000; return createSim({ state, ...opts }); };
// open tiles south of the stem, east of the cottages, all next to the road
const A = [GRID_HALF + 5, GRID_HALF + 1], B = [GRID_HALF + 8, GRID_HALF + 6];
const T = [GRID_HALF + 6, GRID_HALF + 2], P = [GRID_HALF + 5, GRID_HALF + 2];   // one tile to check by hand, and one to place a building on
const AREA = (B[0] - A[0] + 1) * (B[1] - A[1] + 1);
// Buildings grow only on tiles with a road directly beside them. This strip is the row just south of the stem street.
// Some of its tiles are taken (houses, water), so paintStrip returns how many took paint: that is how many can grow.
const S1 = [GRID_HALF + 3, GRID_HALF + 1], S2 = [GRID_HALF + 10, GRID_HALF + 1];
function paintStrip(sim) {
  sim.dispatch({ type: 'paintZone', zone: 1, a: S1, b: S2 });
  let n = 0;
  for (let gx = S1[0]; gx <= S2[0]; gx++) if (sim.grid.zoneAt(gx, S1[1]) === 1) n++;
  assert.ok(n >= 4, 'the strip has room: ' + n);
  return n;
}

test('painting charges per tile, fills the grid and survives a save', () => {
  const sim = mk(), before = sim.state.coins;
  const takes = [];
  for (let gz = A[1]; gz <= B[1]; gz++) for (let gx = A[0]; gx <= B[0]; gx++) if (sim.grid.isOpen(gx, gz) && sim.grid.roadBeside(gx, gz)) takes.push([gx, gz]);
  assert.ok(takes.length > 0 && takes.length < AREA, 'the rectangle holds tiles beside the street and tiles away from it');
  sim.dispatch({ type: 'paintZone', zone: 1, a: A, b: B });
  assert.equal(sim.state.coins, before - ZONE_DEFS[1].cost * takes.length, 'only tiles that can grow are charged');
  assert.equal(sim.grid.zoneAt(...takes[0]), 1);
  assert.equal(sim.grid.zoneAt(...T), 0, 'a tile with no road beside it is left out');
  const back = createSim({ state: unwrap(wrap(sim.state, 1)).state });
  assert.equal(back.grid.zoneAt(...takes[0]), 1);
  assert.equal(back.grid.zoneAt(0, 0), 0);
});

test('paint only takes open ground and stops when coins run out', () => {
  const sim = mk();
  sim.dispatch({ type: 'paintZone', zone: 2, a: [30, 30], b: [33, 33] }); // the bar and the starter houses beside it
  assert.equal(sim.grid.zoneAt(GRID_HALF, GRID_HALF - 1), 0);
  assert.equal(sim.grid.zoneAt(GRID_HALF - 1, GRID_HALF - 2), 0);
  const painted = () => sim.state.zones.split('').filter((c) => c === '2').length;
  const before = painted();
  sim.state.coins = 36;
  sim.dispatch({ type: 'paintZone', zone: 2, a: S1, b: S2 }); // 24 coins each: one tile
  assert.equal(sim.state.coins, 12);
  assert.equal(painted(), before + 1);
});

test('buildings grow only beside a road, then level up and earn', () => {
  const sim = mk();
  const STRIP = paintStrip(sim);
  sim.dispatch({ type: 'paintZone', zone: 1, a: [GRID_HALF - 22, GRID_HALF - 12], b: [GRID_HALF - 20, GRID_HALF - 10] }); // far from any road
  const rate0 = sim.rate();
  for (let i = 0; i < 120; i++) sim.tick();
  assert.ok(sim.state.lots.length > 0 && sim.state.lots.length <= AREA);
  for (const [i] of sim.state.lots) assert.ok(sim.grid.lot[i] === i + 1);
  assert.equal(sim.grid.lotAt(GRID_HALF - 21, GRID_HALF - 11), 0);
  assert.ok(sim.rate() > rate0);
  for (let i = 0; i < 600; i++) sim.tick();
  assert.ok(sim.state.lots.length >= STRIP - 2);
  assert.ok(sim.state.lots.some((l) => l[1] > 1));
});

test('erasing removes paint and the building on it', () => {
  const sim = mk();
  sim.dispatch({ type: 'paintZone', zone: 1, a: A, b: B });
  for (let i = 0; i < 300; i++) sim.tick();
  sim.dispatch({ type: 'clearZone', a: A, b: B });
  assert.equal(sim.state.lots.length, 0);
  // the starter town's buildings keep their lots (placed records, LOT_BASE and up); the grown ones are gone
  assert.ok(sim.grid.zone.every((v) => v === 0) && sim.grid.lot.every((v) => v === 0 || v >= LOT_BASE));
});

test('a road laid over paint clears it and the building leaves', () => {
  const sim = mk();
  sim.dispatch({ type: 'paintZone', zone: 3, a: A, b: B });
  for (let i = 0; i < 300; i++) sim.tick();
  sim.grid.road[tileIndex(...T)] = 1; // what the road system does
  sim.tick();
  assert.equal(sim.grid.zoneAt(...T), 0);
  assert.ok(!sim.state.lots.some(([i]) => i === tileIndex(...T)));
});

test('growth is deterministic from the saved seed', () => {
  const run = () => { const s = mk(); s.dispatch({ type: 'paintZone', zone: 1, a: A, b: B }); for (let i = 0; i < 60; i++) s.tick(); return JSON.stringify(s.state.lots); };
  assert.equal(run(), run());
});

test('offline catch-up grows in one pass', () => {
  // fixed clock: the catch-up must not depend on how long the test run takes
  const NOW = 1_800_000_000_000;
  const sim = mk({ now: () => NOW });
  const STRIP = paintStrip(sim);
  sim.catchUp(NOW - 3600 * 1000);
  assert.equal(sim.state.lots.length, STRIP);
});

// Painted tiles with no road directly beside them: two tiles from the street, and diagonal to its end.
function awayTiles(sim) {
  const g = sim.grid, out = { two: [], diagonal: [] };
  for (let gz = 1; gz < GRID_N - 1; gz++) for (let gx = 1; gx < GRID_N - 1; gx++) {
    if (!g.isOpen(gx, gz) || g.roadBeside(gx, gz)) continue;
    if (g.roadWithin(gx, gz, 1)) out.diagonal.push([gx, gz]);
    else if (g.roadWithin(gx, gz, 2)) out.two.push([gx, gz]);
  }
  return out;
}

test('paint away from a street is left out and not charged', () => {
  const sim = mk();
  const away = awayTiles(sim);
  assert.ok(away.two.length > 0 && away.diagonal.length > 0, 'the starter town has both kinds of tile');
  const tiles = [...away.two.slice(0, 6), ...away.diagonal.slice(0, 3)], before = sim.state.coins;
  for (const [gx, gz] of tiles) sim.dispatch({ type: 'paintZone', zone: 1, a: [gx, gz], b: [gx, gz] });
  assert.equal(sim.state.coins, before, 'nothing charged');
  for (const [gx, gz] of tiles) assert.equal(sim.grid.zoneAt(gx, gz), 0, 'not painted');
});

test('a dragged rectangle paints only the tiles beside a road', () => {
  const NOW = 1_800_000_000_000;
  const sim = mk({ now: () => NOW });
  const STRIP = paintStrip(sim); // paintStrip's strip sits beside the street
  const sealed = [GRID_HALF + 3, GRID_HALF + 4]; // the second row away from the street, under the strip
  sim.dispatch({ type: 'paintZone', zone: 1, a: sealed, b: [GRID_HALF + 10, GRID_HALF + 4] });
  for (let gx = sealed[0]; gx <= GRID_HALF + 10; gx++) assert.equal(sim.grid.zoneAt(gx, sealed[1]), 0);
  for (let i = 0; i < 600; i++) sim.tick();
  assert.equal(sim.state.lots.length, STRIP, 'only the strip beside the street grew');
});

test('a road drawn beside open ground lets paint take there', () => {
  const sim = mk();
  const [gx, gz] = awayTiles(sim).two[0];
  sim.dispatch({ type: 'paintZone', zone: 1, a: [gx, gz], b: [gx, gz] });
  assert.equal(sim.grid.zoneAt(gx, gz), 0);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { // whichever neighbor is open ground becomes road
    if (sim.grid.isOpen(gx + dx, gz + dz)) { sim.grid.road[tileIndex(gx + dx, gz + dz)] = 1; break; }
  }
  assert.ok(sim.grid.roadBeside(gx, gz), 'the new road touches the tile');
  sim.dispatch({ type: 'paintZone', zone: 1, a: [gx, gz], b: [gx, gz] });
  assert.equal(sim.grid.zoneAt(gx, gz), 1);
  for (let i = 0; i < 200 && !sim.grid.lotAt(gx, gz); i++) sim.tick();
  assert.ok(sim.grid.lotAt(gx, gz) > 0, 'now it grows');
});

test('a building that already grew stays when its street goes', () => {
  const sim = mk();
  const STRIP = paintStrip(sim);
  for (let i = 0; i < 400 && sim.state.lots.length < STRIP; i++) sim.tick();
  const before = sim.state.lots.map((l) => l[0]).sort((a, b) => a - b);
  assert.ok(before.length > 0);
  for (let gx = S1[0] - 1; gx <= S2[0] + 1; gx++) sim.grid.road[tileIndex(gx, GRID_HALF)] = 0; // the street is gone
  for (let i = 0; i < 60; i++) sim.tick();
  const after = sim.state.lots.map((l) => l[0]).sort((a, b) => a - b);
  assert.deepEqual(after, before, 'no lot was demolished, and none grew in the freed tiles');
});

test('the paint toast says tiles away from a street were left out', () => {
  const sim = mk();
  const [gx, gz] = awayTiles(sim).two[0];
  const text = [], toasts = [];
  sim.subscribe((e) => { if (e.type === 'zonePainted') text.push(e.text); if (e.type === 'toast') toasts.push(e.text); });
  sim.dispatch({ type: 'paintZone', zone: 1, a: [gx, gz], b: [gx, gz] });
  assert.deepEqual(toasts, ['Zones need a road right beside them'], 'nothing to paint: a plain toast');
  sim.dispatch({ type: 'paintZone', zone: 1, a: S1, b: [S1[0] + 1, S1[1] + 2] });
  assert.match(text[0], /left out, no road beside/, 'a mixed drag says how many tiles were left out');
  sim.dispatch({ type: 'paintZone', zone: 1, a: [S1[0] + 4, S1[1]], b: [S1[0] + 4, S1[1]] });
  assert.doesNotMatch(text[1], /left out/, 'a tile beside the street gets no warning');
});

test('demand stays within bounds and responds to balance', () => {
  const none = demandOf(lotStats([], () => 0));
  assert.ok(none.slice(1).every((d) => d >= 0.15 && d <= 1));
  const homes = demandOf({ pop: 200, com: 0, ind: 0, civ: 0 });
  assert.ok(homes[1] < none[1] && homes[2] > none[2]);
});

test('zone string round-trips', () => {
  const area = GRID_N * GRID_N;
  const z = new Uint8Array(area); z[5] = 3; z[area - 1] = 4;
  const back = decodeZones(encodeZones(z), new Uint8Array(area));
  assert.deepEqual(Array.from(back), Array.from(z));
});

test('player-placed buildings (lot >= 40000) are never touched by zoning', () => {
  const sim = mk();
  sim.dispatch({ type: 'paintZone', zone: 1, a: A, b: B });
  sim.dispatch({ type: 'place', model: 'cottage', gx: P[0], gz: P[1], fw: 1, fd: 1, rot: 0 }); // tile may hold paint but no grown lot yet
  const i = tileIndex(...P);
  if (sim.grid.lot[i] < 40000) return; // a lot had already grown there: placement refuses, nothing to check
  for (let k = 0; k < 50; k++) sim.tick();
  assert.ok(sim.grid.lot[i] >= 40000);
  assert.equal(sim.grid.zoneAt(...P), 0); // paint under a placed building is dropped
  assert.ok(!sim.state.lots.some(([t]) => t === i));
  sim.dispatch({ type: 'clearZone', a: A, b: B });
  assert.ok(sim.grid.lot[i] >= 40000);
});

test('every model a zone can grow builds at every level within the triangle cap', async () => {
  const { lotDescription, ZONE_MODELS } = await import('../src/world/lots.js');
  const { buildParts, trianglesOf } = await import('../src/render/models/builders.js');
  for (let z = 1; z <= 4; z++) for (const id of new Set(ZONE_MODELS[z])) {
    const seed = ZONE_MODELS[z].indexOf(id);
    for (let level = 1; level <= 5; level++) {
      const d = lotDescription(z, level, seed, tileIndex(GRID_HALF + 12, GRID_HALF + 2), (gx, gz) => gz === GRID_HALF);
      assert.equal(d.model, id);
      const tris = trianglesOf(buildParts(d));
      assert.ok(tris > 0 && tris <= 650, id + ' level ' + level + ': ' + tris + ' triangles');
    }
  }
});
