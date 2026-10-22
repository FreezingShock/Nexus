// Falling weather: rain, snow and autumn leaves as instanced particles, one draw call per kind. How many fall follows
// the sky's eased amount and the Graphics "Dust and hearts" setting (Low shows none). Cosmetic only: nothing here
// reads or writes the sim. The sky, fog and snow cover are set by night.js and season.js.
import * as THREE from '../../../vendor/three/three.module.min.js';

const MAX = { rain: 900, snow: 520, leaves: 90, petals: 160 };
const HALF = 34, TOP = 26;  // the box of falling weather around the town
const LEAF = [0xC9662E, 0xD99A3A, 0xB8542A, 0xE0B04A].map((h) => new THREE.Color(h));
const PETAL = [0xFFC9D6, 0xF4B9CB, 0xFFFFFF, 0xF7D6E0].map((h) => new THREE.Color(h));

function layer(geo, mat, max) {
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.frustumCulled = false; // instance matrices place it far from the geometry's own bounds
  m.count = 0; m.visible = false;
  return m;
}

// One kind of particle: where each one is, and its own phase for the sway.
function swarm(max) {
  const pos = new Float32Array(max * 3), phase = new Float32Array(max);
  for (let i = 0; i < max; i++) { phase[i] = Math.random() * 6.283; respawn(pos, i, true); }
  return { pos, phase };
}
function respawn(pos, i, anywhere) {
  pos[i * 3] = (Math.random() * 2 - 1) * HALF;
  pos[i * 3 + 1] = anywhere ? Math.random() * TOP : TOP;
  pos[i * 3 + 2] = (Math.random() * 2 - 1) * HALF;
}

export default {
  id: 'weather',
  create({ world }) {
    const rainMat = new THREE.MeshBasicMaterial({ color: 0xA9C6DC, transparent: true, opacity: 0.6, depthWrite: false });
    const rain = layer(new THREE.BoxGeometry(0.03, 0.7, 0.03), rainMat, MAX.rain);
    const snow = layer(new THREE.IcosahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ color: 0xFFFFFF }), MAX.snow);
    const leaves = layer(new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshBasicMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide }), MAX.leaves);
    for (let i = 0; i < MAX.leaves; i++) leaves.setColorAt(i, LEAF[i % LEAF.length]);
    const petals = layer(new THREE.PlaneGeometry(0.16, 0.11), new THREE.MeshBasicMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide }), MAX.petals);
    for (let i = 0; i < MAX.petals; i++) petals.setColorAt(i, PETAL[i % PETAL.length]);
    world.add(rain, snow, leaves, petals);

    const rainP = swarm(MAX.rain), snowP = swarm(MAX.snow), leafP = swarm(MAX.leaves), petalP = swarm(MAX.petals);
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    const lean = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.16)); // rain slants with a light wind
    const upright = new THREE.Quaternion();
    let effects = 1;

    // Moves the first n particles of one kind and writes their matrices. `orient(phase, t)` composes `m` for the
    // particle whose position is in `p`.
    function run(mesh, pw, n, dt, t, fall, sway, orient) {
      mesh.count = n; mesh.visible = n > 0;
      if (!n) return;
      const pos = pw.pos;
      for (let i = 0; i < n; i++) {
        let y = pos[i * 3 + 1] - fall * dt;
        if (y < 0) { respawn(pos, i, false); y = TOP; }
        pos[i * 3 + 1] = y;
        pos[i * 3] += Math.sin(t * 0.7 + pw.phase[i]) * sway * dt;
        p.set(pos[i * 3], y, pos[i * 3 + 2]);
        orient(pw.phase[i], t);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    return {
      frame(f) {
        const sky = f.sky, k = effects;
        const nRain = Math.round(MAX.rain * sky.rain * k), nSnow = Math.round(MAX.snow * sky.snow * k), nLeaf = Math.round(MAX.leaves * sky.leaves * k);
        const nPetal = Math.round(MAX.petals * sky.petals * k);
        run(rain, rainP, nRain, f.dt, f.t, 15, 0, () => m.compose(p, lean, s));
        run(snow, snowP, nSnow, f.dt, f.t, 1.3, 0.5, () => m.compose(p, upright, s));
        run(leaves, leafP, nLeaf, f.dt, f.t, 0.9, 0.9, (ph, t) => {
          m.compose(p, q.setFromEuler(e.set(t * 1.6 + ph, ph * 2, t * 0.9 + ph)), s);
        });
        run(petals, petalP, nPetal, f.dt, f.t, 0.55, 1.1, (ph, t) => {
          m.compose(p, q.setFromEuler(e.set(t * 0.8 + ph, t * 0.5, t * 1.2 + ph)), s);
        });
      },
      quality(rs) { effects = rs.effects; },
    };
  },
};
