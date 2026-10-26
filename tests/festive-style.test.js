// The town's festive style (core/festive.js, sim/systems/festive.js): amount, light colours and buildings sitting out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AMOUNTS, PALETTES, dressShare, freshFestive, isDark, lightsFor, sanitizeFestive } from '../src/core/festive.js';
import { EVENTS } from '../src/core/events.js';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { getLayout } from '../src/world/layout.js';
import { sanitize } from '../src/sim/save.js';

test('amounts shape how much of the town dresses up', () => {
  const f = (amount) => ({ ...freshFestive(), amount });
  assert.deepEqual(dressShare('christmas', 0.5, f('none')), { buildings: 0, trees: 0 });
  assert.ok(dressShare('christmas', 0.5, f('light')).buildings < dressShare('christmas', 0.5, f('cozy')).buildings);
  assert.equal(dressShare('christmas', 0.35, f('all')).buildings, 1, 'all out from day one');
  assert.ok(dressShare('christmas', 1, f('all')).trees > dressShare('christmas', 1, f('cozy')).trees);
  assert.equal(dressShare('', 1, f('all')).buildings, 0);
  assert.equal(AMOUNTS.length, 4);
});

test('every event has palettes, classic first, each with real colours', () => {
  for (const e of EVENTS) {
    const list = PALETTES[e.id];
    assert.equal(list[0].id, 'classic');
    assert.deepEqual(lightsFor(e.id, freshFestive()), e.lights);
    for (const p of list) assert.ok(lightsFor(e.id, { palette: { [e.id]: p.id } }).length >= 2, e.id + ' ' + p.id);
  }
});

test('old saves and junk come back as the cozy default', () => {
  assert.deepEqual(sanitizeFestive(undefined), freshFestive());
  assert.deepEqual(sanitizeFestive({ amount: 'loud', palette: { christmas: 'neon', halloween: 'potion' }, dark: ['b3', 'x', 'b3', 7] }),
    { amount: 'cozy', palette: { halloween: 'potion' }, dark: ['b3'] });
  const s = sanitize({ coins: 5 });
  assert.deepEqual(s.festive, freshFestive(), 'a save from before festive styles');
});

test('commands: the style changes for free, and a placed building can switch its lights off and on', () => {
  const sim = createSim({ state: freshState(), layout: getLayout() });
  const coins = sim.state.coins, before = sim.state.festive;
  sim.dispatch({ type: 'setFestive', amount: 'all' });
  sim.dispatch({ type: 'setFestive', event: 'christmas', palette: 'icy' });
  sim.dispatch({ type: 'setFestive', amount: 'shouty' });
  assert.equal(sim.state.festive.amount, 'all');
  assert.equal(sim.state.festive.palette.christmas, 'icy');
  assert.notEqual(sim.state.festive, before, 'a new object, so render notices');
  assert.equal(sim.state.coins, coins, 'free');
  const id = sim.state.placed[0].id;
  sim.dispatch({ type: 'festiveLights', id, on: false });
  assert.equal(isDark(sim.state.festive, id), true);
  assert.equal(sim.festiveLightsOn(id), false);
  sim.dispatch({ type: 'festiveLights', id, on: true });
  assert.equal(isDark(sim.state.festive, id), false);
  sim.dispatch({ type: 'festiveLights', id: 'b999999', on: false });
  assert.equal(sim.state.festive.dark.length, 0, 'only real buildings');
});
