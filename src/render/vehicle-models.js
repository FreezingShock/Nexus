// Car, van, pickup and bus models in the illustrated low-poly style. Each model is built from boxes and cylinders and
// merged into two geometries: a painted body (tinted per vehicle by the instance colour) and trim with its own vertex
// colours (glass, wheels, lamps, load). Plus the ink edges of the shell and glass as a template for the line buffer.
// Local axes: +x is forward, +y up, ground at y = 0. Pure geometry, no scene.
import * as THREE from '../../vendor/three/three.module.min.js';

export const GLASS = 0xA9BFC4, TYRE = 0x3A342E, HUB = 0xCFC4AE, LAMP = 0xFFEFC2, TAIL = 0xC2574A, BUMPER = 0x5A5147, CRATE = 0xB98B5A, SACK = 0xE3D2A8;

// Hatchback, saloon, estate, city car, van and pickup. Sizes are world units (a tile is 3).
export const CAR_SPECS = [
  { name: 'hatchback', bl: 1.3, bh: 0.4, bw: 0.8, cl: 0.78, ch: 0.36, cw: 0.72, cx: -0.14, taper: 0.72, wr: 0.17 },
  { name: 'saloon', bl: 1.66, bh: 0.38, bw: 0.82, cl: 0.78, ch: 0.34, cw: 0.7, cx: -0.12, taper: 0.62, wr: 0.17 },
  { name: 'estate', bl: 1.62, bh: 0.4, bw: 0.82, cl: 1.12, ch: 0.38, cw: 0.72, cx: -0.16, taper: 0.8, wr: 0.17 },
  { name: 'city car', bl: 1.04, bh: 0.42, bw: 0.74, cl: 0.62, ch: 0.4, cw: 0.66, cx: -0.04, taper: 0.8, wr: 0.15 },
  { name: 'van', bl: 1.55, bh: 0.42, bw: 0.86, cl: 0.5, ch: 0.34, cw: 0.78, cx: 0.5, taper: 0.9, wr: 0.18, boxy: true },
  { name: 'pickup', bl: 1.7, bh: 0.34, bw: 0.84, cl: 0.52, ch: 0.38, cw: 0.74, cx: 0.34, taper: 0.7, wr: 0.18, bed: true },
];
export const BUS_SPEC = { name: 'bus', bl: 2.4, bh: 0.62, bw: 1.06, cl: 2.15, ch: 0.34, cw: 1.0, cx: -0.02, taper: 1, wr: 0.2, bus: true };

const m4 = new THREE.Matrix4(), eul = new THREE.Euler(), qq = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);

// Collects parts as non-indexed geometry with a colour per vertex.
class Parts {
  constructor() { this.pos = []; this.nor = []; this.col = []; }
  add(geo, x, y, z, hex = 0xffffff, rx = 0, ry = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    m4.compose(new THREE.Vector3(x, y, z), qq.setFromEuler(eul.set(rx, ry, rz)), one);
    g.applyMatrix4(m4);
    const p = g.attributes.position, n = g.attributes.normal, c = new THREE.Color(hex);
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      this.col.push(c.r, c.g, c.b);
    }
    return this;
  }
  geometry(withColour) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    if (withColour) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

// A box whose top is narrower in x by `k` (a windscreen and rear-window slope).
function sloped(l, h, w, k) {
  const g = new THREE.BoxGeometry(l, h, w);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setX(i, p.getX(i) * k);
  return g;
}
const box = (l, h, w) => new THREE.BoxGeometry(l, h, w);
const wheel = (r) => new THREE.CylinderGeometry(r, r, 0.15, 8);

// Builds one vehicle. Returns { body, trim, edges } where edges is a flat array of line-segment vertices.
export function buildVehicle(s) {
  const body = new Parts(), trim = new Parts(), edges = [];
  const edge = (geo, x, y, z) => {
    const p = new THREE.EdgesGeometry(geo, 30).attributes.position;
    for (let i = 0; i < p.count; i++) edges.push(p.getX(i) + x, p.getY(i) + y, p.getZ(i) + z);
  };
  const clear = s.wr * 0.9;                      // underbody clearance
  const by = clear + s.bh / 2;                   // centre of the lower shell
  const shell = box(s.bl, s.bh, s.bw);
  body.add(shell, 0, by, 0);
  edge(shell, 0, by, 0);

  // glass house on top of the shell, with a roof slab in the body colour
  const gy = clear + s.bh + s.ch / 2 - 0.02;
  const house = sloped(s.cl, s.ch, s.cw, s.taper);
  trim.add(house, s.cx, gy, 0, GLASS);
  edge(house, s.cx, gy, 0);
  const roof = box(s.cl * (s.bus ? 1 : s.taper + 0.08), 0.05, s.cw + 0.06);
  const ry = gy + s.ch / 2 + 0.015;
  body.add(roof, s.cx, ry, 0);
  edge(roof, s.cx, ry, 0);
  // pillars: thin body-coloured posts so the glass reads as windows
  if (!s.bus) {
    const pw = 0.05;
    for (const px of [-s.cl * 0.18, s.cl * 0.18]) body.add(box(pw, s.ch - 0.02, s.cw + 0.02), s.cx + px * (s.boxy ? 0.2 : 1), gy, 0);
  } else {
    for (let k = -3; k <= 3; k++) body.add(box(0.05, s.ch - 0.02, s.cw + 0.02), s.cx + k * 0.3, gy, 0);
  }

  // van: a tall cargo box behind the cab
  if (s.boxy) {
    const cl = s.bl - s.cl - 0.06, cargo = box(cl, 0.42, s.bw - 0.02), cy = clear + s.bh + 0.21 - 0.02;
    body.add(cargo, -s.bl / 2 + cl / 2, cy, 0);
    edge(cargo, -s.bl / 2 + cl / 2, cy, 0);
  }
  // pickup: an open bed behind the cab, with a load; van: a plain box body
  if (s.bed) {
    const bedL = s.bl - s.cl - 0.1, bx = -s.bl / 2 + bedL / 2 + 0.02, wallY = clear + s.bh + 0.1;
    for (const z of [-s.bw / 2 + 0.03, s.bw / 2 - 0.03]) body.add(box(bedL, 0.2, 0.05), bx, wallY, z);
    body.add(box(0.05, 0.2, s.bw - 0.04), -s.bl / 2 + 0.04, wallY, 0);
    trim.add(box(bedL * 0.55, 0.16, s.bw * 0.6), bx + 0.05, clear + s.bh + 0.08, 0, CRATE);
    trim.add(box(bedL * 0.3, 0.12, s.bw * 0.5), bx - bedL * 0.3, clear + s.bh + 0.06, 0, SACK);
  }

  // wheels with a pale hub, lamps and bumpers
  const wx = s.bus ? [-s.bl * 0.33, s.bl * 0.3] : [-s.bl * 0.3, s.bl * 0.3];
  for (const x of wx) for (const z of [-1, 1]) {
    const zz = z * (s.bw / 2 - 0.02);
    trim.add(wheel(s.wr), x, s.wr, zz, TYRE, Math.PI / 2, 0, 0);
    trim.add(new THREE.CylinderGeometry(s.wr * 0.45, s.wr * 0.45, 0.17, 6), x, s.wr, zz, HUB, Math.PI / 2, 0, 0);
  }
  for (const z of [-1, 1]) {
    trim.add(box(0.05, 0.1, 0.16), s.bl / 2 + 0.01, by + 0.02, z * s.bw * 0.3, LAMP);
    trim.add(box(0.05, 0.09, 0.14), -s.bl / 2 - 0.01, by + 0.02, z * s.bw * 0.3, TAIL);
  }
  trim.add(box(0.07, 0.07, s.bw - 0.06), s.bl / 2 + 0.01, clear + 0.06, 0, BUMPER);
  trim.add(box(0.07, 0.07, s.bw - 0.06), -s.bl / 2 - 0.01, clear + 0.06, 0, BUMPER);
  if (s.bus) trim.add(box(0.04, 0.12, s.bw * 0.5), s.bl / 2 + 0.01, clear + s.bh - 0.03, 0, SACK); // destination board

  return { body: body.geometry(false), trim: trim.geometry(true), edges };
}
