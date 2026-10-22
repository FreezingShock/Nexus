// Farms: a building the player places on flat ground. It claims its whole lot, pays like a workplace and starts nowhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { getLayout } from '../src/world/layout.js';
import { CROPS } from '../src/world/palettes.js';
import { GRID_N, BASE, tileIndex } from '../src/world/grid.js';
import { CATEGORIES, MODELS, describe, modelById, fitFootprint } from '../src/world/models.js';
import { checkLot, lotTiles, planPlacement, problemText } from '../src/world/placement.js';
import { wrap, unwrap } from '../src/sim/save.js';
import { buildParts, trianglesOf } from '../src/render/models/builders.js';

const layout = getLayout();
const mk = () => { const state = freshState(); state.coins = 1e7; return createSim({ state, layout }); };
const def = modelById('farm');

// The first spot (row by row) where a fw x fd farm passes every rule, or null.
function findFarm(sim, fw, fd) {
  for (let gz = 2; gz < GRID_N - 2; gz++) for (let gx = 2; gx < GRID_N - 2; gx++) if (checkLot(sim.grid, gx, gz, fw, fd, def).ok) return [gx, gz];
  return null;
}

test('no farmland at spawn: the town starts with no field and no farm', () => {
  const sim = mk();
  assert.equal(layout.farms, undefined);
  assert.equal(sim.placedRecords().filter((r) => r.model === 'farm').length, 0);
  for (let i = 0; i < GRID_N * GRID_N; i++) assert.notEqual(sim.grid.base[i], BASE.FARM);
});

test('Farms is its own build category, and a farm has no fixed sizes: any lot from 2 x 3 up to 24 a side', () => {
  assert.ok(CATEGORIES.some((c) => c.id === 'farm' && c.tool === 'build'));
  assert.equal(def.cat, 'farm');
  assert.ok(def.free);
  assert.ok(MODELS.filter((m) => m.cat === 'farm').length === 1);
  for (const [fw, fd] of [[2, 3], [3, 2], [5, 9], [12, 12], [24, 24]]) assert.deepEqual(fitFootprint(def, fw, fd), { fw, fd, exact: true }, fw + 'x' + fd);
  for (const [fw, fd] of [[1, 5], [2, 2], [25, 4], [1, 1]]) assert.equal(fitFootprint(def, fw, fd), null, fw + 'x' + fd);
});

test('a farm is turned so its house has depth, whatever turn was asked for', () => {
  for (let rot = 0; rot < 4; rot++) {
    const plan = planPlacement({ model: 'farm', gx: 10, gz: 10, fw: 3, fd: 2, rot });
    const d = describe({ id: 'b1500', model: 'farm', gx: 10, gz: 10, fw: 3, fd: 2, rot: plan.rot }, 1);
    assert.ok(d.cd >= 3, `turn ${rot} gives depth ${d.cd}`);
  }
});

test('a farm claims every tile of its lot and a bigger farm pays more', () => {
  const sim = mk(), small = findFarm(sim, 2, 3);
  assert.ok(small, 'there is flat ground for a farm');
  sim.dispatch({ type: 'place', model: 'farm', gx: small[0], gz: small[1], fw: 2, fd: 3, rot: 0 });
  const rec = sim.placedRecords().find((r) => r.model === 'farm');
  assert.ok(rec, 'farm placed');
  for (const [x, z] of lotTiles(rec.gx, rec.gz, 2, 3)) assert.ok(sim.grid.lot[tileIndex(x, z)] >= 40000, 'tile is claimed');
  const big = findFarm(sim, 8, 6);
  assert.ok(big, 'there is flat ground for an 8 x 6 farm');
  sim.dispatch({ type: 'place', model: 'farm', gx: big[0], gz: big[1], fw: 8, fd: 6, rot: 0 });
  const [a, b] = sim.placedRecords().filter((r) => r.model === 'farm').map((r) => describe(r, 1));
  assert.ok(a.floors >= 1 && b.floors > a.floors * 4, 'an 8x6 farm earns in proportion to its area');
});

test('a farm earns coins like any building', () => {
  const sim = mk(), at = findFarm(sim, 3, 4), r0 = sim.rate();
  sim.dispatch({ type: 'place', model: 'farm', gx: at[0], gz: at[1], fw: 3, fd: 4, rot: 0 });
  assert.ok(sim.rate() > r0, 'income went up: ' + r0 + ' to ' + sim.rate());
});

test('a farm needs flat ground: slopes are turned away with a reason', () => {
  const sim = mk();
  let sloped = null;
  for (let gz = 2; gz < GRID_N - 2 && !sloped; gz++) for (let gx = 2; gx < GRID_N - 2 && !sloped; gx++) {
    const plain = checkLot(sim.grid, gx, gz, 2, 3);                       // open for any other building
    if (plain.ok && !checkLot(sim.grid, gx, gz, 2, 3, def).ok) sloped = [gx, gz];
  }
  assert.ok(sloped, 'some open ground is too sloped for a farm');
  const r = checkLot(sim.grid, sloped[0], sloped[1], 2, 3, def);
  assert.equal(r.problem, 'slope');
  assert.ok(problemText('slope').length > 0);
  const c0 = sim.state.coins;
  sim.dispatch({ type: 'place', model: 'farm', gx: sloped[0], gz: sloped[1], fw: 2, fd: 3, rot: 0 });
  assert.equal(sim.placedRecords().filter((x) => x.model === 'farm').length, 0, 'nothing was built');
  assert.equal(sim.state.coins, c0, 'and nothing was charged');
});

test('crop colours are valid hex pairs the farm builder can read', () => {
  for (const c of CROPS) {
    assert.match(c.base, /^#[0-9A-F]{6}$/i);
    assert.match(c.row, /^#[0-9A-F]{6}$/i);
    assert.notEqual(c.base, c.row);
  }
});

test('a farm builds at any size: the front stays put and the rows repeat, within a triangle budget that grows with the area', () => {
  const tris = (fw, fd, level) => trianglesOf(buildParts(describe({ id: 'b1500', model: 'farm', gx: 10, gz: 10, fw, fd }, level)));
  for (const [fw, fd] of [[2, 3], [3, 4], [4, 4]]) for (let level = 1; level <= 5; level++) assert.ok(tris(fw, fd, level) <= 650, `${fw}x${fd} L${level}`);
  for (const [fw, fd] of [[8, 6], [12, 12], [24, 24]]) for (const level of [1, 5]) assert.ok(tris(fw, fd, level) <= 400 + 8 * fw * fd, `${fw}x${fd} L${level}: ${tris(fw, fd, level)}`);
  assert.ok(tris(12, 12, 1) > tris(4, 4, 1), 'a bigger lot makes more rows');
  const small = buildParts(describe({ id: 'b1500', model: 'farm', gx: 10, gz: 10, fw: 4, fd: 4 }, 1)), big = buildParts(describe({ id: 'b1500', model: 'farm', gx: 10, gz: 10, fw: 24, fd: 24 }, 1));
  assert.ok(big.length <= small.length + 4, 'parts stay few: the beds are merged per colour');
});

test('a big farm saves and reloads whole, pays by area, and undo takes it back', () => {
  const sim = mk(), at = findFarm(sim, 9, 7), c0 = sim.state.coins, r0 = sim.rate();
  assert.ok(at, 'room for a 9 x 7 farm');
  sim.dispatch({ type: 'place', model: 'farm', gx: at[0], gz: at[1], fw: 9, fd: 7, rot: 0 });
  const rec = sim.placedRecords().find((r) => r.model === 'farm');
  assert.deepEqual([rec.fw, rec.fd], [9, 7]);
  const earn = sim.rate() - r0;
  assert.ok(earn > 63 * 0.45 * 0.9 && earn < 63 * 0.45 * 1.3, 'about 0.45 coins/s a tile: ' + earn);
  const back = createSim({ state: unwrap(wrap(sim.state, 1)).state, layout });
  const again = back.placedRecords().find((r) => r.model === 'farm');
  assert.ok(again && again.fw === 9 && again.fd === 7, 'the farm is still 9 x 7 after a reload');
  assert.equal(back.rate(), sim.rate());
  sim.dispatch({ type: 'undo' });
  assert.equal(sim.placedRecords().filter((r) => r.model === 'farm').length, 0);
  assert.equal(sim.state.coins, c0, 'undo refunds it');
});
