// Level-up arrows: a few soft green up-arrows float up from a building's roof and fade, right as its new level appears.
// Neon and self-lit: unlit arrows plus an additive soft glow behind each (two instanced meshes, two draw calls), hidden
// while nothing is rising. They face the camera, so they read from any angle.
//
// API for render code (scene.sys('arrows')): burst(x, y, z, count)   (y is the roof height)
import * as THREE from '../../../vendor/three/three.module.min.js';

const MAX = 40;
const LIFE = 1.5;                         // seconds one arrow lives, after its small start delay
const RISE = 3.2;                         // how far it floats up
const COLORS = ['#39FF6A', '#7DFF4A', '#2BFF9A'];   // neon: drawn unlit, so sun, night and rain never dim them
const HALO = 3.4;                                    // the glow is this many times the arrow's size

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
    const mesh = new THREE.InstancedMesh(arrowGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }), MAX);
    mesh.frustumCulled = false; mesh.visible = false; mesh.count = MAX;
    mesh.castShadow = mesh.receiveShadow = false;
    world.add(mesh);

    // The glow: a soft radial sprite, added onto whatever is behind it so it lights the roof and air round the arrow.
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const cx = cv.getContext('2d'), gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
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
    for (let i = 0; i < MAX; i++) { mesh.setColorAt(i, c.set(COLORS[0])); halo.setColorAt(i, c.set(COLORS[0])); }
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
          mesh.setColorAt(i, c.set(COLORS[k % COLORS.length])); halo.setColorAt(i, c);
          k++;
        }
        if (k) { active += k; mesh.visible = halo.visible = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; if (halo.instanceColor) halo.instanceColor.needsUpdate = true; }
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
