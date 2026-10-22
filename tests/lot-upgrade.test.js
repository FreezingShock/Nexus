import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { wrap, unwrap } from '../src/sim/save.js';
import { upgradeCost } from '../src/sim/economy.js';
import { ZONE_DEFS } from '../src/sim/zones.js';
import { lotId, lotTileOf } from '../src/world/lots.js';

// A grown building (zoned lot) is a building like a placed one: the inspect card reads it by id, the upgrade charges the
// same curve and raises its level, the render is told, the save keeps the level, and bulldoze takes it away (undoable).

const mk = () => { const state = freshState(); state.coins = 1e9; return createSim({ state }); };
import { GRID_HALF } from '../src/world/grid.js';

const A = [GRID_HALF + 5, GRID_HALF + 1], B = [GRID_HALF + 8, GRID_HALF + 6]; // open tiles next to the road, as in zoning.test.js

// A sim with one grown lot at level 1 and its id.
function withLot() {
  const sim = mk();
  sim.dispatch({ type: 'paintZone', zone: 1, a: A, b: B });
  for (let i = 0; i < 300 && !sim.state.lots.length; i++) sim.tick();
  assert.ok(sim.state.lots.length > 0, 'a lot grows next to the road');
  const lot = sim.state.lots[0];
  lot[1] = 1; // start from level 1 whatever the ticks did
  sim.state.zoneRev++;
  return { sim, lot, id: lotId(lot[0]) };
}

test('a grown lot is a building by its id: name, floors, level, cost and what it pays', () => {
  const { sim, id } = withLot();
  const b = sim.building(id);
  assert.ok(b, 'found by id');
  assert.equal(b.id, id);
  assert.ok(b.floors >= 1, 'has storeys to add');
  assert.equal(sim.alive(id), true);
  assert.equal(sim.level(id), 1);
  assert.equal(sim.cost(id), upgradeCost(b.floors, 1), 'same curve as a placed building');
  assert.equal(b.income, ZONE_DEFS[1].income * 1, 'pays its zone rate at its level');
});

test('upgrading a grown lot charges the card price, raises its level and its income', () => {
  const { sim, lot, id } = withLot();
  const cost = sim.cost(id), coins = sim.state.coins, rate = sim.rate();
  let upgraded = null;
  sim.subscribe((e) => { if (e.type === 'upgraded') upgraded = e; });
  const zoneRev = sim.state.zoneRev;
  sim.dispatch({ type: 'upgrade', id });
  assert.equal(sim.state.coins, coins - cost, 'pays the cost the card showed');
  assert.equal(lot[1], 2, 'the lot itself carries the new level');
  assert.equal(sim.level(id), 2, 'the card reads the new level');
  assert.equal(sim.building(id).income, ZONE_DEFS[1].income * 2);
  assert.ok(sim.rate() > rate, 'income goes up');
  assert.ok(sim.state.zoneRev > zoneRev, 'the render is told to redraw the lot');
  assert.equal(upgraded && upgraded.id, id, 'emits upgraded so the card and the dust follow');
});

test('a grown lot stops at the top level like a placed one', () => {
  const { sim, lot, id } = withLot();
  lot[1] = 5;
  const coins = sim.state.coins;
  sim.dispatch({ type: 'upgrade', id });
  assert.equal(lot[1], 5);
  assert.equal(sim.state.coins, coins, 'no charge at the top');
});

test('the upgraded level survives a save and a reload', () => {
  const { sim, id } = withLot();
  sim.dispatch({ type: 'upgrade', id });
  sim.dispatch({ type: 'upgrade', id });
  const back = createSim({ state: unwrap(wrap(sim.state, 1)).state });
  assert.equal(back.level(id), 3);
  assert.equal(back.alive(id), true);
});

test('bulldozing a grown lot clears its ground, and undo brings it back at the same level', () => {
  const { sim, lot, id } = withLot();
  sim.dispatch({ type: 'upgrade', id });
  const tile = lotTileOf(id);
  sim.dispatch({ type: 'bulldoze', id });
  assert.equal(sim.alive(id), false, 'gone');
  assert.equal(sim.state.lots.some(([i]) => i === tile), false);
  assert.equal(sim.grid.zone[tile], 0, 'its paint goes with it, so the lot does not simply regrow');
  assert.equal(sim.state.removed.includes(id), false, 'a grown lot is not a removed record');
  sim.dispatch({ type: 'undo' });
  assert.equal(sim.alive(id), true, 'back after undo');
  assert.equal(sim.level(id), 2, 'back at the level it had');
  assert.equal(sim.state.lots.find(([i]) => i === tile)[1], 2);
});

test('ids that are not grown lots fall through untouched', () => {
  const { sim } = withLot();
  assert.equal(sim.building('lot-3'), null);
  assert.equal(sim.alive('lot-3'), false);
  assert.equal(sim.building('b9999') ?? null, null, 'no placed record here either');
  assert.equal(lotTileOf('b1001'), null, 'placed ids are not lot ids');
  assert.equal(lotTileOf('lot12'), 12);
});
