// Level-up arrows: a few soft green up-arrows float up from a building's roof and fade, right as its new level appears.
// Inked mint arrows (drawn unlit so they stay readable in any light) with a faint additive glow behind each (two instanced
// meshes, two draw calls), hidden while nothing is rising. They face the camera, so they read from any angle.
//
// API for render code (scene.sys('arrows')): burst(x, y, z, count)   (y is the roof height)
import * as THREE from '../../../vendor/three/three.module.min.js';

const MAX = 40;
const LIFE = 1.5;                         // seconds one arrow lives, after its small start delay
const RISE = 3.2;                         // how far it floats up
const INK_C = new THREE.Color('#3B2F2A'), FILL_C = new THREE.Color('#79C9A2'), LIGHT_C = new THREE.Color('#BDEBD2');   // the town's ink and mint
const GLOW = '#9ADBBB';
const HALO = 2.1;                                    // a small soft glow, this many times the arrow's size

// One flat, vertex-coloured arrow: an ink outline behind, mint fill, and a lighter highlight stripe on its left edge.
function arrowGeometry() {
  const parts = [
    { pts: [[0, 1.14], [0.78, 0.1], [0.37, 0.1], [0.37, -0.94], [-0.37, -0.94], [-0.37, 0.1], [-0.78, 0.1]], z: -0.04, col: INK_C },
    { pts: [[0, 0.9], [0.62, 0.15], [0.24, 0.15], [0.24, -0.8], [-0.24, -0.8], [-0.24, 0.15], [-0.62, 0.15]], z: 0.02, col: FILL_C },
    { pts: [[0, 0.7], [-0.4, 0.2], [-0.5, 0.2], [0, 0.78]], z: 0.04, col: LIGHT_C },
    { pts: [[-0.17, 0.1], [-0.09, 0.1], [-0.09, -0.68], [-0.17, -0.68]], z: 0.04, col: LIGHT_C },
  ];
  const pos = [], col = [], idx = [];
  for (const { pts, z, col: cc } of parts) {
    const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))));
    const base = pos.length / 3, a = g.attributes.position;
    for (let i = 0; i < a.count; i++) { pos.push(a.getX(i), a.getY(i), z); col.push(cc.r, cc.g, cc.b); }
    for (const i of g.index.array) idx.push(base + i);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  return out;
}

export default {
  id: 'arrows',
  create({ world, camera }) {
    let effects = 1;
    const mesh = new THREE.InstancedMesh(arrowGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false, fog: false }), MAX);
    mesh.frustumCulled = false; mesh.visible = false; mesh.count = MAX;
    mesh.castShadow = mesh.receiveShadow = false;
    world.add(mesh);

    // The glow: a soft radial sprite, added onto whatever is behind it so it lights the roof and air round the arrow.
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const cx = cv.getContext('2d'), gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
    const halo = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(cv), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
    }), MAX);
    halo.frustumCulled = false; halo.visible = false; halo.count = MAX; halo.renderOrder = 5;
    world.add(halo);
    const back = new THREE.Vector3();

    const age = new Float32Array(MAX).fill(LIFE);    // >= LIFE means the slot is free; negative means waiting to start
    const px = new Float32Array(MAX), py = new Float32Array(MAX), pz = new Float32Array(MAX), size = new Float32Array(MAX), ph = new Float32Array(MAX);
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Quaternion();
    const c = new THREE.Color();
    for (let i = 0; i < MAX; i++) halo.setColorAt(i, c.set(GLOW));
    let active = 0;
    function hide(i) { s.set(0, 0, 0); p.set(px[i], py[i], pz[i]); m.compose(p, q, s); mesh.setMatrixAt(i, m); halo.setMatrixAt(i, m); }

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
          k++;
        }
        if (k) { active += k; mesh.visible = halo.visible = true; }
      },
      frame(f) {
        if (!active) return;
        if (camera?.cam) q.copy(camera.cam.quaternion);
        back.set(0, 0, -0.5).applyQuaternion(q);     // the glow sits just behind its arrow, seen from the camera
        let live = 0;
        for (let i = 0; i < MAX; i++) {
          if (age[i] >= LIFE) continue;
          age[i] += f.dt;
          const t = age[i];
          if (t < 0) { hide(i); live++; continue; }
          const k = Math.min(1, t / LIFE);
          if (k >= 1) { hide(i); continue; }
          live++;
          const ease = 1 - (1 - k) * (1 - k);
          const grow = Math.min(1, k / 0.2), gone = 1 - Math.max(0, (k - 0.6) / 0.4);   // pops in, shrinks away at the top
          const sc = size[i] * grow * gone;
          p.set(px[i] + Math.sin(ph[i] + t * 3) * 0.25, py[i] + ease * RISE, pz[i]);
          s.set(sc, sc, sc);
          m.compose(p, q, s);
          mesh.setMatrixAt(i, m);
          const gl = sc * HALO * (0.85 + 0.15 * Math.sin(t * 9 + ph[i]));
          p.add(back); s.set(gl, gl, gl);
          m.compose(p, q, s);
          halo.setMatrixAt(i, m);
        }
        mesh.instanceMatrix.needsUpdate = halo.instanceMatrix.needsUpdate = true;
        active = live;
        if (!live) mesh.visible = halo.visible = false;
      },
      quality(rs) { effects = rs.effects; },
    };
  },
};
