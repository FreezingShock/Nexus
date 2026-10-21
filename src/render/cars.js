// Cars are visual agents only: they follow their lane, and nothing in the sim depends on them.
// Bodies and cabins are two InstancedMeshes; the ink edges are one dynamic line buffer.
import * as THREE from '../../vendor/three/three.module.min.js';
import { toon, lineMat } from './materials.js';

const BODY = new THREE.BoxGeometry(1.5, 0.45, 0.8), CABIN = new THREE.BoxGeometry(0.8, 0.4, 0.7);

export function buildCars(parent, layout) {
  const cars = layout.cars.map((c) => ({ ...c }));
  const n = cars.length;
  const bodies = new THREE.InstancedMesh(BODY, toon(0xffffff), n);
  const cabins = new THREE.InstancedMesh(CABIN, toon(0xFAF3E4), n);
  for (const m of [bodies, cabins]) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; }
  const col = new THREE.Color();
  cars.forEach((c, i) => bodies.setColorAt(i, col.setHex(c.col)));

  // template edges of both boxes in car space
  const tmpl = [];
  const addEdges = (geo, x, y, z) => {
    const p = new THREE.EdgesGeometry(geo, 30).attributes.position;
    for (let i = 0; i < p.count; i++) tmpl.push(p.getX(i) + x, p.getY(i) + y, p.getZ(i) + z);
  };
  addEdges(BODY, 0, 0.4, 0); addEdges(CABIN, -0.1, 0.78, 0);
  const per = tmpl.length;
  const lineGeo = new THREE.BufferGeometry();
  const lp = new Float32Array(per * n);
  lineGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  parent.add(bodies, cabins, lines);

  const m = new THREE.Matrix4(), local = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  return {
    // dt is already scaled by game speed; paused passes 0
    update(dt) {
      cars.forEach((c, i) => {
        c.pos += c.dir * c.speed * dt;
        if (c.pos > 30) c.pos = -30; if (c.pos < -30) c.pos = 30;
        const x = c.ax === 'x' ? c.pos : c.line + (c.dir > 0 ? -0.85 : 0.85);
        const z = c.ax === 'x' ? c.line + (c.dir > 0 ? 0.85 : -0.85) : c.pos;
        const ry = c.ax === 'x' ? (c.dir > 0 ? 0 : Math.PI) : (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        q.setFromEuler(e.set(0, ry, 0)); pos.set(x, 0.1, z);
        m.compose(pos, q, one);
        bodies.setMatrixAt(i, local.makeTranslation(0, 0.4, 0).premultiply(m));
        cabins.setMatrixAt(i, local.makeTranslation(-0.1, 0.78, 0).premultiply(m));
        for (let k = 0; k < per; k += 3) {
          v.set(tmpl[k], tmpl[k + 1], tmpl[k + 2]).applyMatrix4(m);
          lp[i * per + k] = v.x; lp[i * per + k + 1] = v.y; lp[i * per + k + 2] = v.z;
        }
      });
      bodies.instanceMatrix.needsUpdate = cabins.instanceMatrix.needsUpdate = true;
      lineGeo.attributes.position.needsUpdate = true;
    },
  };
}
