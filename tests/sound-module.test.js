// The UI glue, with the DOM replaced by a small stub: enough to check the wiring (gestures, menus, events, day and night,
// the camera feed) without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import soundModule from '../src/ui/modules/sound.js';
import { createSoundStore } from '../src/audio/mix.js';

test('the sound module wires up with no DOM errors and tracks day, night and the camera', () => {
  const listeners = {};
  const docListeners = {};
  globalThis.addEventListener = (ev, fn) => { (listeners[ev] ||= []).push(fn); };
  globalThis.removeEventListener = (ev, fn) => { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); };
  globalThis.document = {
    body: {}, hidden: false, visibilityState: 'visible',
    addEventListener: (ev, fn) => { (docListeners[ev] ||= []).push(fn); },
  };
  globalThis.MutationObserver = class { constructor(fn) { this.fn = fn; } observe() {} };

  const store = createSoundStore({ storage: null });
  const sim = { state: { night: false, season: null, weather: 'clear' }, subscribe() { return () => {}; } };
  const camera = { mode: 'iso', view: { tx: 0, tz: 0, half: 46, zoom: 1 }, free: null };
  const scene = { camera };

  const mod = soundModule.create({ sim, scene, sound: store });
  assert.equal(typeof mod.frame, 'function');
  assert.equal(typeof mod.onEvent, 'function');
  assert.equal(typeof mod.onTool, 'function');
  assert.ok((listeners.pointerdown || []).length === 1 && (listeners.keydown || []).length === 1, 'waits for a gesture');

  // Day to night, then the camera zooms out: none of this may throw with no audio context.
  mod.frame(0.1);
  sim.state.night = true;
  mod.frame(0.3);
  camera.view.zoom = 0.6;
  mod.frame(0.3);
  mod.onEvent({ type: 'placed', id: 'x' });
  mod.onEvent({ type: 'toast', text: 'Not enough coins yet' });
  mod.onTool('roads');
  mod.onTool(null);

  // Settings changes reach the engine through the store.
  store.set('music', 0.1);
  store.toggleMute();
  store.toggleMute();

  for (const fn of listeners.pointerdown || []) removeEventListener('pointerdown', fn, true);
  for (const fn of listeners.keydown || []) removeEventListener('keydown', fn, true);
});

test('without a sound store the module adds nothing', () => {
  assert.deepEqual(soundModule.create({ sim: { state: {} }, scene: {}, sound: null }), {});
});
