// Static props: the bridge, the tunnel portal and the turbine masts. Trees are objects (render/systems/trees.js). Lamps come from the road system.
// Parks and plazas are buildings now (starter town and placed), so they are drawn with the town.
import * as THREE from '../../vendor/three/three.module.min.js';
import { toon } from './materials.js';
import { Batch, xf } from './geom.js';
import { heightAt } from '../world/terrain.js';

// The bridge spans the river on the starter stem, and its deck runs over the water tiles of the grid. The portal stands
// where the tunnel gate is (world/starter.js), at the foot of the mountain.
export const BRIDGE_X = 57, PORTAL_X = 70.6;

export function buildStatic(parent, layout) {
  const b = new Batch();
  // bridge over the river
  const deck = (g, m, x, y, z) => b.add(g, toon(m), xf(BRIDGE_X + x, y, z), { edge: true });
  deck(new THREE.BoxGeometry(22, 0.35, 4.2), 0xB9AD97, 0, -0.15, 0);
  for (const s of [-1, 1]) deck(new THREE.BoxGeometry(22, 0.55, 0.25), 0xEAE1D5, 0, 0.3, s * 2);
  for (let i = -1; i <= 1; i += 2) for (const s of [-1, 1]) deck(new THREE.CylinderGeometry(0.4, 0.5, 1.6, 8), 0xB9AD97, i * 6, -1.2, s * 1.4);
  // tunnel portal: a stone arch with a dark mouth, facing the road
  const stone = toon(0xD9CFBE);
  b.add(new THREE.BoxGeometry(0.8, 2.3, 0.7), stone, xf(PORTAL_X, 1.15, -2.3), { edge: true });
  b.add(new THREE.BoxGeometry(0.8, 2.3, 0.7), stone, xf(PORTAL_X, 1.15, 2.3), { edge: true });
  b.add(new THREE.TorusGeometry(2.3, 0.4, 6, 16, Math.PI), stone, xf(PORTAL_X, 0, 0, 0, -Math.PI / 2, 0), { edge: true });
  // wind turbine masts
  for (const t of layout.turbines) b.add(new THREE.CylinderGeometry(0.18, 0.3, 9, 8), toon(0xFAF3E4), xf(t.x, 4.5 + Math.max(0, heightAt(t.x, t.z)), t.z), { edge: true });
  b.build(parent);
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(1.9, 20, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x221E1A, side: THREE.DoubleSide }));
  mouth.position.set(PORTAL_X - 0.05, 0.02, 0); mouth.rotation.y = -Math.PI / 2;
  parent.add(mouth);
}

export function buildTurbines(parent, layout) {
  const hubs = [];
  const bladeGeo = new THREE.BoxGeometry(0.25, 3.6, 0.08);
  const mat = toon(0xFAF3E4);
  for (const t of layout.turbines) {
    const hub = new THREE.Group();
    hub.position.set(t.x, 9 + Math.max(0, heightAt(t.x, t.z)), t.z + 0.3);
    const batch = new Batch();
    for (let i = 0; i < 3; i++) batch.add(bladeGeo, mat, xf(0, 0, 0, 0, 0, i * Math.PI * 2 / 3).multiply(xf(0, 1.8, 0)), { edge: true });
    batch.build(hub);
    parent.add(hub);
    hubs.push({ hub, speed: t.speed });
  }
  return hubs;
}
