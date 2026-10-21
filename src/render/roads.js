// Roads: sidewalks, asphalt (vertex colors carry the traffic tint), dashes and zebras, all merged.
import * as THREE from '../../vendor/three/three.module.min.js';
import { toon, toonUncached, canvasTexture } from './materials.js';
import { Batch, xf } from './geom.js';

const BASE = new THREE.Color(0x8E8576);
const TRAFFIC = [new THREE.Color(0x9DB37C), new THREE.Color(0xD9B45F), new THREE.Color(0xB8472E)];

function dashCanvas() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 8;
  const x = c.getContext('2d'); x.fillStyle = '#FAF3E4'; x.fillRect(0, 2, 32, 4); return c;
}
function zebraCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'); x.fillStyle = '#FAF3E4';
  for (let i = 0; i < 4; i++) x.fillRect(i * 8 + 1, 0, 5, 32);
  return c;
}
const flat = (w, h, su, sv) => {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
};

export function buildRoads(parent, layout) {
  const body = new Batch(), marks = new Batch(), zebras = new Batch();
  const roadMat = toonUncached(0xffffff, { vertexColors: true });
  const dashMat = new THREE.MeshBasicMaterial({ map: canvasTexture(dashCanvas()), transparent: true });
  const zebraMat = new THREE.MeshBasicMaterial({ map: canvasTexture(zebraCanvas()), transparent: true });
  const sideMat = toon(0xDDD3C0);
  const ranges = [];

  for (const s of layout.segs) {
    const horiz = s.ax === 'x', len = s.len, w = s.w;
    const px = horiz ? s.center : s.fixed, pz = horiz ? s.fixed : s.center;
    body.add(new THREE.BoxGeometry(horiz ? len : 4.8, 0.1, horiz ? 4.8 : len), sideMat, xf(px, 0.05, pz), { cast: false });
    const r = body.add(new THREE.BoxGeometry(horiz ? len : w, 0.12, horiz ? w : len), roadMat, xf(px, 0.06, pz), { cast: false, color: BASE });
    body.addEdges(new THREE.BoxGeometry(horiz ? len : w, 0.12, horiz ? w : len), xf(px, 0.06, pz));
    ranges.push({ r, flow: s.flow });
    marks.add(flat(len - 0.4, 0.18, len / 2.4, 1), dashMat, xf(px, 0.135, pz, -Math.PI / 2, 0, horiz ? 0 : Math.PI / 2), { cast: false });
    for (const e of [-1, 1]) {
      const zx = px + (horiz ? e * (len / 2 - 0.8) : 0), zz = pz + (horiz ? 0 : e * (len / 2 - 0.8));
      zebras.add(flat(1.1, w - 0.2, 1, 1), zebraMat, xf(zx, 0.136, zz, -Math.PI / 2, 0, horiz ? 0 : Math.PI / 2), { cast: false });
    }
  }
  for (const [a, b] of layout.intersections) body.add(new THREE.BoxGeometry(3.2, 0.12, 3.2), roadMat, xf(a, 0.06, b), { cast: false, color: BASE });
  body.build(parent); marks.build(parent); zebras.build(parent);

  const mesh = [...body.buckets.values()].find((b) => b.material === roadMat).mesh;
  const set = (on) => {
    const col = mesh.geometry.attributes.color;
    for (const { r, flow } of ranges) {
      const f = Math.min(1, flow), a = f < 0.5 ? TRAFFIC[0] : TRAFFIC[1], b = f < 0.5 ? TRAFFIC[1] : TRAFFIC[2], u = f < 0.5 ? f * 2 : (f - 0.5) * 2;
      const c = on ? new THREE.Color().copy(a).lerp(b, u) : BASE;
      for (let i = 0; i < r.count; i++) col.setXYZ(r.start + i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  };
  return { setTraffic: set };
}
