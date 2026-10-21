// The dusk plate on the postcard stamp: the same building parts, lit windows, a moon and fireflies.
// Rendered with the main renderer into a small render target (one GL context), then copied to the stamp canvases.
import * as THREE from '../../vendor/three/three.module.min.js';
import { makeRng } from '../world/rng.js';
import { toon, INK, hullInk } from './materials.js';
import { makeParts, worldMatrix } from './buildings.js';
import { mergeBuildings } from './town.js';
import { Batch, xf } from './geom.js';

const W = 280, H = 320;

function skyTexture(rng) {
  const c = document.createElement('canvas'); c.width = 140; c.height = 280;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 280);
  g.addColorStop(0, '#252C4D'); g.addColorStop(0.5, '#4A4F7E'); g.addColorStop(0.8, '#9C7C93'); g.addColorStop(1, '#E3A08E');
  x.fillStyle = g; x.fillRect(0, 0, 140, 280);
  x.fillStyle = '#FFF6DC';
  for (let i = 0; i < 30; i++) x.fillRect(Math.floor(rng() * 138), Math.floor(rng() * 130), 2, 2);
  x.fillStyle = '#FFF1CC'; x.beginPath(); x.arc(108, 34, 13, 0, 6.3); x.fill();
  x.fillStyle = '#F0D79A'; x.beginPath(); x.arc(113, 38, 10, 0, 6.3); x.fill();
  x.fillStyle = '#FFF1CC'; x.beginPath(); x.arc(106, 32, 11, 0, 6.3); x.fill();
  return new THREE.CanvasTexture(c);
}

export function createDusk(renderer) {
  const rng = makeRng(5);
  const sc = new THREE.Scene(); sc.background = skyTexture(rng);
  sc.add(new THREE.HemisphereLight(0x9AA8D8, 0x4A4A5E, 0.95));
  const mo = new THREE.DirectionalLight(0xC9D6FF, 0.6); mo.position.set(-18, 26, 12); mo.castShadow = true;
  Object.assign(mo.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 80 });
  mo.shadow.mapSize.set(1024, 1024); mo.shadow.bias = -0.0008; sc.add(mo);
  const root = new THREE.Group(); sc.add(root);

  const ground = new Batch();
  ground.add(new THREE.CylinderGeometry(13, 13.6, 1.2, 40), toon(0x6E8456), xf(0, -0.6, 0), { edge: true });
  ground.add(new THREE.CylinderGeometry(13.6, 12.2, 1.4, 40), toon(0x5B4636), xf(0, -1.9, 0), { edge: true });
  ground.add(new THREE.BoxGeometry(24, 0.1, 3), toon(0x6B6A7A), xf(0, 0.05, 7), { cast: false });
  ground.build(root);

  const spec = (o, x, z, extra) => ({ id: '', type: 'house', name: '', dx: (rng() - 0.5) * o.w * 0.3, awning: o.floors <= 3 ? 0 : -1, level: 1, x, z, rotY: 0, ...o, ...extra });
  const items = [
    spec({ w: 3.8, d: 3.6, floors: 3, pal: 'warm', roof: 'gable' }, -6, 3),
    spec({ w: 4, d: 3.8, floors: 5, pal: 'pastel', roof: 'mansard' }, -0.5, -3.5),
    spec({ w: 3.6, d: 3.6, floors: 2, pal: 'green', roof: 'hip' }, 5, 3),
  ].map((b) => ({ parts: makeParts(b), world: worldMatrix(b) }));
  const church = spec({ type: 'church', w: 3.4, d: 6.4, floors: 2, pal: 'slate', roof: 'gable', awning: -1 }, 6.5, -5);
  items.push({ parts: makeParts(church), world: worldMatrix(church, 0.75) });
  mergeBuildings(root, items, true);

  const lampM = new THREE.MeshBasicMaterial({ color: 0xFFD27A });
  const lamps = new Batch();
  for (const x of [-8, -1, 6]) {
    lamps.add(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), toon(INK), xf(x, 1.3, 5.3));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lampM); bulb.position.set(x, 2.7, 5.3); root.add(bulb);
    const pl = new THREE.PointLight(0xFFC870, 1.1, 10, 2); pl.position.set(x, 2.5, 5.6); root.add(pl);
  }
  lamps.build(root);

  const leafs = [0x6E8456, 0x7D8A5E, 0x8A7A4A];
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 1.2, 5), leafGeo = new THREE.IcosahedronGeometry(1, 0), hullGeo = new THREE.IcosahedronGeometry(1.09, 0);
  [[-9, -1, 1.2], [-8, -6, 1.4], [9, 3, 1.1], [2.5, -8, 1.3], [-3, 9, 0.9], [10, -1, 1], [-11, 2, 0.9], [1, 2.4, 0.8]].forEach((t, i) => {
    const g = new THREE.Group();
    const tr = new THREE.Mesh(trunkGeo, toon(0x5B4636)); tr.position.y = 0.6; g.add(tr);
    const can = new THREE.Mesh(leafGeo, toon(leafs[i % 3])); can.position.y = 1.9; can.castShadow = true; g.add(can);
    const hull = new THREE.Mesh(hullGeo, hullInk); hull.position.y = 1.9; g.add(hull);
    g.position.set(t[0], 0.1, t[1]); g.scale.setScalar(t[2]); root.add(g);
  });

  const N = 44, fp = new Float32Array(N * 3), fb = [];
  for (let i = 0; i < N; i++) { const a = rng() * 6.28, rr = rng() * 11; fb.push([Math.cos(a) * rr, 1 + rng() * 4.5, Math.sin(a) * rr, rng() * 6.28]); }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  const fire = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xFFE9A0, size: 5, sizeAttenuation: false, transparent: true, opacity: 0.95 }));
  fire.frustumCulled = false; root.add(fire);

  const half = 16, a = W / H, cm = new THREE.OrthographicCamera(-half * a, half * a, half, -half, 1, 300);
  const rt = new THREE.WebGLRenderTarget(W, H), buf = new Uint8Array(W * H * 4), img = new ImageData(new Uint8ClampedArray(W * H * 4), W, H);
  const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;

  return {
    // Draws the plate and copies it (flipped, as readback is bottom-up) to each stamp canvas.
    render(t, canvases) {
      const az = 0.6 + Math.sin(t * 0.12) * 0.45, el = 0.5;
      cm.position.set(Math.sin(az) * Math.cos(el) * 80, Math.sin(el) * 80 + 2, Math.cos(az) * Math.cos(el) * 80); cm.lookAt(0, 0.4, 0);
      for (let i = 0; i < N; i++) {
        const f = fb[i];
        fp[i * 3] = f[0] + Math.sin(t * 0.5 + f[3]) * 0.8; fp[i * 3 + 1] = f[1] + Math.sin(t * 0.9 + f[3] * 2) * 0.5; fp[i * 3 + 2] = f[2] + Math.cos(t * 0.4 + f[3]) * 0.8;
      }
      fg.attributes.position.needsUpdate = true;
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt); renderer.render(sc, cm); renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
      renderer.setRenderTarget(prev);
      img.data.set(buf); tmp.getContext('2d').putImageData(img, 0, 0);
      for (const c of canvases) {
        const x = c.getContext('2d'); x.save(); x.translate(0, c.height); x.scale(1, -1); x.drawImage(tmp, 0, 0, c.width, c.height); x.restore();
      }
    },
  };
}
