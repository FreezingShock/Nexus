// Z-fight detector for building models (used by scripts/audit-models.mjs and tests/model-zfight.test.js).
// A z-fight candidate is a pair of triangles from different parts that lie in the same plane, face the same way (and not
// down: undersides are never seen from the camera) and overlap, so the depth buffer cannot decide which one wins.
import * as THREE from '../../vendor/three/three.module.min.js';

const EPS = 0.004;
const v = (a, i, m) => new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(m);

function worldTris(parts) {
  const out = [];
  parts.forEach((p, pi) => {
    const g = p.geo, pos = g.attributes.position, idx = g.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      const a = v(pos, ia, p.local), b = v(pos, ib, p.local), c = v(pos, ic, p.local);
      const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      if (nrm.length() / 2 < 1e-6) continue;
      nrm.normalize();
      out.push({ pi, a, b, c, n: nrm, d: nrm.dot(a) });
    }
  });
  return out;
}
const inside = (t, p) => {
  const e = (u, w) => new THREE.Vector3().subVectors(w, u).cross(new THREE.Vector3().subVectors(p, u)).dot(t.n);
  return e(t.a, t.b) >= -1e-4 && e(t.b, t.c) >= -1e-4 && e(t.c, t.a) >= -1e-4;
};
// interior points only: edges that merely touch must not count as overlap
const samples = (t) => [[1 / 3, 1 / 3], [.6, .2], [.2, .6], [.2, .2]].map(([u, w]) => t.a.clone().multiplyScalar(1 - u - w).addScaledVector(t.b, u).addScaledVector(t.c, w));
const overlap = (x, y) => samples(x).some((p) => inside(y, p)) || samples(y).some((p) => inside(x, p));
const boxOf = (p) => { const b = new THREE.Box3().setFromBufferAttribute(p.geo.attributes.position).applyMatrix4(p.local); return `[${p.color.getHexString()} ${b.min.toArray().map((q) => q.toFixed(2))}..${b.max.toArray().map((q) => q.toFixed(2))}]`; };

// parts: what buildParts() returns. Gives one entry per pair of parts that fight.
export function zFights(parts) {
  const tris = worldTris(parts), found = new Map();
  for (let i = 0; i < tris.length; i++) for (let j = i + 1; j < tris.length; j++) {
    const x = tris[i], y = tris[j];
    if (x.pi === y.pi || x.n.dot(y.n) < 0.999 || x.n.y < -0.5 || Math.abs(x.d - y.d) > EPS || !overlap(x, y)) continue;
    const key = Math.min(x.pi, y.pi) + '-' + Math.max(x.pi, y.pi);
    if (!found.has(key)) found.set(key, { normal: x.n.toArray().map((q) => +q.toFixed(2)), at: x.a.toArray().map((q) => +q.toFixed(2)), boxes: [boxOf(parts[x.pi]), boxOf(parts[y.pi])] });
  }
  return [...found.values()];
}
