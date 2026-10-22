import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, VOLUMES } from '../src/audio/mix.js';
import { soundMarkup } from '../src/ui/sound-settings.js';
import { createEngine } from '../src/audio/engine.js';

test('the Sound section has a mute switch and one slider per volume', () => {
  const html = soundMarkup(DEFAULTS);
  assert.match(html, /role="switch" data-mute aria-checked="false"/);
  for (const k of VOLUMES) assert.match(html, new RegExp(`data-vol="${k}"`));
  assert.match(html, /value="70" data-vol="master"/);
});

test('muted sound shows the switch on and disables the sliders', () => {
  const html = soundMarkup({ ...DEFAULTS, muted: true });
  assert.match(html, /data-mute aria-checked="true"/);
  assert.equal((html.match(/ disabled>/g) || []).length, VOLUMES.length);
});

test('without Web Audio the engine is a quiet no-op, and the game carries on', () => {
  const engine = createEngine({ win: {} });
  assert.equal(engine.unlock(), false);
  assert.equal(engine.ready, false);
  engine.apply(DEFAULTS);
  engine.setLevels({ birds: 1 });
  engine.setSources({ town: 0.5 });
  engine.setNight(true);
  engine.cue('place');
  engine.setActive(false);
});

test('an audio context that throws on creation is reported as a failed unlock, not an error', () => {
  function Broken() { throw new Error('no audio here'); }
  const engine = createEngine({ win: { AudioContext: Broken } });
  assert.equal(engine.unlock(), false);
  assert.equal(engine.ready, false);
  engine.cue('select');
});
