// A building is described by data (world/layout.js). Here it becomes parts: geometry + material + local matrix.
// The town merges parts into a few meshes; the same parts feed the selection outline and the upgrade pop.
import * as THREE from '../../vendor/three/three.module.min.js';
import { PAL, AWNINGS } from '../world/palettes.js';
import { toon, facade } from './materials.js';
import { Batch, splitGroups, scaleUV, xf } from './geom.js';

const FH = 1.1, BASE = 0.25;
const cone4 = (r, h) => new THREE.ConeGeometry(r, h, 4, 1).rotateY(Math.PI / 4);

// part = { geo, mat, local, edge, body? }. `body` parts carry a multi-material box (walls + roof color).
export function makeParts(b) {
  const P = PAL[b.pal], h = b.floors * FH, parts = [];
  const bx = Math.max(1, Math.round(b.w / 1.5)), bz = Math.max(1, Math.round(b.d / 1.5));
  const add = (geo, mat, x, y, z, o = {}) => parts.push({ geo, mat, local: xf(x, y, z, o.rx || 0, 0, 0, 1, 1, o.sz || 1), edge: o.edge !== false });

  // walls: UV repeat baked per face (x faces repeat along depth, z faces along width)
  const body = new THREE.BoxGeometry(b.w, h, b.d);
  scaleUV(body, 0, 8, bz, b.floors);
  scaleUV(body, 16, 8, bx, b.floors);
  parts.push({ geo: body, splits: splitGroups(body), mat: toon(P.roof), facadeMat: facade(b.pal), local: xf(0, BASE + h / 2, 0), edge: true, body: true });

  add(new THREE.BoxGeometry(b.w + 0.15, BASE, b.d + 0.15), toon(0xB9AD97), 0, BASE / 2, 0);
  add(new THREE.BoxGeometry(0.75, 1.05, 0.14), toon(P.accent), b.dx, BASE + 0.52, b.d / 2 + 0.05);
  if (b.awning >= 0) add(new THREE.BoxGeometry(Math.min(b.w - 0.6, 2.2), 0.1, 0.8), toon(AWNINGS[b.awning]), b.dx, BASE + 1.45, b.d / 2 + 0.4, { rx: 0.28 });

  const ry = BASE + h;
  if (b.roof === 'gable') {
    const rh = 1.5, s = new THREE.Shape();
    s.moveTo(-b.w / 2 - 0.15, 0); s.lineTo(b.w / 2 + 0.15, 0); s.lineTo(0, rh); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: b.d + 0.3, bevelEnabled: false });
    geo.translate(0, 0, -(b.d + 0.3) / 2);
    add(geo, toon(P.roof), 0, ry, 0);
    add(new THREE.BoxGeometry(0.4, 1, 0.4), toon(0x854E3C), b.w * 0.22, ry + rh * 0.6, -b.d * 0.2);
  } else if (b.roof === 'hip') {
    const rh = 1.5, r = (b.w / 2 + 0.15) * Math.SQRT2;
    add(new THREE.ConeGeometry(r, rh, 4, 1).rotateY(Math.PI / 4), toon(P.roof), 0, ry + rh / 2, 0, { sz: b.d / b.w });
    add(new THREE.BoxGeometry(0.4, 1, 0.4), toon(0x854E3C), b.w * 0.2, ry + rh * 0.7, 0);
  } else if (b.roof === 'mansard') {
    const rh = 1.5, r = (b.w / 2 + 0.12) * Math.SQRT2;
    add(new THREE.CylinderGeometry(r * 0.66, r, rh, 4, 1).rotateY(Math.PI / 4), toon(P.roof), 0, ry + rh / 2, 0, { sz: b.d / b.w });
    for (let i = -1; i <= 1; i += 2) add(new THREE.BoxGeometry(0.7, 0.6, 0.5), toon(P.accent), i * b.w * 0.22, ry + 0.35, b.d * 0.28);
  } else {
    add(new THREE.BoxGeometry(b.w + 0.12, 0.4, b.d + 0.12), toon(0x6B6B5A), 0, ry + 0.2, 0);
    add(new THREE.BoxGeometry(b.w * 0.35, 0.8, b.d * 0.35), toon(0xB9AD97), b.w * 0.15, ry + 0.8, -b.d * 0.1);
  }

  if (b.type === 'hall') {
    const top = BASE + 3 * FH;
    add(new THREE.BoxGeometry(2, 4.2, 2), toon(0xEAE1D5), 0, top + 2.1, 0);
    add(new THREE.CylinderGeometry(0.7, 0.7, 0.12, 20), toon(0xFAF3E4), 0, top + 3.2, 1.05, { rx: Math.PI / 2 });
    add(cone4(1.6, 2.6), toon(0x4D3B2B), 0, top + 5.5, 0);
  } else if (b.type === 'church') {
    const top = BASE + 2 * FH;
    add(new THREE.BoxGeometry(1.9, 7.4, 1.9), toon(0xFAF3E4), 0, BASE + 3.7, 3.4);
    add(cone4(1.5, 3.6), toon(0x97553E), 0, BASE + 7.4 + 1.8, 3.4);
    add(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16), toon(0x7F98A6), 0, top + 1.4, 4.38, { rx: Math.PI / 2 });
  } else if (b.type === 'factory') {
    for (let i = 0; i < 2; i++) add(new THREE.CylinderGeometry(0.5, 0.62, 5, 10), toon(0x97553E), -2 + i * 1.7, BASE + 2.2 + 2.5, -1);
  }
  return parts;
}

export function worldMatrix(b, scale = 1) {
  return xf(b.x, b.y ?? 0.1, b.z, 0, b.rotY, 0, scale, scale, scale);
}

// Adds a building's parts to a Batch. `night` swaps the facade for the lit-window material.
export function addToBatch(batch, parts, world, night) {
  const m = new THREE.Matrix4();
  for (const p of parts) {
    m.multiplyMatrices(world, p.local);
    if (p.body) {
      for (const s of p.splits) {
        const walls = s.materialIndex === 0 || s.materialIndex === 1 || s.materialIndex === 4 || s.materialIndex === 5;
        batch.add(s.geo, walls ? (night ? p.facadeMat.userData.night : p.facadeMat) : p.mat, m);
      }
    } else batch.add(p.geo, p.mat, m);
    if (p.edge) batch.addEdges(p.geo, m);
  }
}
