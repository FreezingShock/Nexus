import test from 'node:test';
import assert from 'node:assert/strict';
import { quietSim as createSim } from './support/quiet.js';
import { getLayout } from '../src/world/layout.js';
import { MODELS, describe, modelById } from '../src/world/models.js';
import { checkLot } from '../src/world/placement.js';
import { STARTER_COUNT } from '../src/world/starter.js';
import { upgradeCost } from '../src/sim/economy.js';
import { BALANCE } from '../src/sim/balance.js';

// The inspect card reads level, cost and the building for whatever the player picks. Every kind of pick must work
// (starter town, placed kit buildings, services, parks, landmarks), and an id that no longer maps to a building
// must read as "nothing here" instead of throwing.

const layout = getLayout();
const RICH = 1e12;

function rich() {
  const sim = createSim({ layout });
  sim.state.coins = RICH;
  return sim;
}

// First free footprint of fw x fd on open ground, scanning from the edge of the test town.
function freeSpot(sim, fw, fd) {
  for (let z = 4; z < 60; z++) for (let x = 4; x + fw < 60; x++) {
    if (checkLot(sim.grid, x, z, fw, fd).ok) return [x, z];
  }
  throw new Error('no free ' + fw + 'x' + fd + ' spot in the test town');
}

// Places one model from the catalog on its first footprint and returns the new id.
function place(sim, model) {
  const def = modelById(model);
  const [fw, fd] = def.foot[0];
  const [gx, gz] = freeSpot(sim, fw, fd);
  const before = sim.state.placed.length;
  sim.dispatch({ type: 'place', model, gx, gz, fw, fd, rot: 0 });
  assert.equal(sim.state.placed.length, before + 1, model + ' should place');
  return sim.state.placed[sim.state.placed.length - 1].id;
}

test('an unknown or stale id reads as nothing: no throw, level 0, cost 0, not alive', () => {
  const sim = rich();
  for (const id of ['b9999', 'lot-3', 'car-12', '', undefined, null]) {
    assert.equal(sim.building(id) ?? null, null, String(id) + ' has no building');
    assert.equal(sim.alive(id), false, String(id) + ' is not alive');
    assert.equal(sim.level(id), 0, String(id) + ' has level 0');
    assert.equal(sim.cost(id), 0, String(id) + ' costs nothing to upgrade');
  }
});

test('starter town building: level, cost and upgrade', () => {
  const sim = rich();
  const rec = sim.state.placed.find((r) => r.starter && r.model === 'terrace');
  const b = describe(rec, 1);
  assert.ok(b.floors > 0, 'the starter village has an upgradable building');
  assert.equal(sim.level(b.id), 1);
  assert.equal(sim.cost(b.id), upgradeCost(b.floors, 1));
  const coins = sim.state.coins;
  sim.dispatch({ type: 'upgrade', id: b.id });
  assert.equal(sim.level(b.id), 2, 'the card reads the new level');
  assert.equal(sim.state.coins, coins - upgradeCost(b.floors, 1), 'pays the cost the card showed');
});

// Every placeable model is a pickable kind: houses, shops, work, services, landmarks and parks.
for (const def of MODELS) {
  test('placed ' + def.name + ' (' + def.cat + '): card reads it and upgrade works or is refused', () => {
    const sim = rich();
    const id = place(sim, def.id);
    const b = sim.building(id);
    assert.ok(b, 'a placed building is found by id');
    assert.equal(b.model, def.id);
    assert.equal(sim.alive(id), true);
    assert.equal(sim.level(id), 1, 'placed buildings start at level 1');
    if (!def.floors[1]) {
      // parks: ground, nothing to add
      assert.equal(b.floors, 0);
      assert.equal(sim.cost(id), 0);
      const coins = sim.state.coins;
      sim.dispatch({ type: 'upgrade', id });
      assert.equal(sim.level(id), 1, 'a park stays at level 1');
      assert.equal(sim.state.coins, coins, 'a park costs nothing');
      return;
    }
    assert.equal(sim.cost(id), upgradeCost(b.floors, 1), 'the card cost matches the upgrade rule');
    const coins = sim.state.coins;
    sim.dispatch({ type: 'upgrade', id });
    assert.equal(sim.level(id), 2, 'upgrade raises the level the card reads');
    assert.equal(sim.state.levels[id], 2, 'the level is saved against the id');
    assert.equal(sim.state.coins, coins - upgradeCost(b.floors, 1));
  });
}

test('placed building: upgrade to the top, then the card reads Max and no more coins go out', () => {
  const sim = rich();
  const id = place(sim, 'tower');
  for (let i = 0; i < 10; i++) sim.dispatch({ type: 'upgrade', id });
  assert.equal(sim.level(id), 5);
  const coins = sim.state.coins;
  sim.dispatch({ type: 'upgrade', id });
  assert.equal(sim.state.coins, coins, 'no charge past the top level');
});

test('bulldozed placed building: card closes (not alive), no throw, and Ctrl+Z brings it back upgradable', () => {
  const sim = rich();
  const id = place(sim, 'clinic');
  sim.dispatch({ type: 'upgrade', id });
  sim.dispatch({ type: 'bulldoze', id });
  assert.equal(sim.alive(id), false, 'gone from the town');
  assert.equal(sim.level(id), 2, 'reads without throwing while it is gone');
  sim.dispatch({ type: 'upgrade', id });
  assert.equal(sim.level(id), 2, 'a bulldozed building cannot be upgraded');
  sim.dispatch({ type: 'undo' });
  assert.equal(sim.alive(id), true, 'undo restores it');
  assert.equal(sim.building(id).model, 'clinic');
  assert.equal(sim.level(id), 2, 'keeps its level');
  sim.dispatch({ type: 'upgrade', id });
  assert.equal(sim.level(id), 3, 'upgrades again after the undo');
});

test('placement undone with Ctrl+Z: the building is gone and reads as nothing', () => {
  const sim = rich();
  const id = place(sim, 'church');
  assert.equal(sim.alive(id), true);
  sim.dispatch({ type: 'undo' });
  assert.equal(sim.building(id) ?? null, null, 'no record left');
  assert.equal(sim.alive(id), false);
  assert.equal(sim.level(id), 0);
  assert.equal(sim.cost(id), 0);
  sim.dispatch({ type: 'upgrade', id });
  assert.equal(sim.state.levels[id], undefined, 'nothing is written for a building that is not there');
});

test('after a Renewal the next placed id names the new building, not the old one that shared its id', () => {
  const sim = rich();
  const first = place(sim, 'tower');
  assert.equal(sim.building(first).model, 'tower');
  sim.state.runEarned = BALANCE.renewal.divisor;
  sim.dispatch({ type: 'renew' });
  assert.equal(sim.state.placed.filter((r) => !r.starter).length, 0, 'no player buildings after a Renewal');
  assert.equal(sim.state.placed.filter((r) => r.starter).length, STARTER_COUNT, 'the starter village is back');
  const again = place(sim, 'cottage');
  assert.equal(again, first, 'ids start over after a Renewal');
  assert.equal(sim.building(again).model, 'cottage', 'the card and upgrade read the new house');
  assert.equal(sim.building(again).name, modelById('cottage').name);
});
