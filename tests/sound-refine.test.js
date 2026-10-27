import test from 'node:test';
import assert from 'node:assert/strict';
import { countOf, cueFor } from '../src/audio/soundscape.js';
import { falloff, sourceGains, RANGE } from '../src/audio/attenuation.js';
import { setCueSink, playCue } from '../src/audio/cuehub.js';
import { interactiveAnchor } from '../src/ui/sound-targets.js';
import { createEngine } from '../src/audio/engine.js';
import { DEFAULTS } from '../src/audio/mix.js';

test('countOf gives tiles for a road or zone, and 1 for everything else', () => {
  assert.equal(countOf({ type: 'roadsChanged', kind: 'draw', tiles: [[0, 0], [1, 0], [2, 0]] }), 3);
  assert.equal(countOf({ type: 'roadsChanged', kind: 'draw', tiles: [] }), 1);
  assert.equal(countOf({ type: 'zonePainted', n: 9 }), 9);
  assert.equal(countOf({ type: 'placed', id: 'x' }), 1);
  assert.equal(countOf(null), 1);
});

test('a toast that is not a shortage has no sim cue (the toast observer gives it a soft note instead)', () => {
  assert.equal(cueFor({ type: 'toast', text: 'Saved' }), null);
  assert.equal(cueFor({ type: 'toast', text: 'Not enough coins yet' }), 'deny');
});

test('the river reaches only when the camera is close to the water', () => {
  assert.ok(RANGE.river.far < RANGE.town.far, 'the river carries a shorter way than the town');
  const close = sourceGains({ x: 0, z: 0, h: 1.5 });
  // Park the listener on a river point and move it out: river gain falls to zero well before the town does.
  const riverPoint = { x: 52, z: 0 };
  const near = sourceGains({ x: riverPoint.x + 2, z: 0, h: 1.5 });
  const far = sourceGains({ x: riverPoint.x + 40, z: 0, h: 1.5 });
  assert.ok(near.river > 0.9);
  assert.equal(far.river, 0);
  assert.ok(close.town > 0.9);
});

test('falloff with an explicit range reaches zero at its far edge', () => {
  assert.equal(falloff(4, 4, 26), 1);
  assert.equal(falloff(26, 4, 26), 0);
  assert.ok(falloff(15, 4, 26) > 0 && falloff(15, 4, 26) < 1);
});

test('interactive targets: buttons, switches and pointer-cursor elements count; the town and disabled buttons do not', () => {
  const node = (tag, props = {}, parent = null, cursor = 'auto') => {
    const n = {
      nodeType: 1, tagName: tag.toUpperCase(), id: props.id || '', disabled: !!props.disabled,
      classList: { contains: () => false }, parentElement: parent, cursor,
      matches(sel) {
        return sel.split(',').some((s) => {
          const t = s.trim();
          if (t === 'button') return this.tagName === 'BUTTON';
          if (t === 'label') return this.tagName === 'LABEL';
          if (t.startsWith('[role="button"]')) return props.role === 'button';
          if (t.startsWith('[role="switch"]')) return props.role === 'switch';
          return false;
        });
      },
    };
    return n;
  };
  const styleOf = (el) => el.cursor;
  const btn = node('button');
  assert.equal(interactiveAnchor(btn, styleOf), btn);

  const row = node('div', {}, null, 'pointer');
  const inner = node('span', {}, row, 'auto');
  assert.equal(interactiveAnchor(inner, styleOf), row, 'a pointer row counts, found from a child');

  const plain = node('p');
  assert.equal(interactiveAnchor(plain, styleOf), null, 'plain text does not');

  const off = node('button', { disabled: true });
  assert.equal(interactiveAnchor(off, styleOf), null, 'a disabled button stays quiet');

  const stage = node('div', { id: 'stage' }, null, 'grab');
  const canvas = node('canvas', {}, stage, 'pointer');
  assert.equal(interactiveAnchor(canvas, styleOf), null, 'the town is never a control');
  assert.equal(interactiveAnchor(stage, styleOf), null);
});

test('the cue hub is a no-op until a sink is set, then forwards name and options', () => {
  setCueSink(null);
  assert.doesNotThrow(() => playCue('tick'));
  const seen = [];
  setCueSink((name, opts) => seen.push([name, opts]));
  playCue('road-grow', { n: 4 });
  playCue('tick');
  setCueSink(null);
  assert.deepEqual(seen, [['road-grow', { n: 4 }], ['tick', {}]]);
});

test('new cues exist and an unknown name is still ignored, with no audio context', () => {
  const engine = createEngine({ win: {} });
  for (const name of ['hover', 'tick', 'note', 'click', 'road-grow', 'road', 'zone']) {
    assert.doesNotThrow(() => engine.cue(name, { n: 3 }));
  }
  assert.doesNotThrow(() => engine.cue('nope', {}));
});

test('new players start at full master, half music and effects, and a low ambience bed', () => {
  assert.deepEqual(DEFAULTS, { master: 1, music: 0.5, effects: 0.5, ambience: 0.25, muted: false });
});
