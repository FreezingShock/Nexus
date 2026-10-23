// The shared meshes behind the town's life, so every zone's director draws into the same few draw calls:
//   folk  one pool of people who walk a three-point route (a stand-still at the middle point if asked), see createActors
//   cloth hanging things on a line or an awning edge (washing, valances), slots handed out by alloc() at each build
//   make  any other tinted instanced mesh (cats, forklifts, vans): make(name, geometry, max)
// All are InstancedMesh with fixed capacity, an instance colour buffer, and every unused slot scaled to zero.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { allocInstanceColors } from '../geom.js';
import { groundY } from '../road-mesh.js';
import { clothGeometry, personGeometry, tintToon } from './figures.js';

const m4 = new THREE.Matrix4(), qa = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), eul = new THREE.Euler(), col = new THREE.Color();
export const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export function makeTinted(world, geo, max, { cast = true, name = '' } = {}) {
  const m = new THREE.InstancedMesh(geo, tintToon(), max);
  m.name = name;
  m.frustumCulled = false; m.castShadow = cast; m.receiveShadow = false;
  allocInstanceColors(m);
  for (let i = 0; i < max; i++) m.setMatrixAt(i, ZERO);
  m.count = 0; m.visible = false;
  world.add(m);
  return m;
}

// People. Each walks waypoints 0 -> 1 -> 2 at its own pace; if `stand` is set it stops at waypoint 1 for that many seconds.
// `sit` lowers them a little while they stand (a chair). Fading in and out is a scale ramp over `fadeIn`/`fadeOut` units
// of the first and last leg (0.25 is a doorway, 0.7 is walking in from the side).
export function createActors(world, max = 128) {
  const mesh = makeTinted(world, personGeometry(), max, { name: 'folk' });
  const A = {
    on: new Uint8Array(max), wx: new Float32Array(max * 3), wz: new Float32Array(max * 3), wy: new Float32Array(max * 3),
    leg: new Uint8Array(max), t: new Float32Array(max), len: new Float32Array(max), speed: new Float32Array(max),
    stand: new Float32Array(max), standing: new Float32Array(max), size: new Float32Array(max), yaw: new Float32Array(max),
    face: new Float32Array(max), phase: new Float32Array(max), dist: new Float32Array(max), sit: new Uint8Array(max),
    fadeIn: new Float32Array(max), fadeOut: new Float32Array(max),
  };
  let next = 0, top = 0;

  function setLeg(a, leg) {
    A.leg[a] = leg; A.t[a] = 0;
    const i = a * 3 + leg, dx = A.wx[i + 1] - A.wx[i], dz = A.wz[i + 1] - A.wz[i];
    A.len[a] = Math.max(0.05, Math.hypot(dx, dz));
    A.yaw[a] = Math.atan2(-dz, dx);
  }
  const free = (a) => { A.on[a] = 0; mesh.setMatrixAt(a, ZERO); };

  return {
    mesh,
    // o: { pts: [{x, z, door}, ×3], doorY, face, stand, sit, fadeIn, fadeOut, speed?, size?, color? }. Returns false when the pool is full.
    spawn(o) {
      let a = -1;
      for (let i = 0; i < max; i++) { const k = (next + i) % max; if (!A.on[k]) { a = k; break; } }
      if (a < 0) return false;
      next = (a + 1) % max;
      for (let i = 0; i < 3; i++) {
        const p = o.pts[i];
        A.wx[a * 3 + i] = p.x; A.wz[a * 3 + i] = p.z; A.wy[a * 3 + i] = p.door ? o.doorY : groundY(p.x, p.z) + 0.02;
      }
      A.on[a] = 1; A.phase[a] = Math.random() * 6.28; A.dist[a] = 0; A.standing[a] = 0;
      A.speed[a] = o.speed || 1.05 + Math.random() * 0.45;
      A.size[a] = o.size || (Math.random() < 0.18 ? 0.72 : 0.9 + Math.random() * 0.14);
      A.stand[a] = o.stand || 0; A.sit[a] = o.sit ? 1 : 0; A.face[a] = o.face || 0;
      A.fadeIn[a] = o.fadeIn || 0.25; A.fadeOut[a] = o.fadeOut || 0.25;
      mesh.setColorAt(a, col.setHex(o.color ?? 0xFAF3E4));
      mesh.instanceColor.needsUpdate = true;
      setLeg(a, 0);
      return true;
    },
    step(dt, t) {
      let hi = 0;
      for (let a = 0; a < max; a++) {
        if (!A.on[a]) continue;
        let standing = false;
        if (A.standing[a] > 0) {
          A.standing[a] -= dt; standing = true;
          if (A.standing[a] <= 0) { A.standing[a] = 0; standing = false; setLeg(a, 1); }
        } else {
          A.t[a] += (A.speed[a] * dt) / A.len[a]; A.dist[a] += A.speed[a] * dt;
          if (A.t[a] >= 1) {
            if (A.leg[a] === 0) {
              if (A.stand[a] > 0) { A.standing[a] = A.stand[a]; A.stand[a] = 0; A.t[a] = 1; standing = true; }
              else setLeg(a, 1);
            } else { free(a); continue; }
          }
        }
        hi = a + 1;
        const leg = A.leg[a], i = a * 3 + leg, k = Math.min(1, A.t[a]);
        const x = A.wx[i] + (A.wx[i + 1] - A.wx[i]) * k, z = A.wz[i] + (A.wz[i + 1] - A.wz[i]) * k, y = A.wy[i] + (A.wy[i + 1] - A.wy[i]) * k;
        const along = k * A.len[a];
        const vis = leg === 0 ? Math.min(1, along / A.fadeIn[a]) : Math.max(0, Math.min(1, (A.len[a] - along) / A.fadeOut[a]));
        const stride = standing ? 0 : Math.sin(A.phase[a] + A.dist[a] * 7.5);
        const lean = standing ? Math.sin(t * 1.4 + A.phase[a]) * 0.05 : stride * 0.06;
        const seated = standing && A.sit[a];
        qa.setFromEuler(eul.set(lean, standing ? A.face[a] : A.yaw[a], 0));
        const sc = A.size[a] * vis;
        m4.compose(p3.set(x, y + Math.abs(stride) * 0.04 * A.size[a] - (seated ? 0.1 : 0), z), qa, s3.set(sc, sc * (seated ? 0.86 : 1), sc));
        mesh.setMatrixAt(a, m4);
      }
      top = hi;
      mesh.count = hi;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = hi > 0;
    },
    active: () => top,
  };
}

export function createPools(world, { folkMax = 128, clothMax = 800 } = {}) {
  const folk = createActors(world, folkMax);
  const clothMesh = makeTinted(world, clothGeometry(), clothMax, { cast: false, name: 'cloth' });
  const cloth = {
    mesh: clothMesh, max: clothMax, count: 0,
    reset() { cloth.count = 0; for (let i = 0; i < clothMax; i++) clothMesh.setMatrixAt(i, ZERO); clothMesh.count = 0; },
    // The first of n new slots, or -1 when there is no room.
    alloc(n) { if (cloth.count + n > clothMax) return -1; const k = cloth.count; cloth.count += n; clothMesh.count = cloth.count; return k; },
    hide(k) { clothMesh.setMatrixAt(k, ZERO); },
    color(k, hex) { clothMesh.setColorAt(k, col.setHex(hex)); },
    dirty() { clothMesh.instanceMatrix.needsUpdate = true; clothMesh.visible = cloth.count > 0; },
  };
  const made = new Map();
  // Another tinted pool, built once per name.
  const make = (name, geo, max, o) => { if (!made.has(name)) made.set(name, makeTinted(world, geo, max, { ...o, name })); return made.get(name); };
  return { folk, cloth, make };
}
