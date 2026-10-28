// The town's festive style (core/festive.js, sim/systems/festive.js): amount, light colours and buildings sitting out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, dressShare, freshFestive, isDark, lightsFor, sanitizeFestive } from '../src/core/festive.js';
import { EVENTS } from '../src/core/events.js';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { getLayout } from '../src/world/layout.js';
import { sanitize } from '../src/sim/save.js';

test('decorations are a plain switch: all out, or none', () => {
  const f = (amount) => ({ ...freshFestive(), amount });
  assert.deepEqual(dressShare('christmas', 0.5, f('none')), { buildings: 0, trees: 0 });
  assert.equal(dressShare('christmas', 0.35, f('all')).buildings, 1, 'all out from day one');
  assert.ok(dressShare('christmas', 0.35, f('all')).trees > 0.5);
  assert.equal(dressShare('', 1, f('all')).buildings, 0);
  assert.equal(freshFestive().amount, 'all');
});

test('every event has palettes, classic first, each with real colours', () => {
  for (const e of EVENTS) {
    const list = PALETTES[e.id];
    assert.equal(list[0].id, 'classic');
    assert.deepEqual(lightsFor(e.id, freshFestive()), e.lights);
    for (const p of list) assert.ok(lightsFor(e.id, { palette: { [e.id]: p.id } }).length >= 2, e.id + ' ' + p.id);
  }
});

test('old amounts migrate: a little and cozy become on, none stays off', () => {
  for (const a of ['light', 'cozy', 'all', 'loud', undefined]) assert.equal(sanitizeFestive({ amount: a }).amount, 'all', String(a));
  assert.equal(sanitizeFestive({ amount: 'none' }).amount, 'none');
});

test('old saves and junk come back as the default', () => {
  assert.deepEqual(sanitizeFestive(undefined), freshFestive());
  assert.deepEqual(sanitizeFestive({ amount: 'loud', palette: { christmas: 'neon', halloween: 'potion' }, dark: ['b3', 'x', 'b3', 7] }),
    { amount: 'all', palette: { halloween: 'potion' }, dark: ['b3'], optIn: ['snoopy'], offered: ['snoopy'], unlocked: ['snoopy'], show: '' });
  const s = sanitize({ coins: 5 });
  assert.deepEqual(s.festive, freshFestive(), 'a save from before festive styles');
});

test('commands: the style changes for free, and a placed building can switch its lights off and on', () => {
  const sim = createSim({ state: freshState(), layout: getLayout() });
  const coins = sim.state.coins, before = sim.state.festive;
  sim.dispatch({ type: 'setFestive', amount: 'none' });
  sim.dispatch({ type: 'setFestive', event: 'christmas', palette: 'icy' });
  sim.dispatch({ type: 'setFestive', amount: 'shouty' });
  assert.equal(sim.state.festive.amount, 'none');
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

test('seasonal sets: earned at the big day, shown any time once unlocked, put away again', async () => {
  const { dayOfDate } = await import('../src/core/calendar.js');
  const { eventOn } = await import('../src/core/events.js');
  const sim = createSim({ state: freshState(), layout: getLayout() });
  const md = 3;
  assert.deepEqual(sim.state.festive.unlocked, ['snoopy'], 'only the gift to begin with');
  sim.dispatch({ type: 'setEventShow', event: 'christmas' });
  assert.equal(sim.state.festive.show, '', 'a locked set cannot be shown');
  const xmas = dayOfDate(2, 11, 1, md);
  sim.skipToDay(xmas - 1);
  assert.equal(sim.state.festive.unlocked.includes('christmas'), false, 'the day before is not enough');
  sim.skipToDay(xmas + 3);
  assert.equal(sim.state.festive.unlocked.includes('christmas'), true, 'playing through its big day unlocks it');
  const june = dayOfDate(3, 5, 1, md);
  sim.skipToDay(june);
  assert.equal(sim.state.event, '', 'out of season, nothing up');
  sim.dispatch({ type: 'setEventShow', event: 'christmas' });
  assert.equal(sim.state.event, 'christmas', 'now shown whatever the date');
  assert.equal(sim.state.eventCover, 1);
  assert.equal(sim.state.eventPeak, 0);
  sim.dispatch({ type: 'setEventShow', event: '' });
  assert.equal(sim.state.event, '', 'put away');
  assert.equal(eventOn(0, md, null, 'christmas').forced, true);
});

test('keepsakes unlock their set, and the new fields survive sanitize', () => {
  const f = sanitizeFestive({ unlocked: ['christmas', 'bogus'], show: 'christmas' });
  assert.deepEqual(f.unlocked.sort(), ['christmas', 'snoopy']);
  assert.equal(f.show, 'christmas');
  assert.equal(sanitizeFestive({ show: 'halloween' }).show, '', 'cannot show a locked set');
});
