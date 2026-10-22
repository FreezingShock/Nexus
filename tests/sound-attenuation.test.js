import test from 'node:test';
import assert from 'node:assert/strict';
import { NEAR, FAR, falloff, listenerOf, distanceTo, sourceGains, RIVER_POINTS } from '../src/audio/attenuation.js';

test('falloff is full inside NEAR, silent beyond FAR, and never rises with distance', () => {
  assert.equal(falloff(0), 1);
  assert.equal(falloff(NEAR), 1);
  assert.equal(falloff(FAR), 0);
  assert.equal(falloff(FAR + 500), 0);
  let prev = 1;
  for (let d = 0; d <= FAR + 10; d += 1) {
    const g = falloff(d);
    assert.ok(g <= prev + 1e-12, 'gain must not rise at distance ' + d);
    assert.ok(g >= 0 && g <= 1);
    prev = g;
  }
});

test('falloff is smooth at both ends (no step that would click)', () => {
  assert.ok(falloff(NEAR + 0.5) > 0.999);
  assert.ok(falloff(FAR - 0.5) < 0.001);
  const mid = falloff((NEAR + FAR) / 2);
  assert.ok(Math.abs(mid - 0.5) < 1e-9, 'halfway is half gain');
});

test('bad distances are silent rather than NaN', () => {
  assert.equal(falloff(NaN), 0);
  assert.equal(falloff(undefined), 0);
  assert.equal(falloff(-Infinity), 0);
});

test('the orbit listener rises as the camera zooms out, so the town gets quieter', () => {
  const view = { tx: 3, tz: -4, half: 46, zoom: 1 };
  const near = listenerOf({ mode: 'iso', view: { ...view, zoom: 3 }, free: null });
  const mid = listenerOf({ mode: 'iso', view, free: null });
  const far = listenerOf({ mode: 'iso', view: { ...view, zoom: 0.55 }, free: null });
  assert.equal(mid.x, 3);
  assert.equal(mid.z, -4);
  assert.ok(near.h < mid.h && mid.h < far.h, 'height grows as zoom drops');
});

test('the fly listener is the eye, so street level sounds close', () => {
  const free = { pos: { x: 10, y: 1.5, z: -6 } };
  const l = listenerOf({ mode: 'fly', view: { tx: 0, tz: 0, half: 46, zoom: 1 }, free });
  assert.deepEqual(l, { x: 10, z: -6, h: 1.5 });
});

test('a zoomed-out orbit view is quieter than a zoomed-in one for the same source', () => {
  const view = { tx: 0, tz: 0, half: 46 };
  const zoomedIn = sourceGains(listenerOf({ mode: 'iso', view: { ...view, zoom: 2.5 }, free: null }));
  const zoomedOut = sourceGains(listenerOf({ mode: 'iso', view: { ...view, zoom: 0.55 }, free: null }));
  assert.ok(zoomedIn.town > zoomedOut.town, 'town is louder zoomed in');
  assert.ok(zoomedOut.town > 0 && zoomedOut.town < 1, 'still audible when zoomed out, but quieter');
});

test('free-fly at street level hears the town close, and a far corner hardly at all', () => {
  const streetCentre = sourceGains({ x: 0, z: 0, h: 1.5 });
  assert.ok(streetCentre.town > 0.99);
  const corner = sourceGains({ x: 90, z: 90, h: 1.5 });
  assert.equal(corner.town, 0);
});

test('the river is heard from nearby, and its gain is the nearest point on the river', () => {
  const p = RIVER_POINTS[5];
  assert.ok(sourceGains({ x: p.x + 1, z: p.z, h: 1.5 }).river > 0.95);
  assert.ok(distanceTo({ x: p.x, z: p.z, h: 0 }, RIVER_POINTS) === 0);
});

test('sourceGains never returns NaN, even for a broken listener', () => {
  const g = sourceGains({ x: NaN, z: 0, h: 1 });
  assert.equal(g.town, 0);
  assert.equal(g.river, 0);
});
