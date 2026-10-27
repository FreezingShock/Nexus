// The Snoopy Days beagle and his red doghouse as small low-poly parts, shared by the doghouse on the doorstep
// (festive/props.js) and the doghouse decoration (decor-geom.js). Proportions follow the 3D preview nate approved: a big
// head (round skull and a long blunt muzzle) on a short thin neck with a black collar, a pear body, long black ears.
// A part is [geometry centred on its own origin, colour, x, y, z] so an outline can grow each part about its centre.
import * as THREE from '../../../vendor/three/three.module.min.js';

const WHITE = 0xF7F1E3, INK = 0x2B2620, RED = 0xC2483A, ROOF = 0xA83A2D, CREAM = 0xF3E9D2, CAP = 0x7A4A2E, GOLD = 0xE6BC62, GLASS = 0xCFE6F2;
const ball = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, n = 8) => new THREE.CylinderGeometry(rt, rb, h, n);

// A solid gabled roof: a triangle w wide and h tall, run along x for `len`, centred on its own origin.
export function gable(w, h, len) {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  return g.rotateY(Math.PI / 2).translate(-len / 2, -h / 2, 0);
}

// A beagle sitting with his legs out in front, `size` tall, facing +z, his seat at y 0. `ace` adds the leather cap,
// goggles and a red scarf.
export function sittingBeagle(size = 1, ace = false) {
  const k = size, p = (geo, color, x, y, z) => [geo.scale(k, k, k), color, x * k, y * k, z * k];
  const out = [
    p(ball(0.2).scale(1, 1.15, 0.95), WHITE, 0, 0.21, 0), // pear body
    p(ball(0.11).scale(0.55, 1.1, 1.1), INK, 0, 0.24, -0.17), // black patch on the back
    p(cyl(0.055, 0.06, 0.16), WHITE, 0, 0.45, 0), // neck
    p(cyl(0.07, 0.07, 0.035, 10), INK, 0, 0.47, 0), // collar
    p(ball(0.2).scale(1, 1.05, 1), WHITE, 0, 0.7, -0.03), // skull
    p(ball(0.17).scale(0.85, 0.72, 1.15), WHITE, 0, 0.64, 0.15), // muzzle
    p(ball(0.05, 6, 4).scale(1.1, 0.9, 1), INK, 0, 0.67, 0.34), // nose
    p(new THREE.ConeGeometry(0.035, 0.14, 5).rotateX(-0.9), WHITE, 0, 0.13, -0.24), // tail
  ];
  for (const s of [-1, 1]) {
    out.push(
      p(box(0.07, 0.07, 0.24), WHITE, s * 0.09, 0.06, 0.15), // leg out in front
      p(ball(0.07, 6, 5).scale(1, 0.8, 1.5), WHITE, s * 0.09, 0.06, 0.3), // foot
      p(ball(0.055, 6, 4), WHITE, s * 0.19, 0.2, 0.08), // hand on the knee
      p(box(0.015, 0.045, 0.025), INK, s * 0.12, 0.79, 0.11), // eye
      p(box(0.015, 0.012, 0.07).rotateX(0.5), INK, s * 0.135, 0.6, 0.15), // smile at the back of the muzzle
      p(ball(0.12, 6, 5).scale(0.22, 1.1, 0.6).rotateZ(s * 0.18), INK, s * 0.2, 0.63, -0.05), // long black ear
    );
  }
  if (ace) {
    out.push(
      p(new THREE.SphereGeometry(0.215, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(-0.25), CAP, 0, 0.71, -0.04),
      p(cyl(0.085, 0.085, 0.035, 10), RED, 0, 0.46, 0), // scarf wrapped round the neck
      p(box(0.05, 0.08, 0.36).rotateX(-0.3), RED, 0.04, 0.48, -0.24), // its tail streaming back
    );
    for (const s of [-1, 1]) {
      out.push(p(cyl(0.05, 0.05, 0.03).rotateX(-1.1), GOLD, s * 0.08, 0.86, 0.1), p(cyl(0.036, 0.036, 0.034).rotateX(-1.1), GLASS, s * 0.08, 0.862, 0.102));
    }
  }
  return out;
}

// The red doghouse, w wide on the ground at y 0 facing +z: planked walls, a deep red gable roof with cream trim and a
// round-topped doorway. `pet` puts the beagle sitting on the ridge (`'ace'` for the flying ace).
export function doghouse(w = 1, pet = true) {
  const h = w * 0.7, rh = w * 0.5, out = [
    [box(w, h, w), RED, 0, h / 2, 0],
    [gable(w * 1.24, rh, w * 1.16), ROOF, 0, h + rh / 2 - w * 0.02, 0],
    [box(w * 1.2, w * 0.05, w * 0.05), CREAM, 0, h + rh - w * 0.02, 0], // ridge board
    [box(w * 0.4, h * 0.5, w * 0.04), INK, 0, h * 0.25, w / 2], // doorway
    [cyl(w * 0.2, w * 0.2, w * 0.04, 10).rotateX(Math.PI / 2), INK, 0, h * 0.5, w / 2],
    [box(w * 0.5, w * 0.05, w * 0.05), CREAM, 0, h * 0.86, w / 2 + w * 0.01], // trim over the door
  ];
  for (const y of [0.3, 0.6]) out.push([box(w * 1.01, w * 0.012, w * 1.01), 0x8E3328, 0, h * y, 0]); // plank lines
  if (pet) {
    const s = w * 0.55;
    for (const [geo, c, x, y, z] of sittingBeagle(s, pet === 'ace')) out.push([geo, c, x, y + h + rh - w * 0.07, z]);
  }
  return out;
}
