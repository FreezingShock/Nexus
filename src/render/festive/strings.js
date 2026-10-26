// Where string lights hang. Pure (no THREE), so node tests cover it. A string runs between hooks along an eave and
// droops a little between each pair; bulbs sit at an even spacing along it. Trees get a spiral wound round the canopy.
// Every function calls `put(x, y, z, i)` per bulb, with i counting along the string (the colour comes from i), and
// `wire(x0, y0, z0, x1, y1, z1)` per piece of cable between bulbs when given.
import { LANG } from '../../world/models.js';

const { FLOOR_H: FH } = LANG;
export const SPACING = 0.42;  // between bulbs, world units
export const HOOKS = 1.5;     // between hooks: one droop per bay
export const SAG = 0.16;      // how far a string droops between hooks
const OUT = 0.1;              // proud of the wall
const DROP = 0.06;            // under the eave line

// A drooping string from (ax, az) to (bx, bz) at height y. Returns the number of bulbs.
export function hangString(ax, az, bx, bz, y, put, wire, i0 = 0) {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.2) return 0;
  const hooks = Math.max(1, Math.round(len / HOOKS)), n = Math.max(2, Math.round(len / SPACING) + 1);
  let px = ax, py = y, pz = az;
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1), u = (t * hooks) % 1;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const yy = y - SAG * 4 * u * (1 - u); // a parabola between hooks
    if (k > 0 && wire) wire(px, py, pz, x, yy, z);
    put(x, yy, z, i0 + k);
    px = x; py = yy; pz = z;
  }
  return n;
}

// The strings round one body ({ x, z, y0, w, d, floors }) in the building's own frame: along the eave of the front, and
// of every face when `all`. Front is +z. Returns the bulbs placed.
export function bodyStrings(body, put, wire, all = true) {
  const y = body.y0 + body.floors * FH - DROP;
  const hx = body.w / 2 + OUT, hz = body.d / 2 + OUT, x = body.x, z = body.z;
  const corners = [[x - hx, z + hz], [x + hx, z + hz], [x + hx, z - hz], [x - hx, z - hz]];
  let n = 0;
  for (let f = 0; f < (all ? 4 : 1); f++) {
    const [ax, az] = corners[f], [bx, bz] = corners[(f + 1) % 4];
    n += hangString(ax, az, bx, bz, y, put, wire, n);
  }
  return n;
}

// A spiral wound round a canopy or a cone: from `bottom` to `top` (heights), radius r0 at the bottom easing to r1 at the
// top, `turns` times round, starting at angle a0. Returns the bulbs placed.
export function spiral(cx, cz, bottom, top, r0, r1, turns, a0, put, wire) {
  const len = turns * Math.PI * (r0 + r1); // about the length of the coil
  const n = Math.max(4, Math.round(len / SPACING));
  let px = 0, py = 0, pz = 0;
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1), a = a0 + t * turns * Math.PI * 2, r = r0 + (r1 - r0) * t;
    const x = cx + Math.cos(a) * r, y = bottom + (top - bottom) * t, z = cz + Math.sin(a) * r;
    if (k > 0 && wire) wire(px, py, pz, x, y, z);
    put(x, y, z, k);
    px = x; py = y; pz = z;
  }
  return n;
}

// A steady 0..1 number for a building or tree and a salt: decides who decorates as the event's cover grows.
export function luck(seed, salt = 0) {
  let h = Math.imul((seed | 0) ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul(salt + 1, 0xC2B2AE35);
  h ^= h >>> 13; h = Math.imul(h, 0x27D4EB2F); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
