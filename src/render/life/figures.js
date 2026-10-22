// Small shapes for the town's life: a person, a cat, a piece of washing on its line. Each is one merged geometry with
// vertex colours, plus an `aTint` attribute: 1 where the instance colour should dye the surface (a coat, a cat), 0 where
// the colour is fixed (skin, trousers, the line). One mesh per shape, however many people are out.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { toonUncached } from '../materials.js';

const c = new THREE.Color();

// parts: [{ geo, color, tint }] -> one non-indexed geometry with position, normal, color and aTint.
export function mergeParts(parts) {
  const flat = parts.map((p) => ({ g: p.geo.index ? p.geo.toNonIndexed() : p.geo, color: p.color, tint: p.tint ? 1 : 0 }));
  const n = flat.reduce((s, p) => s + p.g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), tint = new Float32Array(n);
  let o = 0;
  for (const p of flat) {
    const cnt = p.g.attributes.position.count;
    pos.set(p.g.attributes.position.array, o * 3); nor.set(p.g.attributes.normal.array, o * 3);
    c.setHex(p.color);
    for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; tint[o + i] = p.tint; }
    o += cnt;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
  return g;
}

// A toon material whose vertex colours stay as drawn where aTint is 0 and take the instance colour where it is 1.
// Built on toonUncached, so it keeps the season patch (snow on shoulders, wet darkening) and adds one line of its own.
export function tintToon() {
  const m = toonUncached(0xffffff, { vertexColors: true });
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey;
  m.onBeforeCompile = (sh) => {
    prev(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTint;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\n\tvColor.xyz = color.xyz * mix(vec3(1.0), instanceColor.xyz, aTint);\n#endif');
  };
  m.customProgramCacheKey = () => key.call(m) + ':tint';
  return m;
}

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// A person about 0.9 tall, facing +x (like the townsfolk): legs, a dyed coat, head and hair.
export function personGeometry() {
  return mergeParts([
    { geo: box(0.1, 0.26, 0.1, 0, 0.13, -0.07), color: 0x6C7A8F, tint: false },
    { geo: box(0.1, 0.26, 0.1, 0, 0.13, 0.07), color: 0x6C7A8F, tint: false },
    { geo: new THREE.CylinderGeometry(0.14, 0.22, 0.46, 7).translate(0, 0.49, 0), color: 0xffffff, tint: true },
    { geo: new THREE.SphereGeometry(0.14, 7, 5).translate(0, 0.84, 0), color: 0xF1D3B3, tint: false },
    { geo: new THREE.SphereGeometry(0.155, 7, 4, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(-0.01, 0.855, 0), color: 0x5A4030, tint: false },
  ]);
}

// A cat sitting, facing +x, about 0.3 long. All of it takes the instance colour.
export function catGeometry() {
  const tail = box(0.2, 0.04, 0.04, 0, 0, 0).rotateZ(0.9).translate(-0.24, 0.17, 0);
  return mergeParts([
    { geo: box(0.34, 0.17, 0.16, 0, 0.1, 0), color: 0xffffff, tint: true },
    { geo: new THREE.SphereGeometry(0.095, 6, 5).translate(0.19, 0.21, 0), color: 0xffffff, tint: true },
    { geo: new THREE.ConeGeometry(0.035, 0.07, 4).translate(0.19, 0.3, 0.05), color: 0xffffff, tint: true },
    { geo: new THREE.ConeGeometry(0.035, 0.07, 4).translate(0.19, 0.3, -0.05), color: 0xffffff, tint: true },
    { geo: tail, color: 0xffffff, tint: true },
  ]);
}

// One piece of washing hanging from its line, pivot at the line (y = 0): a bit of string and a dyed cloth.
export function clothGeometry() {
  return mergeParts([
    { geo: box(0.22, 0.03, 0.02, 0, -0.005, 0), color: 0x5B4A3A, tint: false },
    { geo: box(0.2, 0.3, 0.02, 0, -0.16, 0.01), color: 0xffffff, tint: true },
  ]);
}

const cylZ = (r, h, x, y, z) => new THREE.CylinderGeometry(r, r, h, 8).rotateX(Math.PI / 2).translate(x, y, z);

// A forklift about 0.9 long, facing +x, carrying a crate on its forks. The body takes the instance colour.
export function forkliftGeometry() {
  return mergeParts([
    { geo: box(0.55, 0.26, 0.36, -0.05, 0.2, 0), color: 0xffffff, tint: true },
    { geo: box(0.05, 0.34, 0.05, -0.2, 0.5, 0.15), color: 0x4D3B2B, tint: false },
    { geo: box(0.05, 0.34, 0.05, -0.2, 0.5, -0.15), color: 0x4D3B2B, tint: false },
    { geo: box(0.3, 0.04, 0.4, -0.08, 0.68, 0), color: 0x4D3B2B, tint: false },
    { geo: box(0.05, 0.75, 0.32, 0.27, 0.43, 0), color: 0x6B6B5A, tint: false },
    { geo: box(0.36, 0.04, 0.07, 0.47, 0.1, 0.1), color: 0x6B6B5A, tint: false },
    { geo: box(0.36, 0.04, 0.07, 0.47, 0.1, -0.1), color: 0x6B6B5A, tint: false },
    { geo: box(0.3, 0.3, 0.3, 0.47, 0.27, 0), color: 0x9A7B55, tint: false },
    { geo: cylZ(0.09, 0.07, 0.12, 0.09, 0.2), color: 0x2B2620, tint: false },
    { geo: cylZ(0.09, 0.07, 0.12, 0.09, -0.2), color: 0x2B2620, tint: false },
    { geo: cylZ(0.08, 0.07, -0.25, 0.08, 0.2), color: 0x2B2620, tint: false },
    { geo: cylZ(0.08, 0.07, -0.25, 0.08, -0.2), color: 0x2B2620, tint: false },
  ]);
}

// A delivery van about 1.4 long, facing +x. Body and cab take the instance colour; glass, bumpers and wheels do not.
export function vanGeometry() {
  return mergeParts([
    { geo: box(0.9, 0.5, 0.56, -0.2, 0.38, 0), color: 0xffffff, tint: true },
    { geo: box(0.4, 0.36, 0.56, 0.45, 0.31, 0), color: 0xffffff, tint: true },
    { geo: box(0.02, 0.2, 0.46, 0.66, 0.42, 0), color: 0x7F98A6, tint: false },
    { geo: box(0.04, 0.08, 0.6, 0.67, 0.17, 0), color: 0x6B6B5A, tint: false },
    { geo: box(0.04, 0.08, 0.6, -0.66, 0.17, 0), color: 0x6B6B5A, tint: false },
    { geo: cylZ(0.12, 0.08, 0.42, 0.12, 0.3), color: 0x2B2620, tint: false },
    { geo: cylZ(0.12, 0.08, 0.42, 0.12, -0.3), color: 0x2B2620, tint: false },
    { geo: cylZ(0.12, 0.08, -0.4, 0.12, 0.3), color: 0x2B2620, tint: false },
    { geo: cylZ(0.12, 0.08, -0.4, 0.12, -0.3), color: 0x2B2620, tint: false },
  ]);
}

// A blade sign on a bracket, in the building's own frame: the arm runs out from the wall along +z from the origin, and the
// board hangs from it, broad face to the street's length. The board takes the instance colour.
export function bladeGeometry() {
  return mergeParts([
    { geo: box(0.03, 0.03, 0.4, 0, 0, 0.2), color: 0x4D3B2B, tint: false },
    { geo: box(0.03, 0.26, 0.26, 0, -0.17, 0.24), color: 0xffffff, tint: true },
    { geo: box(0.035, 0.14, 0.14, 0, -0.17, 0.24), color: 0xFAF3E4, tint: false },
  ]);
}
