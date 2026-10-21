// Static props: block pads, park paths and ponds, bridge, trees, pines, turbines. (Lamps now come from the road system.)
import * as THREE from '../../vendor/three/three.module.min.js';
import { heightAt } from '../world/terrain.js';
import { TREE_COLORS, PINE_COLORS } from '../world/palettes.js';
import { toon, hullInk, INK } from './materials.js';
import { Batch, xf } from './geom.js';

export function buildStatic(parent, layout) {
  const b = new Batch();
  for (const pad of layout.pads) b.add(new THREE.BoxGeometry(8.8, 0.1, 8.8), toon(pad.park ? 0xA8C179 : 0xD8CDB4), xf(pad.x, 0.05, pad.z), { cast: false });
  for (const p of layout.parks) {
    b.add(new THREE.BoxGeometry(8.8, 0.04, 1.3), toon(0xE7D8BF), xf(p.x, 0.12, p.z), { cast: false });
    b.add(new THREE.BoxGeometry(1.3, 0.04, 8.8), toon(0xE7D8BF), xf(p.x, 0.125, p.z), { cast: false });
    if (p.pond) b.add(new THREE.CylinderGeometry(1.5, 1.5, 0.08, 20), toon(0x7FA3B8), xf(p.x, 0.14, p.z));
  }
  // bridge over the river
  const deck = (g, m, x, y, z) => b.add(g, toon(m), xf(52 + x, y, z), { edge: true });
  deck(new THREE.BoxGeometry(18, 0.35, 4.2), 0xB9AD97, 0, -0.15, 0);
  for (const s of [-1, 1]) deck(new THREE.BoxGeometry(18, 0.55, 0.25), 0xEAE1D5, 0, 0.3, s * 2);
  for (let i = -1; i <= 1; i += 2) for (const s of [-1, 1]) deck(new THREE.CylinderGeometry(0.4, 0.5, 1.6, 8), 0xB9AD97, i * 6, -1.2, s * 1.4);
  // wind turbine masts
  for (const t of layout.turbines) b.add(new THREE.CylinderGeometry(0.18, 0.3, 9, 8), toon(0xFAF3E4), xf(t.x, 4.5, t.z), { edge: true });
  b.build(parent);
}

export function buildTurbines(parent, layout) {
  const hubs = [];
  const bladeGeo = new THREE.BoxGeometry(0.25, 3.6, 0.08);
  const mat = toon(0xFAF3E4);
  for (const t of layout.turbines) {
    const hub = new THREE.Group();
    hub.position.set(t.x, 9, t.z + 0.3);
    const batch = new Batch();
    for (let i = 0; i < 3; i++) batch.add(bladeGeo, mat, xf(0, 0, 0, 0, 0, i * Math.PI * 2 / 3).multiply(xf(0, 1.8, 0)), { edge: true });
    batch.build(hub);
    parent.add(hub);
    hubs.push({ hub, speed: t.speed });
  }
  return hubs;
}

function instanced(geo, mat, n) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.frustumCulled = false; // instance matrices place it far from the geometry's own bounds
  return m;
}

export function buildTrees(parent, layout) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
  const trees = layout.trees, n = trees.length;
  const can = instanced(new THREE.IcosahedronGeometry(1, 0), toon(0xffffff), n);
  const hull = instanced(new THREE.IcosahedronGeometry(1, 0), hullInk, n);
  const trunk = instanced(new THREE.CylinderGeometry(0.14, 0.2, 1, 5), toon(0x5B4636), n);
  trees.forEach((t, i) => {
    const h = heightAt(t.x, t.z), sc = t.s;
    q.setFromEuler(e.set(0, t.rot, 0));
    p.set(t.x, h + 1.15 * sc + 0.5, t.z); s.set(sc * 1.05, sc * 0.95, sc * 1.05); m.compose(p, q, s); can.setMatrixAt(i, m);
    s.multiplyScalar(1.09); m.compose(p, q, s); hull.setMatrixAt(i, m);
    p.set(t.x, h + 0.5 * sc, t.z); s.set(sc, sc * 1.1, sc); m.compose(p, q, s); trunk.setMatrixAt(i, m);
    can.setColorAt(i, c.setHex(TREE_COLORS[t.col]));
  });
  can.castShadow = true; trunk.castShadow = true;

  const pines = layout.pines, np = pines.length;
  const cone = instanced(new THREE.ConeGeometry(1.35, 4.4, 6, 1), toon(0xffffff), np);
  const cone2 = instanced(new THREE.ConeGeometry(1.35, 4.4, 6, 1), hullInk, np);
  pines.forEach((t, i) => {
    const h = heightAt(t.x, t.z), sc = t.s;
    q.setFromEuler(e.set(0, t.rot, 0));
    p.set(t.x, h + 2.2 * sc, t.z); s.set(sc, sc, sc); m.compose(p, q, s); cone.setMatrixAt(i, m);
    s.multiplyScalar(1.08); m.compose(p, q, s); cone2.setMatrixAt(i, m);
    cone.setColorAt(i, c.setHex(PINE_COLORS[i % 3]));
  });
  cone.castShadow = true;
  parent.add(can, hull, trunk, cone, cone2);
}
