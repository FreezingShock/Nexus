// Decoration shapes: each kind is a short list of coloured primitives, merged into one vertex-coloured geometry.
// Shared by the town (render/systems/decor.js) and the menu thumbnails (render/thumbs.js).
import * as THREE from '../../vendor/three/three.module.min.js';
import { heightAt } from '../world/terrain.js';
import { tileCenter } from '../world/grid.js';
import { doghouse } from './festive/beagle.js';

const WOOD = 0x9A6B43, DARK = 0x4A3F36, STONE = 0xCFC7B6, STONE2 = 0xB5AC9A, LEAF = 0x5E8C4E, LEAF2 = 0x7BA25C, WATER = 0x8FC4D8;
const BRONZE = 0x7A9A8A, TERRA = 0xB8472E, CREAM = 0xF3E9D2, GOLD = 0xF2D27A, SOIL = 0x6B4E3A, POST = 0x3F4A3A;

const FIR = 0x2F6B45, FIR2 = 0x3F8455, RED = 0xC2483A, ORANGE = 0xE07B39, STRAW = 0xE2C27A, BLUE = 0x3F6FB0, WHITE = 0xF7F1E3, GLASS = 0xCFE6F2, GINGER = 0xA8683A;
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n);
const ball = (r) => new THREE.IcosahedronGeometry(r, 1);
const cone = (r, h, n = 6) => new THREE.ConeGeometry(r, h, n);

// A kind is a list of parts: [geometry, colour, x, y, z, rotY?]. y is the part's centre above the ground.
const PARTS = {
  hedge: () => [[box(2.5, 0.9, 0.85), LEAF, 0, 0.45, 0], [ball(0.5), LEAF2, -0.8, 0.95, 0], [ball(0.5), LEAF2, 0.1, 1.0, 0], [ball(0.45), LEAF2, 0.9, 0.9, 0]],
  bench: () => [[box(1.5, 0.12, 0.55), WOOD, 0, 0.5, 0], [box(1.5, 0.45, 0.1), WOOD, 0, 0.8, -0.25], [box(0.12, 0.5, 0.5), DARK, -0.6, 0.25, 0], [box(0.12, 0.5, 0.5), DARK, 0.6, 0.25, 0]],
  flowers: () => [[box(2.1, 0.3, 2.1), SOIL, 0, 0.15, 0], [ball(0.3), 0xE88CA6, -0.6, 0.45, -0.5], [ball(0.3), 0xF2D27A, 0.5, 0.45, -0.6], [ball(0.3), 0xFAF3E4, -0.4, 0.45, 0.5],
    [ball(0.3), 0xD98C7A, 0.6, 0.45, 0.4], [ball(0.28), 0xB9A4D6, 0, 0.5, 0], [ball(0.2), LEAF2, 0.1, 0.4, -0.8]],
  lamp: () => [[cyl(0.1, 0.16, 2.3, 6), POST, 0, 1.15, 0], [cyl(0.25, 0.25, 0.1, 6), POST, 0, 0.05, 0], [box(0.42, 0.5, 0.42), GOLD, 0, 2.5, 0], [cone(0.34, 0.3, 4), POST, 0, 2.9, 0]],
  topiary: () => [[box(0.9, 0.6, 0.9), TERRA, 0, 0.3, 0], [ball(0.65), LEAF, 0, 1.2, 0], [ball(0.4), LEAF2, 0, 1.9, 0]],
  stall: () => [[box(1.9, 0.7, 1.0), WOOD, 0, 0.35, 0.25], [box(0.1, 2.0, 0.1), DARK, -0.9, 1.0, -0.4], [box(0.1, 2.0, 0.1), DARK, 0.9, 1.0, -0.4],
    [box(2.2, 0.12, 1.4), TERRA, 0, 2.05, -0.05], [box(2.2, 0.12, 0.5), CREAM, 0, 2.03, 0.1], [ball(0.22), 0xD98C7A, -0.5, 0.85, 0.25], [ball(0.22), GOLD, 0.2, 0.85, 0.3], [box(0.35, 0.3, 0.35), WOOD, 0.65, 0.85, 0.3]],
  fountain: () => [[cyl(1.35, 1.45, 0.5, 14), STONE, 0, 0.25, 0], [cyl(1.15, 1.15, 0.06, 14), WATER, 0, 0.5, 0], [cyl(0.2, 0.28, 1.1, 8), STONE2, 0, 0.9, 0],
    [cyl(0.65, 0.4, 0.2, 12), STONE, 0, 1.45, 0], [cyl(0.55, 0.55, 0.05, 12), WATER, 0, 1.56, 0], [ball(0.2), WATER, 0, 1.75, 0]],
  statue: () => [[box(1.1, 0.35, 1.1), STONE2, 0, 0.18, 0], [box(0.85, 0.8, 0.85), STONE, 0, 0.75, 0], [cyl(0.28, 0.4, 1.0, 8), BRONZE, 0, 1.65, 0], [ball(0.28), BRONZE, 0, 2.3, 0], [box(0.9, 0.12, 0.2), BRONZE, 0, 1.95, 0]],
  gazebo: () => [[cyl(1.4, 1.5, 0.25, 6), STONE, 0, 0.12, 0], ...[0, 1, 2, 3, 4, 5].map((i) => [box(0.14, 2.0, 0.14), CREAM, Math.cos(i * Math.PI / 3) * 1.15, 1.25, Math.sin(i * Math.PI / 3) * 1.15]),
    [cone(1.75, 1.0, 6), TERRA, 0, 2.75, 0], [ball(0.14), GOLD, 0, 3.35, 0]],
  // festive extras and keepsakes
  xmastree: () => [[cyl(0.18, 0.22, 0.6, 6), WOOD, 0, 0.3, 0], [cone(1.25, 1.4, 8), FIR, 0, 1.2, 0], [cone(0.95, 1.2, 8), FIR2, 0, 2.0, 0], [cone(0.62, 1.0, 8), FIR, 0, 2.7, 0],
    [ball(0.22), GOLD, 0, 3.3, 0], ...[[0.8, 1.0, 0.3, RED], [-0.6, 1.3, 0.5, GOLD], [0.2, 1.9, -0.7, 0x6FA0DC], [-0.5, 2.1, -0.3, RED], [0.4, 2.5, 0.3, GOLD], [-0.7, 0.9, -0.5, 0x6FA0DC]]
      .map(([x, y, z, c]) => [ball(0.11), c, x, y, z]), [box(0.5, 0.35, 0.5), RED, 0.9, 0.18, 0.7], [box(0.4, 0.3, 0.4), 0x6FA0DC, -0.8, 0.15, 0.8]],
  gingerbread: () => [[box(1.8, 0.8, 1.0), GINGER, 0, 0.4, 0.2], [box(1.9, 0.08, 1.1), WHITE, 0, 0.84, 0.2], [box(0.1, 1.9, 0.1), DARK, -0.85, 0.95, -0.35], [box(0.1, 1.9, 0.1), DARK, 0.85, 0.95, -0.35],
    [box(2.1, 0.14, 1.3), RED, 0, 1.95, -0.05], [box(2.1, 0.1, 0.5), WHITE, 0, 1.93, 0.2], [ball(0.16), GINGER, -0.5, 0.98, 0.3], [ball(0.16), GINGER, 0.1, 0.98, 0.35], [cyl(0.12, 0.1, 0.22, 8), WHITE, 0.6, 0.98, 0.3]],
  pumpkins: () => [[box(2.0, 0.12, 2.0), SOIL, 0, 0.06, 0], [ball(0.45), ORANGE, -0.4, 0.4, -0.3], [ball(0.3), ORANGE, 0.5, 0.3, -0.5], [ball(0.35), 0xD9662B, 0.4, 0.33, 0.45],
    [ball(0.22), ORANGE, -0.6, 0.24, 0.6], [ball(0.18), STRAW, 0.0, 0.2, 0.1], [box(0.5, 0.06, 0.2), LEAF, -0.1, 0.15, -0.8], [box(0.3, 0.06, 0.3), LEAF2, 0.8, 0.15, 0.1]],
  scarecrow: () => [[box(0.12, 2.0, 0.12), WOOD, 0, 1.0, 0], [box(1.4, 0.1, 0.1), WOOD, 0, 1.55, 0], [box(0.6, 0.75, 0.3), 0x7A6A9C, 0, 1.4, 0], [box(0.3, 0.1, 0.12), 0xB8472E, 0.15, 1.5, 0.17],
    [ball(0.24), STRAW, 0, 2.0, 0], [cyl(0.42, 0.42, 0.05, 10), STRAW, 0, 2.18, 0], [cone(0.22, 0.3, 8), STRAW, 0, 2.35, 0], [ball(0.12), STRAW, -0.72, 1.55, 0], [ball(0.12), STRAW, 0.72, 1.55, 0]],
  bandstand: () => [[cyl(1.4, 1.5, 0.35, 8), STONE, 0, 0.18, 0], ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => [box(0.1, 1.7, 0.1), WHITE, Math.cos(i * Math.PI / 4) * 1.2, 1.2, Math.sin(i * Math.PI / 4) * 1.2]),
    [cone(1.7, 0.8, 8), RED, 0, 2.45, 0], [cyl(1.7, 1.7, 0.18, 8), WHITE, 0, 2.0, 0], [cyl(1.72, 1.72, 0.08, 8), BLUE, 0, 1.9, 0], [ball(0.12), GOLD, 0, 2.95, 0]],
  picnic: () => [[box(1.4, 0.08, 0.8), RED, 0, 0.72, 0], [box(1.42, 0.04, 0.82), WHITE, 0, 0.75, 0], [box(0.1, 0.7, 0.7), WOOD, -0.55, 0.35, 0], [box(0.1, 0.7, 0.7), WOOD, 0.55, 0.35, 0],
    [box(1.4, 0.06, 0.25), WOOD, 0, 0.42, 0.6], [box(1.4, 0.06, 0.25), WOOD, 0, 0.42, -0.6], [cyl(0.22, 0.18, 0.1, 10), GINGER, 0.2, 0.82, 0], [cyl(0.05, 0.05, 0.25, 6), 0x8FC4D8, -0.3, 0.88, 0.1]],
  doghouse: () => [...doghouse(1.3), [box(1.4, 0.06, 0.9), CREAM, 0, 0.03, 1.15], [cyl(0.2, 0.22, 0.1, 8), GOLD, 0.6, 0.05, 1.2]],
  kitepost: () => [[cyl(0.1, 0.14, 2.6, 6), WOOD, 0, 1.3, 0], [cyl(0.4, 0.45, 0.15, 8), STONE2, 0, 0.07, 0], [cyl(0.015, 0.015, 1.6, 4).rotateZ(-0.35), WHITE, 0.3, 3.3, 0],
    [box(0.65, 0.65, 0.06).rotateZ(Math.PI / 4), RED, 0.6, 4.0, 0], [box(0.05, 0.9, 0.07), WHITE, 0.6, 4.0, 0], [box(0.2, 0.12, 0.05), WHITE, 0.42, 3.4, 0], [box(0.2, 0.12, 0.05), RED, 0.3, 3.2, 0]],
  snowglobe: () => [[cyl(0.75, 0.9, 0.45, 12), GINGER, 0, 0.23, 0], [cyl(0.8, 0.8, 0.08, 12), GOLD, 0, 0.48, 0], [ball(0.85), GLASS, 0, 1.25, 0], [box(0.4, 0.35, 0.35), WHITE, 0, 0.75, 0], [cone(0.3, 0.25, 4), RED, 0, 1.05, 0],
    [cone(0.22, 0.5, 6), FIR, 0.35, 0.82, 0.2], [box(1.2, 0.06, 1.2), WHITE, 0, 0.55, 0]],
  lanternpost: () => [[cyl(0.1, 0.14, 2.2, 6), DARK, 0, 1.1, 0], [box(0.7, 0.08, 0.08), DARK, 0.3, 2.1, 0], [cyl(0.02, 0.02, 0.3, 4), DARK, 0.6, 1.95, 0], [ball(0.3), ORANGE, 0.6, 1.6, 0],
    [cyl(0.03, 0.04, 0.12, 5), LEAF, 0.6, 1.92, 0], [cyl(0.3, 0.35, 0.12, 8), STONE2, 0, 0.06, 0]],
  summerbell: () => [[box(0.15, 2.0, 0.15), WOOD, -0.7, 1.0, 0], [box(0.15, 2.0, 0.15), WOOD, 0.7, 1.0, 0], [box(1.7, 0.18, 0.25), WOOD, 0, 2.05, 0], [cone(0.45, 0.7, 10), 0xC9A15A, 0, 1.55, 0],
    [cyl(0.47, 0.47, 0.08, 10), 0xC9A15A, 0, 1.2, 0], [ball(0.08), DARK, 0, 1.1, 0], [box(1.9, 0.15, 0.6), STONE, 0, 0.08, 0], [box(1.75, 0.06, 0.3), RED, 0, 1.88, 0.14]],
};

const partCache = new Map();
const partsOf = (k) => { if (!partCache.has(k)) partCache.set(k, PARTS[k]()); return partCache.get(k); };

// One merged geometry for a list of pieces { k, gx, gz, rot }. `grow` fattens each part about its own centre (the outline),
// `tintOf(item)` blends a colour in, and `flat` stands every piece on y = 0 at the origin (menu thumbnails).
export function mergeDecor(items, grow = 1, tintOf = null, flat = false) {
  const pos = [], nor = [], col = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  for (const it of items) {
    const [cx, cz] = flat ? [0, 0] : tileCenter(it.gx, it.gz), y0 = flat ? 0 : heightAt(cx, cz);
    q.setFromAxisAngle(up, -(it.rot || 0) * Math.PI / 2);
    for (const [geo0, hex, x, y, z] of partsOf(it.k)) {
      const g = geo0.index ? geo0.toNonIndexed() : geo0.clone();
      g.scale(grow, grow, grow);
      g.translate(x, y, z);
      g.applyMatrix4(m.compose(v.set(cx, y0, cz), q, one));
      g.computeVertexNormals();
      c.setHex(hex);
      if (tintOf) c.lerp(tintOf(it), 0.45);
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
