import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ISO, TOWN_LIMIT, FLY_LIMIT, EYE_MIN, EYE_MAX, FLY_PITCH, START, clamp, approach, zoomStep,
  forwardOnGround, rightOnGround, lookDir, intentOf, orbitPose, orbitMove, orbitSpin,
  flyVelocity, flyMove, lookChange, flyStart, isoTargetFrom,
} from '../src/render/camera-math.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);
const closePt = (p, q, eps = 1e-6) => { close(p.x, q.x, eps); close(p.z, q.z, eps); };
const keys = (...k) => new Set(k);

test('ground forward and right are unit vectors at right angles, for every facing', () => {
  for (const yaw of [0, 0.7, ISO.az, Math.PI, -2.1, 9.4]) {
    const f = forwardOnGround(yaw), r = rightOnGround(yaw);
    close(Math.hypot(f.x, f.z), 1);
    close(Math.hypot(r.x, r.z), 1);
    close(f.x * r.x + f.z * r.z, 0);
  }
});

test('at yaw 0 forward is -z and right is +x; W walks away from the viewer', () => {
  closePt(forwardOnGround(0), { x: 0, z: -1 });
  closePt(rightOnGround(0), { x: 1, z: 0 });
});

test('the isometric forward points from the camera toward the town at the default angle', () => {
  const p = orbitPose(0, 0, ISO.az, ISO.elev, 150);
  const toTarget = { x: -p.x, z: -p.z }, n = Math.hypot(toTarget.x, toTarget.z);
  closePt(forwardOnGround(ISO.az), { x: toTarget.x / n, z: toTarget.z / n });
});

test('orbit pose sits above the target at the requested distance', () => {
  const p = orbitPose(5, -3, 1.1, 0.4, 100);
  close(p.y, Math.sin(0.4) * 100);
  close(Math.hypot(p.x - 5, p.z + 3), Math.cos(0.4) * 100);
});

test('held keys become a movement intent; opposite keys cancel', () => {
  assert.deepEqual(intentOf(keys('w')), { f: 1, s: 0, u: 0, r: 0, t: 0, fast: 1 });
  assert.deepEqual(intentOf(keys('w', 'd')), { f: 1, s: 1, u: 0, r: 0, t: 0, fast: 1 });
  assert.equal(intentOf(keys('w', 's')).f, 0);
  assert.equal(intentOf(keys('a', 'd')).s, 0);
  assert.equal(intentOf(keys('e')).u, 1);
  assert.equal(intentOf(keys('q')).u, -1);
  assert.equal(intentOf(keys('arrowright')).r, 1);
  assert.equal(intentOf(keys('arrowup')).t, 1);
  assert.equal(intentOf(keys('shift', 'w')).fast, 2.5);
});

test('W moves the orbit focus toward the top of the screen, D to the right', () => {
  const w = orbitMove(intentOf(keys('w')), 0, 92, 1 / 60);
  assert.ok(w.dz < 0 && Math.abs(w.dx) < 1e-9);
  const d = orbitMove(intentOf(keys('d')), 0, 92, 1 / 60);
  assert.ok(d.dx > 0 && Math.abs(d.dz) < 1e-9);
});

test('after a quarter turn W still walks away from the viewer', () => {
  const az = Math.PI / 2;
  const w = orbitMove(intentOf(keys('w')), az, 92, 1);
  const fwd = forwardOnGround(az);
  closePt({ x: w.dx / Math.hypot(w.dx, w.dz), z: w.dz / Math.hypot(w.dx, w.dz) }, fwd);
});

test('diagonal orbit movement is no faster than straight movement', () => {
  const straight = orbitMove(intentOf(keys('w')), 0.3, 92, 1);
  const diag = orbitMove(intentOf(keys('w', 'd')), 0.3, 92, 1);
  close(Math.hypot(diag.dx, diag.dz), Math.hypot(straight.dx, straight.dz), 1e-9);
});

test('orbit spin: arrows rotate and tilt at a steady rate, scaled by time', () => {
  const s = orbitSpin(intentOf(keys('arrowright')), 0.5);
  assert.ok(s.dAz > 0 && s.dElev === 0);
  close(orbitSpin(intentOf(keys('arrowright')), 1).dAz, 2 * s.dAz);
  assert.ok(orbitSpin(intentOf(keys('arrowup')), 0.5).dElev > 0);
});

test('free velocity eases toward the wanted speed and diagonals are not faster', () => {
  let v = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 300; i++) v = flyVelocity(v, intentOf(keys('w')), 0.4, 0, 9, 1 / 60);
  close(Math.hypot(v.x, v.y, v.z), 9, 1e-3);
  let d = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 300; i++) d = flyVelocity(d, intentOf(keys('w', 'd')), 0.4, 0, 9, 1 / 60);
  close(Math.hypot(d.x, d.y, d.z), 9, 1e-3);
});

test('free velocity: Shift is faster, and the first frame only starts to move', () => {
  const v1 = flyVelocity({ x: 0, y: 0, z: 0 }, intentOf(keys('w')), 0, 0, 9, 1 / 60);
  assert.ok(Math.hypot(v1.x, v1.y, v1.z) < 9 * 0.5);
  let fast = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 300; i++) fast = flyVelocity(fast, intentOf(keys('w', 'shift')), 0, 0, 9, 1 / 60);
  close(Math.hypot(fast.x, fast.y, fast.z), 9 * 2.5, 1e-2);
});

test('free fly moves along the look direction, so W with pitch goes up or down', () => {
  let v = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 300; i++) v = flyVelocity(v, intentOf(keys('w')), 0.2, 0.5, 9, 1 / 60);
  assert.ok(v.y > 0);
  let d = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 300; i++) d = flyVelocity(d, intentOf(keys('w')), 0.2, -0.5, 9, 1 / 60);
  assert.ok(d.y < 0);
});

test('free camera stays above the streets and inside the town', () => {
  let p = flyMove({ x: 0, y: 5, z: 0 }, { x: 0, y: -1000, z: 1000 }, 1);
  assert.equal(p.y, EYE_MIN);
  assert.equal(p.z, FLY_LIMIT);
  p = flyMove({ x: 0, y: 5, z: 0 }, { x: -1000, y: 1000, z: 0 }, 1);
  assert.equal(p.y, EYE_MAX);
  assert.equal(p.x, -FLY_LIMIT);
});

test('dragging right turns right and dragging down looks down; pitch is clamped', () => {
  const r = lookChange(0.5, 0, 40, 0);
  assert.ok(r.yaw < 0.5);
  const dn = lookChange(0.5, 0, 0, 40);
  assert.ok(dn.pitch < 0);
  const hi = lookChange(0, 0, 0, -1e6);
  assert.equal(hi.pitch, FLY_PITCH);
  const lo = lookChange(0, 0, 0, 1e6);
  assert.equal(lo.pitch, -FLY_PITCH);
});

test('free-fly starts behind and above the orbit focus, looking at it', () => {
  for (const az of [0, ISO.az, 2.4, -1.1]) {
    const s = flyStart(10, -4, az);
    assert.equal(s.pos.y, START.height);
    assert.ok(s.pitch < 0);
    const hit = isoTargetFrom(s.pos, s.yaw, s.pitch);
    closePt(hit, { x: 10, z: -4 }, 1e-6);
  }
});

test('leaving free-fly keeps the place you were looking at', () => {
  const s = flyStart(-20, 15, 0.9);
  const moved = { x: s.pos.x + 7, y: s.pos.y, z: s.pos.z - 3 };
  const t = isoTargetFrom(moved, s.yaw, s.pitch);
  // moving the eye sideways moves the hit point by the same amount
  const t0 = isoTargetFrom(s.pos, s.yaw, s.pitch);
  close(t.x - t0.x, 7, 1e-6);
  close(t.z - t0.z, -3, 1e-6);
});

test('looking up at the sky still gives a sane orbit target, clamped to the town', () => {
  const t = isoTargetFrom({ x: 0, y: 3, z: 0 }, 0, 0.3);
  assert.ok(Math.abs(t.x) <= TOWN_LIMIT && Math.abs(t.z) <= TOWN_LIMIT);
  const far = isoTargetFrom({ x: 0, y: 3, z: 0 }, 0, -0.01);
  assert.ok(Math.abs(far.z) <= TOWN_LIMIT);
});

test('easing moves toward the target without overshooting, and holds when dt is zero', () => {
  assert.equal(approach(0, 10, 5, 0), 0);
  let v = 0;
  for (let i = 0; i < 600; i++) { v = approach(v, 10, 5, 1 / 60); assert.ok(v <= 10 + 1e-9); }
  close(v, 10, 1e-3);
  assert.equal(approach(0, 10, 5, 1e6), 10);
});

test('zoom stays inside its limits', () => {
  assert.equal(zoomStep(1, 100), 3);
  assert.equal(zoomStep(1, 0.001), 0.55);
  close(zoomStep(1, 1.12), 1.12);
  assert.equal(clamp(5, 0, 1), 1);
});

test('Q and E turn the orbit view, E to the right, and keep turning while held', () => {
  assert.ok(orbitSpin(intentOf(keys('e')), 0.5).dAz > 0);
  assert.ok(orbitSpin(intentOf(keys('q')), 0.5).dAz < 0);
  close(orbitSpin(intentOf(keys('e')), 1).dAz, orbitSpin(intentOf(keys('arrowright')), 1).dAz);
});

// The far ground ends 480 units from the middle (render/terrain.js OUT_HALF) and the fog hides it from about 340 units
// of depth, so the orbit view must never show ground past that: at the lowest tilt, furthest zoom-out, widest window and
// furthest pan, the four corner rays of the view must land on ground within reach.
test('the orbit view never shows the end of the land', () => {
  const REACH = 480 - 20, H = 46 / 0.55; // visible half-height at the furthest zoom-out
  for (const aspect of [1.78, 2.4, 3.6]) for (const az of [0, 0.8, ISO.az, 2.4, 4]) for (const elev of [ISO.elevMin, 0.6, ISO.elevMax]) {
    for (const [tx, tz] of [[0, 0], [TOWN_LIMIT, TOWN_LIMIT], [-TOWN_LIMIT, TOWN_LIMIT], [TOWN_LIMIT, -TOWN_LIMIT]]) {
      const p = orbitPose(tx, tz, az, elev, 150);
      const d = { x: tx - p.x, y: -p.y, z: tz - p.z }, dl = Math.hypot(d.x, d.y, d.z);
      d.x /= dl; d.y /= dl; d.z /= dl;
      const right = { x: -d.z, y: 0, z: d.x }, rl = Math.hypot(right.x, right.z); right.x /= rl; right.z /= rl;
      const up = { x: right.y * d.z - right.z * d.y, y: right.z * d.x - right.x * d.z, z: right.x * d.y - right.y * d.x };
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const o = { x: p.x + (sx * H * aspect) * right.x + sy * H * up.x, y: p.y + sy * H * up.y, z: p.z + (sx * H * aspect) * right.z + sy * H * up.z };
        const t = -o.y / d.y;
        assert.ok(t > -400 && t < 900, `the ground meets the corner ray inside the depth range (${t | 0})`);
        const gx = o.x + d.x * t, gz = o.z + d.z * t;
        assert.ok(Math.max(Math.abs(gx), Math.abs(gz)) < REACH, `aspect ${aspect} az ${az} elev ${elev}: the view reaches ${gx | 0},${gz | 0}`);
      }
    }
  }
});
