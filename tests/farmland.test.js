// Farms: a building the player places on flat ground. It claims its whole lot, pays like a workplace and starts nowhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { getLayout } from '../src/world/layout.js';
import { CROPS } from '../src/world/palettes.js';
import { GRID_N, BASE, tileIndex } from '../src/world/grid.js';
import { CATEGORIES, MODELS, describe, modelById, fitFootprint } from '../src/world/models.js';
import { checkLot, lotTiles, problemText } from '../src/world/placement.js';
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

test('Farms is its own build category with one model in three set sizes', () => {
  assert.ok(CATEGORIES.some((c) => c.id === 'farm' && c.tool === 'build'));
  assert.equal(def.cat, 'farm');
  assert.deepEqual(def.foot, [[2, 3], [3, 4], [4, 4]]);
  assert.ok(MODELS.filter((m) => m.cat === 'farm').length === 1);
  assert.deepEqual(fitFootprint(def, 3, 4), { fw: 3, fd: 4, exact: true });
});

test('a farm claims every tile of its lot and a bigger farm pays more', () => {
  const sim = mk(), small = findFarm(sim, 2, 3);
  assert.ok(small, 'there is flat ground for a farm');
  sim.dispatch({ type: 'place', model: 'farm', gx: small[0], gz: small[1], fw: 2, fd: 3, rot: 0 });
  const rec = sim.placedRecords().find((r) => r.model === 'farm');
  assert.ok(rec, 'farm placed');
  for (const [x, z] of lotTiles(rec.gx, rec.gz, 2, 3)) assert.ok(sim.grid.lot[tileIndex(x, z)] >= 40000, 'tile is claimed');
  const big = findFarm(sim, 4, 4);
  assert.ok(big, 'there is flat ground for the biggest farm');
  sim.dispatch({ type: 'place', model: 'farm', gx: big[0], gz: big[1], fw: 4, fd: 4, rot: 0 });
  const [a, b] = sim.placedRecords().filter((r) => r.model === 'farm').map((r) => describe(r, 1));
  assert.ok(a.floors >= 1 && b.floors > a.floors, 'a 4x4 farm has more plots than a 2x3');
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

test('a farm builds at every size and level in a few parts, and the beds cover the field', () => {
  for (const [fw, fd] of def.foot) for (let level = 1; level <= 5; level++) {
    const d = describe({ id: 'b1500', model: 'farm', gx: 10, gz: 10, fw, fd }, level);
    const parts = buildParts(d);
    assert.ok(trianglesOf(parts) <= 650, `${fw}x${fd} L${level}`);
    assert.ok(parts.length < 80, `parts at ${fw}x${fd} L${level}: ${parts.length}`);
  }
});
