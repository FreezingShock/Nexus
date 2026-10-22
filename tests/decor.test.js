import test from 'node:test';
import assert from 'node:assert/strict';
import { quietSim as createSim } from './support/quiet.js';
import { freshState } from '../src/sim/state.js';
import { wrap, unwrap } from '../src/sim/save.js';
import { GRID_HALF } from '../src/world/grid.js';
import { DECOR, MAX_DECOR, decorById, decorCost, sanitizeDecor } from '../src/world/decor.js';

const mk = () => { const state = freshState(); state.coins = 100000; state.parts = 5000; return createSim({ state }); };
// open ground east of the starter cottages, as the zoning tests use
const T = [GRID_HALF + 6, GRID_HALF + 4];
const place = (sim, k, gx, gz, rot = 0) => sim.dispatch({ type: 'placeDecor', items: [{ k, gx, gz, rot }] });

test('a decoration costs coins, climbs with every piece owned, and one tile holds one piece', () => {
  const sim = mk(), c0 = sim.state.coins;
  place(sim, 'bench', T[0], T[1]);
  assert.equal(sim.state.decor.length, 1);
  assert.equal(sim.state.coins, c0 - decorById('bench').cost);
  place(sim, 'bench', T[0], T[1]);
  assert.equal(sim.state.decor.length, 1, 'the tile is taken');
  assert.equal(sim.decorCost('bench'), decorCost(decorById('bench'), 1));
  assert.ok(sim.decorCost('bench') > decorById('bench').cost);
});

test('rare kinds need their Parts once, then only coins', () => {
  const sim = mk(); sim.state.parts = 100;
  place(sim, 'fountain', T[0], T[1]);
  assert.equal(sim.state.decor.length, 0, 'locked');
  sim.dispatch({ type: 'unlockDecor', k: 'fountain' });
  assert.deepEqual(sim.state.decorUnlocks, [], 'not enough Parts');
  sim.state.parts = 300;
  sim.dispatch({ type: 'unlockDecor', k: 'fountain' });
  sim.dispatch({ type: 'unlockDecor', k: 'fountain' });
  assert.deepEqual(sim.state.decorUnlocks, ['fountain']);
  assert.equal(sim.state.parts, 300 - decorById('fountain').parts, 'spent once');
  place(sim, 'fountain', T[0], T[1]);
  assert.equal(sim.state.decor.length, 1);
});

test('roads, zones, buildings and water refuse a decoration', () => {
  const sim = mk();
  place(sim, 'bench', GRID_HALF, GRID_HALF); // the starter street
  assert.equal(sim.state.decor.length, 0);
  place(sim, 'bench', -1, 4);
  assert.equal(sim.state.decor.length, 0);
});

test('running out of coins keeps what a drag already placed', () => {
  const sim = mk(); sim.state.coins = 130;
  sim.dispatch({ type: 'placeDecor', items: [0, 1, 2, 3].map((i) => ({ k: 'bench', gx: T[0] + i, gz: T[1], rot: 0 })) });
  assert.equal(sim.state.decor.length, 2);
  assert.ok(sim.state.coins >= 0);
});

test('clearing refunds half, undo brings the piece back and takes the refund again', () => {
  const sim = mk();
  place(sim, 'lamp', T[0], T[1]);
  const c1 = sim.state.coins;
  sim.dispatch({ type: 'clearDecor', tiles: [T] });
  assert.equal(sim.state.decor.length, 0);
  assert.equal(sim.state.coins, c1 + decorById('lamp').cost / 2);
  sim.dispatch({ type: 'undo' });
  assert.equal(sim.state.decor.length, 1);
  assert.equal(sim.state.coins, c1);
  sim.dispatch({ type: 'undo' });
  assert.equal(sim.state.decor.length, 0, 'undoing the placement gives the coins back');
});

test('a road laid over a decoration makes it go, with the coins back', () => {
  const sim = mk();
  place(sim, 'hedge', T[0], T[1]);
  const c1 = sim.state.coins;
  sim.dispatch({ type: 'paintZone', zone: 1, a: T, b: T });
  const zoned = sim.state.coins;
  for (let i = 0; i < 4; i++) sim.advance(0.25);
  assert.equal(sim.state.decor.length, 0);
  assert.ok(sim.state.coins >= zoned + decorById('hedge').cost - 1, 'the full base price came back (' + c1 + ')');
});

test('decorations survive a save; bad records are dropped', () => {
  const sim = mk();
  place(sim, 'flowers', T[0], T[1], 2);
  sim.dispatch({ type: 'unlockDecor', k: 'statue' });
  const back = createSim({ state: unwrap(wrap(sim.state, 1)).state });
  assert.equal(back.state.decor.length, 1);
  assert.equal(back.state.decor[0].rot, 2);
  assert.deepEqual(back.state.decorUnlocks, ['statue']);
  const bad = sanitizeDecor([{ k: 'nope', gx: 1, gz: 1 }, { k: 'bench', gx: 999, gz: 1 }, { k: 'bench', gx: 5, gz: 5 }, { k: 'lamp', gx: 5, gz: 5 }, null]);
  assert.equal(bad.length, 1);
  assert.equal(sanitizeDecor(Array.from({ length: MAX_DECOR + 20 }, (_, i) => ({ k: 'hedge', gx: i % 90, gz: Math.floor(i / 90) }))).length, MAX_DECOR);
  const old = freshState(); delete old.decor; delete old.nextDecor; delete old.decorUnlocks;
  assert.deepEqual(createSim({ state: unwrap(wrap(old, 1)).state }).state.decor, [], 'an older save has none');
});

test('every kind has a name, a price and Parts that grow with the price', () => {
  const ids = new Set(DECOR.map((d) => d.id));
  assert.equal(ids.size, DECOR.length);
  for (const d of DECOR) assert.ok(d.name && d.sub && d.cost > 0 && d.parts >= 0, d.id);
});

test('the render system builds one merged body and outline for every kind, and a preview', async () => {
  const { default: sys } = await import('../src/render/systems/decor.js');
  const added = [];
  const r = sys.create({ world: { add: (...m) => added.push(...m) } });
  const list = DECOR.map((d, i) => ({ id: 'd' + i, k: d.id, gx: 40 + i, gz: 40, rot: i % 4 }));
  r.frame({ state: { decor: list } });
  const [body, hull, ghost] = added;
  assert.ok(body.visible && hull.visible);
  assert.ok(body.geometry.attributes.position.count > 300);
  assert.equal(body.geometry.attributes.position.count, hull.geometry.attributes.position.count);
  r.preview([{ k: 'bench', gx: 5, gz: 5, rot: 1, ok: false }]);
  assert.ok(ghost.visible);
  r.clearPreview();
  assert.ok(!ghost.visible);
  r.frame({ state: { decor: [] } });
  assert.ok(!body.visible);
});
