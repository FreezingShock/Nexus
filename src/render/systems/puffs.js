// Dust puffs: a small ring of soft cream blobs that puffs up and drifts off. Used when a building levels up
// (town.js) and when a zoned lot grows (lots.js). One instanced mesh, so a whole burst is one draw call, and the
// mesh is hidden while nothing is puffing.
//
// API for render code (scene.sys('puffs')): burst(x, z, radius, count)
import * as THREE from '../../../vendor/three/three.module.min.js';
import { toonUncached } from '../materials.js';

const MAX = 48;
const LIFE = 0.9;                       // seconds a puff lives
const COLORS = ['#F3E9D2', '#E9D6B2', '#FBF6EA', '#E4D2AE'];

export default {
  id: 'puffs',
  create({ world }) {
    const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), toonUncached(0xffffff), MAX);
    mesh.frustumCulled = false; mesh.visible = false; mesh.count = MAX;
    mesh.castShadow = mesh.receiveShadow = false;
    world.add(mesh);

    const age = new Float32Array(MAX).fill(LIFE);   // >= LIFE means the slot is free
    const px = new Float32Array(MAX), py = new Float32Array(MAX), pz = new Float32Array(MAX);
    const ox = new Float32Array(MAX), oz = new Float32Array(MAX), vy = new Float32Array(MAX), size = new Float32Array(MAX);
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < MAX; i++) mesh.setColorAt(i, c.set(COLORS[0]));
    let active = 0;

    return {
      burst(x, z, radius = 3, count = 12) {
        let k = 0;
        for (let i = 0; i < MAX && k < count; i++) {
          if (age[i] < LIFE) continue;
          const a = (k / count) * Math.PI * 2 + Math.random() * 0.5;
          const r = radius * (0.7 + Math.random() * 0.5);
          px[i] = x + Math.cos(a) * r; pz[i] = z + Math.sin(a) * r; py[i] = 0.4;
          ox[i] = Math.cos(a) * 0.9; oz[i] = Math.sin(a) * 0.9;            // drift outward
          vy[i] = 0.7 + Math.random() * 0.5;                              // and up
          size[i] = 0.55 + Math.random() * 0.4;
          age[i] = 0;
          mesh.setColorAt(i, c.set(COLORS[k % COLORS.length]));
          k++;
        }
        if (k) { active += k; mesh.visible = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
      },
      frame(f) {
        if (!active) return;
        let live = 0;
        for (let i = 0; i < MAX; i++) {
          if (age[i] >= LIFE) continue;
          age[i] += f.dt;
          const k = Math.min(1, age[i] / LIFE);
          if (k >= 1) { s.set(0, 0, 0); }
          else {
            live++;
            // puff up quickly, then shrink away as it fades
            const grow = Math.min(1, k / 0.25), gone = 1 - Math.max(0, (k - 0.55) / 0.45);
            const sc = size[i] * grow * gone;
            s.set(sc, sc, sc);
          }
          const dt = f.dt;
          px[i] += ox[i] * dt * (1 - k); pz[i] += oz[i] * dt * (1 - k);
          py[i] += vy[i] * dt * (1 - k * 0.8);
          p.set(px[i], py[i], pz[i]);
          m.compose(p, q, s);
          mesh.setMatrixAt(i, m);
        }
        mesh.instanceMatrix.needsUpdate = true;
        active = live;
        if (!live) mesh.visible = false;
      },
    };
  },
};
