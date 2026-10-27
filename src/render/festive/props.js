// Festive props by the door of every dressed building, as coloured primitives merged into one vertex-coloured geometry:
// pumpkins on the step for Halloween, a wreath on the door for Christmas, a little flag and a run of bunting for the
// Fourth of July. Shapes are in the building's own frame (front is +z, the door at its site); the system merges them.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { LANG } from '../../world/models.js';
import { luck } from './strings.js';

const { PLINTH, FLOOR_H: FH } = LANG;
const ORANGE = 0xE07B39, ORANGE2 = 0xC9662B, STEM = 0x4F6B34, FACE = 0x3A2418, GHOST = 0xF4EFE4;
const FIR = 0x2F6B45, FIR2 = 0x3F8455, RED = 0xC2483A, GOLD = 0xF2D27A, WHITE = 0xF7F1E3, BLUE = 0x3F6FB0, POLE = 0x4A3F36, CARROT = 0xE8873A;

const ball = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, n = 6) => new THREE.CylinderGeometry(rt, rb, h, n);

// A part: [geometry, colour, x, y, z, sx?, sy?, sz?, rx?, ry?, rz?]
function pumpkin(x, z, r, out) {
  out.push([ball(r), ORANGE, x, PLINTH + r * 0.75, z, 1.15, 0.78, 1.15]);
  out.push([ball(r * 0.98), ORANGE2, x, PLINTH + r * 0.75, z, 0.6, 0.8, 1.2]); // the ribs
  out.push([cyl(0.025, 0.035, 0.12), STEM, x, PLINTH + r * 1.45, z]);
  if (r > 0.2) { // a carved face towards the street
    out.push([box(0.07, 0.06, 0.02), FACE, x - 0.08, PLINTH + r * 0.95, z + r * 1.1]);
    out.push([box(0.07, 0.06, 0.02), FACE, x + 0.08, PLINTH + r * 0.95, z + r * 1.1]);
    out.push([box(0.2, 0.04, 0.02), FACE, x, PLINTH + r * 0.55, z + r * 1.12]);
  }
}

// The parts for one building's door. `seed` varies them between houses; `body` is the main body (for bunting).
export function propsFor(event, door, body, seed) {
  const out = [], [dx, dz] = door, z = dz + 0.25;
  if (event === 'halloween') {
    pumpkin(dx - 0.6, z, 0.24, out);
    if (luck(seed, 31) < 0.7) pumpkin(dx + 0.6, z, 0.18 + 0.08 * luck(seed, 32), out);
    if (luck(seed, 33) < 0.35) pumpkin(dx + 0.85, z + 0.15, 0.13, out);
    if (luck(seed, 34) < 0.3 && body) { // a little ghost under the eave
      const gx = body.x - body.w / 2 + 0.5, gy = body.y0 + body.floors * FH - 0.45, gz = body.z + body.d / 2 + 0.2;
      out.push([new THREE.ConeGeometry(0.16, 0.38, 7), GHOST, gx, gy, gz]);
      out.push([ball(0.12), GHOST, gx, gy + 0.2, gz]);
    }
  } else if (event === 'christmas') {
    const wy = PLINTH + 0.72;
    out.push([new THREE.TorusGeometry(0.17, 0.065, 5, 10), FIR, dx, wy, dz + 0.04]);
    for (let i = 0; i < 5; i++) { const a = i * 1.257 + 0.4; out.push([ball(0.03, 0), i % 2 ? GOLD : RED, dx + Math.cos(a) * 0.17, wy + Math.sin(a) * 0.17, dz + 0.1]); }
    out.push([box(0.12, 0.08, 0.04), RED, dx, wy - 0.16, dz + 0.1]);
    if (luck(seed, 41) < 0.35) { // a snowman by the step
      const sx = dx + 0.85;
      out.push([ball(0.24), WHITE, sx, PLINTH + 0.2, z + 0.1]);
      out.push([ball(0.17), WHITE, sx, PLINTH + 0.52, z + 0.1]);
      out.push([new THREE.ConeGeometry(0.03, 0.14, 5), CARROT, sx, PLINTH + 0.53, z + 0.3, 1, 1, 1, Math.PI / 2]);
      out.push([cyl(0.09, 0.11, 0.12, 8), POLE, sx, PLINTH + 0.7, z + 0.1]);
    } else if (luck(seed, 42) < 0.5) { // or a little fir in a pot
      out.push([cyl(0.13, 0.1, 0.18), RED, dx - 0.7, PLINTH + 0.09, z]);
      out.push([new THREE.ConeGeometry(0.22, 0.55, 6), FIR2, dx - 0.7, PLINTH + 0.45, z]);
      out.push([ball(0.04, 0), GOLD, dx - 0.7, PLINTH + 0.75, z]);
    }
  } else if (event === 'snoopy') {
    // a red doghouse by the step with a white beagle asleep on the roof, and (on some houses) a kite up on a string
    const hx = dx - 0.9, hz = z + 0.15;
    out.push([box(0.5, 0.36, 0.5), RED, hx, PLINTH + 0.18, hz]);
    out.push([box(0.2, 0.2, 0.04), FACE, hx, PLINTH + 0.12, hz + 0.26]);
    out.push([new THREE.ConeGeometry(0.42, 0.26, 4), 0xA83A2D, hx, PLINTH + 0.49, hz, 1, 1, 1, 0, Math.PI / 4]);
    if (luck(seed, 51) < 0.8) { // the beagle, lying along the ridge
      out.push([ball(0.1), WHITE, hx, PLINTH + 0.68, hz]);
      out.push([box(0.3, 0.1, 0.12), WHITE, hx - 0.14, PLINTH + 0.64, hz]);
      out.push([box(0.04, 0.12, 0.06), FACE, hx + 0.08, PLINTH + 0.66, hz + 0.08]);
      out.push([ball(0.03, 0), FACE, hx + 0.19, PLINTH + 0.7, hz]);
    }
    if (luck(seed, 52) < 0.6 && body) kite(body, seed, out);
  } else if (event === 'july4') {
    // a flag on a short pole leaning out from the wall by the door
    const fx = dx + 0.55, fy = PLINTH + 1.15, lean = 0.6;
    out.push([cyl(0.02, 0.02, 0.8), POLE, fx, fy, dz + 0.25, 1, 1, 1, lean]);
    const ox = fx, oy = fy + 0.3, oz = dz + 0.5;
    for (let i = 0; i < 4; i++) out.push([box(0.42, 0.06, 0.02), i % 2 ? WHITE : RED, ox + 0.21, oy - i * 0.06, oz]);
    out.push([box(0.17, 0.12, 0.025), BLUE, ox + 0.085, oy - 0.03, oz + 0.005]);
    if (body) bunting(body, out);
  }
  return out;
}

// A kite held up over the roof on a long thin string, with a tail of little bows.
function kite(body, seed, out) {
  const x = body.x + (luck(seed, 53) - 0.5) * body.w * 0.6, z = body.z + body.d / 2 + 0.3;
  const top = body.y0 + body.floors * FH, ky = top + 1.1 + luck(seed, 54) * 0.5, lean = 0.25;
  const colour = [RED, GOLD, BLUE, CARROT][Math.floor(luck(seed, 55) * 4)];
  out.push([cyl(0.01, 0.01, ky - top + 0.1), POLE, x, (ky + top) / 2, z, 1, 1, 1, lean]);          // the string
  out.push([box(0.34, 0.34, 0.02), colour, x - 0.12, ky, z + 0.1, 1, 1, 1, 0, 0, Math.PI / 4]);     // the diamond
  out.push([box(0.02, 0.4, 0.025), WHITE, x - 0.12, ky, z + 0.115, 1, 1, 1, 0, 0, 0]);              // the spar
  for (let i = 1; i <= 3; i++) out.push([box(0.07, 0.05, 0.02), i % 2 ? WHITE : RED, x - 0.12 - i * 0.04, ky - 0.28 - i * 0.14, z + 0.1]);
}

// Triangle pennants along the front, under the eave, in red, white and blue.
function bunting(body, out) {
  const y = body.y0 + body.floors * FH - 0.32, z = body.z + body.d / 2 + 0.14;
  const n = Math.max(3, Math.round(body.w / 0.32));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = body.x - body.w / 2 + t * body.w, sag = 0.12 * 4 * t * (1 - t);
    out.push([new THREE.ConeGeometry(0.1, 0.2, 3), [RED, WHITE, BLUE][i % 3], x, y - sag, z, 1, 1, 0.25, Math.PI]);
  }
}

// Merges every part of `list` ({ parts, world } where world is a THREE.Matrix4) into one vertex-coloured geometry.
// `grow` fattens each part about its own centre, for the ink outline.
export function mergeProps(list, grow = 1) {
  const pos = [], nor = [], col = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  for (const { parts, world } of list) {
    for (const [geo0, hex, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0] of parts) {
      const g = geo0.index ? geo0.toNonIndexed() : geo0.clone();
      g.scale(sx * grow, sy * grow, sz * grow);
      g.applyMatrix4(m.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), s.set(1, 1, 1)));
      if (world) g.applyMatrix4(world);
      g.computeVertexNormals();
      c.setHex(hex);
      const p = g.attributes.position.array, n = g.attributes.normal.array;
      for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); col.push(c.r, c.g, c.b); }
      g.dispose();
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
