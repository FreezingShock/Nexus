// Level-up arrows: a few soft green up-arrows float up from a building's roof and fade, right as its new level appears.
// One instanced mesh (one draw call), hidden while nothing is rising. They face the camera, so they read from any angle.
//
// API for render code (scene.sys('arrows')): burst(x, y, z, count)   (y is the roof height)
import * as THREE from '../../../vendor/three/three.module.min.js';
import { toonUncached } from '../materials.js';

const MAX = 40;
const LIFE = 1.5;                         // seconds one arrow lives, after its small start delay
const RISE = 3.2;                         // how far it floats up
const COLORS = ['#7CB867', '#9CCB7A', '#63A85E'];

function arrowGeometry() {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.9); sh.lineTo(0.62, 0.15); sh.lineTo(0.24, 0.15); sh.lineTo(0.24, -0.8);
  sh.lineTo(-0.24, -0.8); sh.lineTo(-0.24, 0.15); sh.lineTo(-0.62, 0.15); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: false });
  g.translate(0, 0, -0.11);
  return g;
}

export default {
  id: 'arrows',
  create({ world, camera }) {
    let effects = 1;
    const mesh = new THREE.InstancedMesh(arrowGeometry(), toonUncached(0xffffff), MAX);
    mesh.frustumCulled = false; mesh.visible = false; mesh.count = MAX;
    mesh.castShadow = mesh.receiveShadow = false;
    world.add(mesh);

    const age = new Float32Array(MAX).fill(LIFE);    // >= LIFE means the slot is free; negative means waiting to start
    const px = new Float32Array(MAX), py = new Float32Array(MAX), pz = new Float32Array(MAX), size = new Float32Array(MAX), ph = new Float32Array(MAX);
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Quaternion();
    const c = new THREE.Color();
    for (let i = 0; i < MAX; i++) mesh.setColorAt(i, c.set(COLORS[0]));
    let active = 0;

    return {
      burst(x, y, z, count0 = 4) {
        if (!effects) return;
        const count = Math.max(1, Math.round(count0 * (effects >= 1 ? 1 : 0.5)));
        let k = 0;
        for (let i = 0; i < MAX && k < count; i++) {
          if (age[i] < LIFE) continue;
          const a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.9;
          px[i] = x + Math.cos(a) * r; pz[i] = z + Math.sin(a) * r; py[i] = y + 0.3;
          size[i] = 0.7 + Math.random() * 0.35; ph[i] = Math.random() * 6.28;
          age[i] = -k * 0.16;                        // a gentle one-after-another
          mesh.setColorAt(i, c.set(COLORS[k % COLORS.length]));
          k++;
        }
        if (k) { active += k; mesh.visible = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
      },
      frame(f) {
        if (!active) return;
        if (camera?.cam) q.copy(camera.cam.quaternion);
        let live = 0;
        for (let i = 0; i < MAX; i++) {
          if (age[i] >= LIFE) continue;
          age[i] += f.dt;
          const t = age[i];
          if (t < 0) { s.set(0, 0, 0); p.set(px[i], py[i], pz[i]); m.compose(p, q, s); mesh.setMatrixAt(i, m); live++; continue; }
          const k = Math.min(1, t / LIFE);
          if (k >= 1) { s.set(0, 0, 0); p.set(px[i], py[i], pz[i]); m.compose(p, q, s); mesh.setMatrixAt(i, m); continue; }
          live++;
          const ease = 1 - (1 - k) * (1 - k);
          const grow = Math.min(1, k / 0.2), gone = 1 - Math.max(0, (k - 0.6) / 0.4);   // pops in, shrinks away at the top
          const sc = size[i] * grow * gone;
          p.set(px[i] + Math.sin(ph[i] + t * 3) * 0.25, py[i] + ease * RISE, pz[i]);
          s.set(sc, sc, sc);
          m.compose(p, q, s);
          mesh.setMatrixAt(i, m);
        }
        mesh.instanceMatrix.needsUpdate = true;
        active = live;
        if (!live) mesh.visible = false;
      },
      quality(rs) { effects = rs.effects; },
    };
  },
};
