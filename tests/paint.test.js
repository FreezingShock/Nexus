import test from 'node:test';
import assert from 'node:assert/strict';
import { quietSim as createSim } from './support/quiet.js';
import { freshState } from '../src/sim/state.js';
import { wrap, unwrap } from '../src/sim/save.js';
import { GRID_HALF } from '../src/world/grid.js';
import { ROOF_PARTS, WALL_PARTS, roofCost, wallCost } from '../src/world/paint.js';
import { PAL, ROOFS } from '../src/world/palettes.js';
import { describe } from '../src/world/models.js';

const mk = () => { const state = freshState(); state.coins = 100000; state.parts = 5000; return createSim({ state }); };
const build = (sim) => {
  sim.dispatch({ type: 'place', model: 'cottage', gx: GRID_HALF + 6, gz: GRID_HALF + 4, fw: 1, fd: 1, rot: 0 });
  return sim.state.placed[sim.state.placed.length - 1];
};

test('every paint key has a palette or roof behind it', () => {
  for (const k of Object.keys(WALL_PARTS)) assert.ok(PAL[k], k);
  for (const k of Object.keys(ROOF_PARTS)) assert.ok(ROOFS[k], k);
});

test('repainting walls and roof costs coins by footprint and shows in the description', () => {
  const sim = mk(), rec = build(sim), c0 = sim.state.coins;
  sim.dispatch({ type: 'paintBuilding', id: rec.id, wall: 'butter', roof: 'slate' });
  assert.equal(rec.pal, 'butter');
  assert.equal(rec.roof, 'slate');
  assert.equal(sim.state.coins, c0 - wallCost(rec) - roofCost(rec));
  assert.equal(sim.building(rec.id).pal, 'butter', 'the cached description follows the repaint');
  assert.equal(describe(rec, 1).roof, 'slate');
  const c1 = sim.state.coins;
  sim.dispatch({ type: 'paintBuilding', id: rec.id, wall: 'butter' });
  assert.equal(sim.state.coins, c1, 'the colour it already wears is free and does nothing');
});

test('newer colours need their Parts once; undo gives the coins back', () => {
  const sim = mk(), rec = build(sim); sim.state.parts = 10;
  const before = rec.pal;
  sim.dispatch({ type: 'paintBuilding', id: rec.id, wall: 'sage' });
  assert.equal(rec.pal, before, 'locked');
  sim.dispatch({ type: 'unlockPaint', kind: 'wall', key: 'sage' });
  assert.deepEqual(sim.state.paintUnlocks, []);
  sim.state.parts = 100;
  sim.dispatch({ type: 'unlockPaint', kind: 'wall', key: 'sage' });
  sim.dispatch({ type: 'unlockPaint', kind: 'wall', key: 'sage' });
  assert.equal(sim.state.parts, 40, 'spent once');
  const c0 = sim.state.coins;
  sim.dispatch({ type: 'paintBuilding', id: rec.id, wall: 'sage' });
  assert.equal(rec.pal, 'sage');
  sim.dispatch({ type: 'undo' });
  assert.equal(rec.pal, before);
  assert.equal(sim.state.coins, c0);
});

test('paint survives a save, and a bad key is dropped', () => {
  const sim = mk(), rec = build(sim);
  sim.dispatch({ type: 'paintBuilding', id: rec.id, wall: 'rose', roof: 'tile' });
  sim.dispatch({ type: 'unlockPaint', kind: 'roof', key: 'moss' });
  const saved = JSON.parse(JSON.stringify(wrap(sim.state, 1)));
  const back = createSim({ state: unwrap(JSON.stringify(saved)).state });
  const r = back.state.placed.find((p) => p.id === rec.id);
  assert.equal(r.pal, 'rose');
  assert.equal(r.roof, 'tile');
  assert.deepEqual(back.state.paintUnlocks, ['r:moss']);
  saved.state.placed.find((p) => p.id === rec.id).roof = 'nope';
  saved.state.paintUnlocks = ['w:warm', 'r:bad', 'w:sky'];
  const again = createSim({ state: unwrap(JSON.stringify(saved)).state });
  assert.equal(again.state.placed.find((p) => p.id === rec.id).roof, undefined);
  assert.deepEqual(again.state.paintUnlocks, ['w:sky']);
});
