// Static props: block pads, park paths and ponds, bridge, turbines. Trees are objects now (render/systems/trees.js). (Lamps come from the road system.)
import * as THREE from '../../vendor/three/three.module.min.js';
import { toon } from './materials.js';
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
