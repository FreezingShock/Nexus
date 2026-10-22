// Pure camera math: no Three.js and no DOM, so the tests can run it in node.
import { GRID_HALF, TILE } from '../world/grid.js';
// Conventions: yaw 0 looks toward -z; increasing yaw turns left. Pitch is positive when looking up.
// The orbit (isometric) camera sits at target + (sin az, cos az) * dist and looks back at the target.

export const ISO = { az: Math.PI / 4, elev: 0.62, elevMin: 0.38, elevMax: 1.42 };
// elevMin keeps the view high enough that the far ground (480 units out, see render/terrain.js) always fills the top of the screen.
export const TOWN_LIMIT = 70;      // the orbit target stays this close to the middle of the town
export const FLY_LIMIT = GRID_HALF * TILE; // the free camera may roam to the edge of the grid (3 units a tile)
export const EYE_MIN = 1.5;        // lowest free-camera height: just above the streets
export const EYE_MAX = 60;
export const FLY_PITCH = 1.45;     // free camera can look almost straight up or down
export const START = { dist: 12, height: 6 }; // where free-fly begins: behind and above the orbit target

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Frame-rate independent easing toward a target: `rate` is roughly how fast it settles (1/s).
export const approach = (cur, target, rate, dt) => cur + (target - cur) * Math.min(1, Math.max(0, dt) * rate);

// Ground directions for the current facing (x/z only). Forward is away from the viewer.
export function forwardOnGround(yaw) { return { x: -Math.sin(yaw), z: -Math.cos(yaw) }; }
export function rightOnGround(yaw) { return { x: Math.cos(yaw), z: -Math.sin(yaw) }; }

// Full 3D look direction of the free camera.
export function lookDir(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

// Held keys to a movement intent. f: forward (+1) or back (-1). s: strafe right (+1) or left (-1). u: up (+1) or down (-1).
// W and S, or A and D, cancel out. Rotation (r) and tilt (t) are for the orbit view and arrows.
export function intentOf(keys) {
  const has = (k) => keys.has(k) ? 1 : 0;
  return {
    f: has('w') - has('s'),
    s: has('d') - has('a'),
    u: has('e') - has('q'),
    r: has('arrowright') - has('arrowleft'),
    t: has('arrowup') - has('arrowdown'),
    fast: has('shift') ? 2.5 : 1,
  };
}

// Orbit camera position for a target, yaw, pitch and distance.
export function orbitPose(tx, tz, az, elev, dist) {
  const ce = Math.cos(elev);
  return { x: tx + Math.sin(az) * ce * dist, y: Math.sin(elev) * dist, z: tz + Math.cos(az) * ce * dist };
}

// Ground movement for the orbit view, in world units per second. `visible` is the visible height of the view.
export function orbitMove(intent, az, visible, dt) {
  const n = Math.hypot(intent.f, intent.s) || 1; // diagonals are not faster
  const speed = (visible * 0.35 * intent.fast * dt) / n;
  const fwd = forwardOnGround(az), right = rightOnGround(az);
  return {
    dx: (fwd.x * intent.f + right.x * intent.s) * speed,
    dz: (fwd.z * intent.f + right.z * intent.s) * speed,
  };
}

// Orbit rotation and tilt driven by held keys, per second. E turns right, Q turns left, arrows do the same.
export function orbitSpin(intent, dt) {
  return { dAz: (intent.r + intent.u) * 1.3 * dt, dElev: intent.t * 0.9 * dt };
}

// Free-camera velocity. Eases toward the wanted velocity so starts and stops feel soft. Diagonals are not faster.
export function flyVelocity(vel, intent, yaw, pitch, base, dt) {
  const fw = lookDir(yaw, pitch), rt = rightOnGround(yaw);
  let x = fw.x * intent.f + rt.x * intent.s;
  let y = fw.y * intent.f + intent.u;
  let z = fw.z * intent.f + rt.z * intent.s;
  const len = Math.hypot(x, y, z);
  if (len > 1) { x /= len; y /= len; z /= len; }
  const speed = base * intent.fast;
  const k = Math.min(1, dt * 9);
  return {
    x: vel.x + (x * speed - vel.x) * k,
    y: vel.y + (y * speed - vel.y) * k,
    z: vel.z + (z * speed - vel.z) * k,
  };
}

// Moves the free camera by its velocity and keeps it inside the town and above the streets.
export function flyMove(pos, vel, dt) {
  return {
    x: clamp(pos.x + vel.x * dt, -FLY_LIMIT, FLY_LIMIT),
    y: clamp(pos.y + vel.y * dt, EYE_MIN, EYE_MAX),
    z: clamp(pos.z + vel.z * dt, -FLY_LIMIT, FLY_LIMIT),
  };
}

// Mouse drag or arrows while in free-fly: changes yaw and pitch. Dragging right turns right, dragging down looks down.
export function lookChange(yaw, pitch, dx, dy) {
  return {
    yaw: yaw - dx * 0.0032,
    pitch: clamp(pitch - dy * 0.0032, -FLY_PITCH, FLY_PITCH),
  };
}

// Where free-fly starts: standing a little behind the orbit target and looking at it.
export function flyStart(tx, tz, az) {
  const h = START.height, d = START.dist;
  return {
    pos: { x: tx + Math.sin(az) * d, y: h, z: tz + Math.cos(az) * d },
    yaw: az,
    pitch: -Math.atan2(h, d),
  };
}

// The orbit target that matches a free-camera pose: where its forward ray meets the ground.
export function isoTargetFrom(pos, yaw, pitch) {
  const fw = lookDir(yaw, pitch);
  const t = fw.y < -1e-3 ? -pos.y / fw.y : 40;
  return {
    x: clamp(pos.x + fw.x * t, -TOWN_LIMIT, TOWN_LIMIT),
    z: clamp(pos.z + fw.z * t, -TOWN_LIMIT, TOWN_LIMIT),
  };
}

// Wheel zoom for the orbit view: each notch multiplies the zoom and the result is clamped.
export function zoomStep(zoom, factor) { return clamp(zoom * factor, 0.55, 3); }
