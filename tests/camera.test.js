import test from 'node:test';
import assert from 'node:assert/strict';
import { createCamera, moveVector, SPEEDS } from '../src/render/camera.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);

test('WASD moves relative to the heading, with unit length on diagonals', () => {
  const v = (k) => moveVector({ f: false, b: false, l: false, r: false, ...k }, 0);
  const at = (got, x, z) => { near(got.x, x); near(got.z, z); };
  at(v({ f: true }), 0, -1);   // forward is away from the viewer at heading 0
  at(v({ b: true }), 0, 1);
  at(v({ r: true }), 1, 0);
  at(v({ l: true }), -1, 0);
  const d = v({ f: true, r: true });
  near(Math.hypot(d.x, d.z), 1);
  at(v({}), 0, 0);
  // turning the camera turns the movement with it
  const turned = moveVector({ f: true, b: false, l: false, r: false }, Math.PI / 2);
  near(turned.x, -1); near(turned.z, 0);
});

test('the camera is orthographic in overview and perspective in free fly, and switching back returns to the same place', () => {
  const c = createCamera();
  c.setMode('overview');
  assert.equal(c.cam.isOrthographicCamera, true);
  c.setMode('fly');
  assert.equal(c.cam.isPerspectiveCamera, true);
  c.setMode('overview');
  assert.equal(c.cam.isOrthographicCamera, true);
  near(c.view.tx, 0, 1e-9); near(c.view.tz, 0, 1e-9);
});

test('holding W walks forward in free fly and the walk stays inside the island', () => {
  const c = createCamera();
  c.setMode('fly');
  const start = c.cam.position.clone();
  c.setKeys({ f: true });
  for (let i = 0; i < 30; i++) c.step(0.1, false);
  const p = c.cam.position;
  assert.ok(p.z < start.z - 1, 'moved forward along -z at heading π/4 (and -x)');
  assert.ok(p.x < start.x - 1);
  c.setKeys({ f: true });
  for (let i = 0; i < 2000; i++) c.step(0.1, false);
  assert.ok(Math.abs(c.cam.position.x) <= 81 && Math.abs(c.cam.position.z) <= 81, 'clamped to the island');
});

test('scrolling in free fly moves forward and back, and does not change the overview zoom', () => {
  const c = createCamera();
  c.setMode('fly');
  c.step(0.016, false);
  const z0 = c.cam.position.z;
  c.wheel(-100); // scroll up: forward
  c.step(0.016, false);
  assert.ok(c.cam.position.z < z0, 'forward is -z at heading π/4 for both axes');
  const zoom = c.view.tzoom;
  c.wheel(100);
  assert.equal(c.view.tzoom, zoom);
});

test('Q and E turn freely while held, not in quarter steps', () => {
  const c = createCamera();
  const a0 = c.view.taz;
  c.setKeys({ tr: true });
  c.step(0.5, false);
  c.setKeys({ tr: false });
  const turned = c.view.taz - a0;
  assert.ok(turned > 0.5 && turned < 1.2, `turned ${turned}`);
  assert.ok(Math.abs(turned - Math.PI / 2) > 0.05, 'not a quarter turn');
});

test('right-drag turns in overview; left-drag pans; in free fly any drag looks around', () => {
  const c = createCamera();
  const a0 = c.view.taz;
  c.drag(50, 0, 800, 2);
  assert.ok(c.view.taz > a0, 'right-drag right turns right');
  c.drag(20, 0, 800, 0);
  assert.notEqual(c.view.ttx, 0, 'left-drag pans');
  c.setMode('fly');
  c.step(0.016, false);
  const before = c.cam.quaternion.clone();
  c.drag(40, 0, 800, 0);
  c.step(0.016, false);
  assert.ok(Math.abs(c.cam.quaternion.x - before.x) + Math.abs(c.cam.quaternion.y - before.y) + Math.abs(c.cam.quaternion.z - before.z) > 1e-4, 'looking turns the camera');
});

test('speed names are validated and every speed is a positive multiplier', () => {
  const c = createCamera();
  c.setSpeed('warp');
  assert.equal(c.speed(), 'normal');
  c.setSpeed('fast');
  assert.equal(c.speed(), 'fast');
  assert.deepEqual(c.speeds(), Object.keys(SPEEDS));
  for (const v of Object.values(SPEEDS)) assert.ok(v > 0);
});
