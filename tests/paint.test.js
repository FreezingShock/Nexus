import test from 'node:test';
import assert from 'node:assert/strict';
import { quietSim as createSim } from './support/quiet.js';
import { freshState } from '../src/sim/state.js';
import { wrap, unwrap } from '../src/sim/save.js';
import { GRID_HALF } from '../src/world/grid.js';
import { KIND_IDS, costOf, partsOf, tableOf } from '../src/world/paint.js';
import { describe } from '../src/world/models.js';

const mk = () => { const state = freshState(); state.coins = 100000; state.parts = 5000; return createSim({ state }); };
const build = (sim) => {
  sim.dispatch({ type: 'place', model: 'cottage', gx: GRID_HALF + 6, gz: GRID_HALF + 4, fw: 1, fd: 1, rot: 0 });
  return sim.state.placed[sim.state.placed.length - 1];
};

test('every paint key has a palette or roof behind it', () => {
  for (const kind of KIND_IDS) {
    assert.ok(Object.keys(partsOf(kind)).every((k) => tableOf(kind)[k]), kind);
  }
});

test('repainting walls and roof costs coins by footprint and shows in the description', () => {
  const sim = mk(), rec = build(sim), c0 = sim.state.coins;
  sim.dispatch({ type: 'paintBuilding', id: rec.id, wall: 'butter', roof: 'slate' });
  assert.equal(rec.pal, 'butter');
  assert.equal(rec.roof, 'slate');
  assert.equal(sim.state.coins, c0 - costOf('wall', rec) - costOf('roof', rec));
  assert.equal(sim.building(rec.id).pal, 'butter', 'the cached description follows the repaint');
  assert.equal(describe(rec, 1).roof, 'slate');
  const c1 = sim.state.coins;
  sim.dispatch({ type: 'paintBuilding', id: rec.id, wall: 'butter' });
  assert.equal(sim.state.coins, c1, 'the colour it already wears is free and does nothing');
});

test('newer colours need their Parts once; undo gives the coins back', () => {
  const sim = mk(), rec = build(sim); sim.state.parts = 10;
  const before = rec.pal;
  sim.dispatch({ type: 'paintBuilding', id: rec.id, wall: 'sky' });
  assert.equal(rec.pal, before, 'locked');
  sim.dispatch({ type: 'unlockPaint', kind: 'wall', key: 'sky' });
  assert.deepEqual(sim.state.paintUnlocks, []);
  sim.state.parts = 100;
  sim.dispatch({ type: 'unlockPaint', kind: 'wall', key: 'sky' });
  sim.dispatch({ type: 'unlockPaint', kind: 'wall', key: 'sky' });
  assert.equal(sim.state.parts, 40, 'spent once');
  const c0 = sim.state.coins;
  sim.dispatch({ type: 'paintBuilding', id: rec.id, wall: 'sky' });
  assert.equal(rec.pal, 'sky');
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

test('painting the town reaches every paintable building and every grown lot, priced per building, and undo restores it', () => {
  const sim = mk();
  const a = build(sim);
  sim.dispatch({ type: 'place', model: 'green', gx: GRID_HALF + 8, gz: GRID_HALF + 4, fw: 1, fd: 1, rot: 0 });
  const park = sim.state.placed[sim.state.placed.length - 1];
  const before = sim.state.placed.map((r) => [r.id, r.pal, r.roof]);
  const plan = sim.townPlan({ wall: 'cream', roof: 'umber' });
  assert.ok(plan.n >= 2 && plan.cost > 0);
  const c0 = sim.state.coins;
  sim.dispatch({ type: 'paintTown', wall: 'cream', roof: 'umber', trim: 'forest' });
  for (const r of sim.state.placed) {
    if (['green', 'plaza', 'playground', 'pond'].includes(r.model)) { assert.notEqual(r.roof, 'umber', 'a park has no walls to paint'); continue; }
    assert.equal(r.pal, 'cream'); assert.equal(r.roof, 'umber'); assert.equal(r.trim, 'forest');
  }
  assert.deepEqual(sim.state.townPaint, { wall: 'cream', trim: 'forest', roof: 'umber' });
  assert.ok(sim.state.coins < c0);
  sim.dispatch({ type: 'undo' });
  assert.equal(sim.state.coins, c0);
  assert.equal(sim.state.townPaint, null);
  assert.deepEqual(sim.state.placed.map((r) => [r.id, r.pal, r.roof]), before);
  assert.ok(a);
});

test('grown lots wear the town paint, and clearing it sends them back', async () => {
  const { lotDescription } = await import('../src/world/lots.js');
  const plain = lotDescription(1, 1, 7, GRID_HALF * 96 + GRID_HALF, () => false);
  const painted = lotDescription(1, 1, 7, GRID_HALF * 96 + GRID_HALF, () => false, { wall: 'denim', roof: 'navy', trim: 'mustard' });
  assert.equal(painted.pal, 'denim'); assert.equal(painted.roof, 'navy'); assert.equal(painted.trim, 'mustard');
  assert.notEqual(plain.pal, 'denim');
  const sim = mk(); sim.state.townPaint = { wall: 'denim' };
  sim.dispatch({ type: 'clearTownPaint' });
  assert.equal(sim.state.townPaint, null);
});

test('locked colours block a town paint until their Parts are spent; the save keeps the town paint', () => {
  const sim = mk(); build(sim); sim.state.parts = 0;
  sim.dispatch({ type: 'paintTown', wall: 'charcoal' });
  assert.equal(sim.state.townPaint, null);
  sim.state.parts = 1000;
  sim.dispatch({ type: 'unlockPaint', kind: 'wall', key: 'charcoal' });
  sim.dispatch({ type: 'paintTown', wall: 'charcoal' });
  const back = createSim({ state: unwrap(wrap(sim.state, 1)).state });
  assert.deepEqual(back.state.townPaint, { wall: 'charcoal' });
});

// Every model with walls must answer to all three paints: changing only the wall scheme, only the trim, or only the roof
// has to change something that model actually draws. (This is the audit nate asked for.)
test('every paintable model really changes with walls, trim and roof', async () => {
  const { MODELS } = await import('../src/world/models.js');
  const { makeParts } = await import('../src/render/buildings.js');
  const draw = (def, paint, level) => {
    const [fw, fd] = def.foot[def.foot.length - 1];
    return makeParts(describe({ id: 'b1', model: def.id, gx: 0, gz: 0, fw, fd, rot: 0, ...paint }, level));
  };
  const differs = (a, b) => a.length !== b.length || a.some((p, i) => p.facadeMat !== b[i].facadeMat || (p.color && b[i].color && p.color.getHex() !== b[i].color.getHex()));
  for (const def of MODELS) {
    if (!def.floors[1]) continue; // parks have no walls
    for (const level of [1, 5]) {
      const base = { pal: 'cream', roof: 'tile', trim: 'forest' };
      const ref = draw(def, base, level);
      assert.ok(differs(ref, draw(def, { ...base, pal: 'denim' }, level)), def.id + ' ignores the wall scheme at level ' + level);
      assert.ok(differs(ref, draw(def, { ...base, roof: 'navy' }, level)), def.id + ' ignores the roof colour at level ' + level);
      assert.ok(differs(ref, draw(def, { ...base, trim: 'mustard' }, level)), def.id + ' ignores the trim colour at level ' + level);
    }
  }
});
