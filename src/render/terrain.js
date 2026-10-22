// Ground: jittered fractal-noise hills, sage palette by patch, river water plane, farmland strips.
import * as THREE from '../../vendor/three/three.module.min.js';
import { fbm, hash, heightAt } from '../world/terrain.js';
import { CROPS } from '../world/palettes.js';
import { toonUncached, canvasTexture } from './materials.js';
import { patchSeason } from './season.js';
import { Batch, xf } from './geom.js';

const S = 380, N = 150;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function buildTerrain(parent) {
  const geo = new THREE.PlaneGeometry(S, S, N, N);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), z = p.getZ(i);
    if (Math.abs(x) < S / 2 - 3 && Math.abs(z) < S / 2 - 3) { x += (hash(i, 7) - 0.5) * 1.9; z += (hash(i, 13) - 0.5) * 1.9; }
    p.setX(i, x); p.setZ(i, z); p.setY(i, heightAt(x, z));
  }
  const g2 = geo.toNonIndexed();
  geo.dispose();
  g2.computeVertexNormals();
  const q = g2.attributes.position, col = new Float32Array(q.count * 3);
  const sage = new THREE.Color(0x9DB874), olive = new THREE.Color(0x748A55), bed = new THREE.Color(0x6F7F5C), lawn = new THREE.Color(0xA9C47F);
  const meadow = new THREE.Color(0xB7CB82), deep = new THREE.Color(0x83A367), flower = new THREE.Color(0xD9C07A), c = new THREE.Color();
  for (let i = 0; i < q.count; i += 3) {
    const cy = (q.getY(i) + q.getY(i + 1) + q.getY(i + 2)) / 3, cx = (q.getX(i) + q.getX(i + 1) + q.getX(i + 2)) / 3, cz = (q.getZ(i) + q.getZ(i + 1) + q.getZ(i + 2)) / 3;
    const m = fbm(cx * 0.05 + 11, cz * 0.05 + 4), hv = hash(i, 5);
    c.copy(sage).lerp(m > 0.5 ? meadow : deep, Math.min(1, Math.abs(m - 0.5) * 2.4));
    c.lerp(olive, smooth(0.8, 5, cy));
    if (cy < -0.2) c.copy(bed);
    c.multiplyScalar(0.94 + hv * 0.12);
    if (hv > 0.985 && cy > -0.2) c.lerp(flower, 0.5);
    if (Math.max(Math.abs(cx), Math.abs(cz)) < 32) c.lerp(lawn, 0.5);
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
  }
  g2.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const land = new THREE.Mesh(g2, patchSeason(toonUncached(0xffffff, { vertexColors: true }), { leaf: true }));
  land.receiveShadow = true;
  parent.add(land);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(S, S), patchSeason(toonUncached(0x7FA3B8), { still: true }));
  water.rotation.x = -Math.PI / 2; water.position.y = -0.55;
  parent.add(water);
}

// One crop's ground: a base colour with rows running the length of the field, a darker furrow and a light ridge.
function cropCanvas({ base, row }) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const x = cv.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 64, 64);
  x.fillStyle = row; for (let k = 0; k < 64; k += 16) x.fillRect(k + 2, 0, 5, 64);
  x.fillStyle = 'rgba(255,250,235,.22)'; for (let k = 0; k < 64; k += 16) x.fillRect(k + 9, 0, 2, 64);
  return cv;
}

// Farm fields: each field is a crop plane with rows along its length and a hedge on all four sides. The planes share
// one material per crop, and the hedges merge into two meshes (body and cap) plus one ink line set: seven draw calls.
export function buildFarms(parent, farms) {
  const batch = new Batch();
  const mats = CROPS.map((c) => patchSeason(toonUncached(0xffffff, { map: canvasTexture(cropCanvas(c)) }), { field: true }));
  const hedge = patchSeason(toonUncached(0x6E9A4E), { leaf: true });
  const hedgeTop = patchSeason(toonUncached(0x9CC26A), { leaf: true });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const H = 0.7, T = 0.5, Y = 0.07;
  for (const f of farms) {
    const plane = new THREE.PlaneGeometry(f.w, f.d);
    const uv = plane.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * f.w / 3, uv.getY(i) * f.d / 3);
    batch.add(plane, mats[f.crop], xf(f.x, Y, f.z, -Math.PI / 2, 0, f.turned ? Math.PI / 2 : 0), { cast: false });
    plane.dispose();
    // the field's half sizes along world x and z (a turned field swaps them)
    const hx = (f.turned ? f.d : f.w) / 2, hz = (f.turned ? f.w : f.d) / 2;
    const sides = [[0, -hz, 2 * hx, 0], [0, hz, 2 * hx, 0], [-hx, 0, 0, 2 * hz], [hx, 0, 0, 2 * hz]];
    for (const [dx, dz, lenX, lenZ] of sides) {
      const x = f.x + dx, z = f.z + dz;
      const sx = lenX || T, sz = lenZ || T;
      batch.add(box, hedge, xf(x, Y + H / 2, z, 0, 0, 0, sx, H, sz), { edge: true, cast: false });
      batch.add(box, hedgeTop, xf(x, Y + H + 0.04, z, 0, 0, 0, sx * 0.92, 0.1, sz * 0.92), { cast: false });
    }
  }
  batch.build(parent);
}
