// Decoration shapes: each kind is a short list of coloured primitives, merged into one vertex-coloured geometry.
// Shared by the town (render/systems/decor.js) and the menu thumbnails (render/thumbs.js).
import * as THREE from '../../vendor/three/three.module.min.js';
import { heightAt } from '../world/terrain.js';
import { tileCenter } from '../world/grid.js';

const WOOD = 0x9A6B43, DARK = 0x4A3F36, STONE = 0xCFC7B6, STONE2 = 0xB5AC9A, LEAF = 0x5E8C4E, LEAF2 = 0x7BA25C, WATER = 0x8FC4D8;
const BRONZE = 0x7A9A8A, TERRA = 0xB8472E, CREAM = 0xF3E9D2, GOLD = 0xF2D27A, SOIL = 0x6B4E3A, POST = 0x3F4A3A;

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
