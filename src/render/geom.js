// Geometry helpers: merge many parts into one mesh per material, plus one line buffer for the ink edges.
import * as THREE from '../../vendor/three/three.module.min.js';
import { lineMat } from './materials.js';

const v = new THREE.Vector3();
const nm = new THREE.Matrix3();

export class Batch {
  constructor() { this.buckets = new Map(); this.lines = []; }

  // Returns where the part landed in its bucket: { bucket, start, count } in vertices.
  add(geo, material, matrix, o = {}) {
    const { edge = false, cast = true, receive = true, color = null } = o;
    const key = material.uuid + (cast ? 'c' : '') + (receive ? 'r' : '');
    let b = this.buckets.get(key);
    if (!b) { b = { material, cast, receive, pos: [], nor: [], uv: [], col: [], idx: [], n: 0, hasColor: false }; this.buckets.set(key, b); }
    const p = geo.attributes.position, n = geo.attributes.normal, u = geo.attributes.uv;
    nm.getNormalMatrix(matrix);
    const start = b.n;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix); b.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); b.nor.push(v.x, v.y, v.z);
      if (u) b.uv.push(u.getX(i), u.getY(i)); else b.uv.push(0, 0);
      if (color) { b.col.push(color.r, color.g, color.b); b.hasColor = true; }
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) b.idx.push(geo.index.getX(i) + start);
    else for (let i = 0; i < p.count; i++) b.idx.push(i + start);
    b.n += p.count;
    if (edge) this.addEdges(geo, matrix);
    return { bucket: b, start, count: p.count };
  }

  // Ink edge lines for a part (creases above 30 degrees), transformed into the merged line buffer.
  addEdges(geo, matrix) {
    const e = new THREE.EdgesGeometry(geo, 30), ep = e.attributes.position;
    for (let i = 0; i < ep.count; i++) { v.fromBufferAttribute(ep, i).applyMatrix4(matrix); this.lines.push(v.x, v.y, v.z); }
    e.dispose();
  }

  // Creates the meshes under `parent` and returns them.
  build(parent) {
    const out = [];
    for (const b of this.buckets.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      if (b.hasColor) g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setIndex(b.n > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      const m = new THREE.Mesh(g, b.material);
      m.castShadow = b.cast; m.receiveShadow = b.receive;
      m.userData.day = b.material;
      b.mesh = m; parent.add(m); out.push(m);
    }
    if (this.lines.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.lines, 3));
      const l = new THREE.LineSegments(g, lineMat);
      parent.add(l); out.push(l);
    }
    return out;
  }
}

export function disposeAll(list, parent) {
  for (const o of list) { parent.remove(o); o.geometry.dispose(); }
  list.length = 0;
}

// Cuts an indexed geometry with groups (a BoxGeometry body) into one geometry per group.
export function splitGroups(geo) {
  const idx = geo.index, out = [];
  for (const g of geo.groups) {
    const map = new Map(), pos = [], nor = [], uv = [], ni = [];
    for (let i = g.start; i < g.start + g.count; i++) {
      const o = idx.getX(i);
      let n = map.get(o);
      if (n === undefined) {
        n = map.size; map.set(o, n);
        pos.push(geo.attributes.position.getX(o), geo.attributes.position.getY(o), geo.attributes.position.getZ(o));
        nor.push(geo.attributes.normal.getX(o), geo.attributes.normal.getY(o), geo.attributes.normal.getZ(o));
        uv.push(geo.attributes.uv.getX(o), geo.attributes.uv.getY(o));
      }
      ni.push(n);
    }
    const s = new THREE.BufferGeometry();
    s.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    s.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    s.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    s.setIndex(ni);
    out.push({ materialIndex: g.materialIndex, geo: s });
  }
  return out;
}

export function scaleUV(geo, firstVertex, vertexCount, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = firstVertex; i < firstVertex + vertexCount; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
// Position + euler rotation + scale -> Matrix4.
export function xf(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}
