// Geometry helpers: merge many parts into one mesh per material, plus one line buffer for the ink edges.
import * as THREE from '../../vendor/three/three.module.min.js';
import { lineMat } from './materials.js';

const nm = new THREE.Matrix3();
const tmpM = new THREE.Matrix4();

// Gives an InstancedMesh a colour buffer sized to its full capacity (instanceMatrix.count), white where nothing sets
// a colour. three.js sizes the buffer from `mesh.count` the first time setColorAt runs, so a mesh that starts empty gets
// a zero-length buffer, and the draw call then fails with "Vertex buffer is not big enough". Call this before the first
// setColorAt, and before the mesh's count grows.
export function allocInstanceColors(mesh) {
  const cap = mesh.instanceMatrix.count;
  if (mesh.instanceColor && mesh.instanceColor.count >= cap) return mesh;
  const arr = new Float32Array(cap * 3).fill(1);
  if (mesh.instanceColor) arr.set(mesh.instanceColor.array.subarray(0, arr.length));
  mesh.instanceColor = new THREE.InstancedBufferAttribute(arr, 3);
  return mesh;
}

// three.js compiles one shader program per material and per instanceColor setting, and an InstancedMesh without
// instanceColor can end up drawn with the program of one that has it. The first frame then throws and the town stays
// black. Every instanced mesh in the tree gets a full-capacity colour buffer, so no two can disagree.
export function ensureInstanceColors(root) {
  root.traverse((o) => { if (o.isInstancedMesh) allocInstanceColors(o); });
  return root;
}

// Parts are only recorded by add(); build() sizes typed arrays once and transforms every vertex straight into them.
// (Pushing into growing JS arrays and a Vector3 per vertex made a 500-lot town take over a second to merge.)
export class Batch {
  constructor() { this.buckets = new Map(); this.lines = []; this.edgeItems = []; }

  // Returns where the part landed in its bucket: { bucket, start, count } in vertices.
  add(geo, material, matrix, o = {}) {
    const { edge = false, cast = true, receive = true, color = null } = o;
    const key = material.uuid + (cast ? 'c' : '') + (receive ? 'r' : '');
    let b = this.buckets.get(key);
    if (!b) { b = { material, cast, receive, items: [], n: 0, ni: 0, hasColor: false }; this.buckets.set(key, b); }
    const count = geo.attributes.position.count, start = b.n;
    b.items.push({ geo, e: matrix.elements.slice(), color });
    if (color) b.hasColor = true;
    b.n += count;
    b.ni += geo.index ? geo.index.count : count;
    if (edge) this.addEdges(geo, matrix);
    return { bucket: b, start, count };
  }

  // Ink edge lines for a part (creases above 30 degrees), transformed into the merged line buffer.
  addEdges(geo, matrix) {
    const e = new THREE.EdgesGeometry(geo, 30);
    this.addLines(e.attributes.position.array, matrix);
    e.dispose();
  }

  // Line-segment positions (x, y, z per point) in the part's own space, drawn through `matrix`. The array is kept, not copied.
  addLines(positions, matrix) {
    if (positions.length) this.edgeItems.push({ arr: positions, e: matrix.elements.slice() });
  }

  // A finished part list baked into world-space typed arrays, to be merged again later with addBaked() for the cost of
  // a copy. Grown lots bake each building once and reuse it on every rebuild of the town.
  bake() {
    const buckets = [];
    for (const [key, b] of this.buckets) buckets.push({ key, material: b.material, cast: b.cast, receive: b.receive, n: b.n, ni: b.ni, ...fillBucket(b, true) });
    return { buckets, lines: fillLines(this) };
  }

  addBaked(baked) {
    for (const k of baked.buckets) {
      let b = this.buckets.get(k.key);
      if (!b) { b = { material: k.material, cast: k.cast, receive: k.receive, items: [], n: 0, ni: 0, hasColor: false }; this.buckets.set(k.key, b); }
      b.items.push({ baked: k });
      if (k.col) b.hasColor = true;
      b.n += k.n; b.ni += k.ni;
    }
    if (baked.lines) this.edgeItems.push({ arr: baked.lines, e: null });
  }

  // Creates the meshes under `parent` and returns them.
  build(parent) {
    const out = [];
    for (const b of this.buckets.values()) {
      const { pos, nor, uv, col, idx } = fillBucket(b, false);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      const m = new THREE.Mesh(g, b.material);
      m.castShadow = b.cast; m.receiveShadow = b.receive;
      m.userData.day = b.material;
      b.mesh = m; parent.add(m); out.push(m);
    }
    const lines = fillLines(this);
    if (lines) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(lines, 3));
      const l = new THREE.LineSegments(g, lineMat);
      parent.add(l); out.push(l);
    }
    return out;
  }
}

// One bucket's parts transformed into typed arrays. `wide` keeps 32-bit indices (baked pieces are merged again later).
function fillBucket(b, wide) {
  const pos = new Float32Array(b.n * 3), nor = new Float32Array(b.n * 3), uv = new Float32Array(b.n * 2);
  const col = b.hasColor ? new Float32Array(b.n * 3).fill(1) : null;
  const idx = wide || b.n > 65535 ? new Uint32Array(b.ni) : new Uint16Array(b.ni);
  let vo = 0, io = 0;
  for (const it of b.items) {
    if (it.baked) {
      const k = it.baked;
      pos.set(k.pos, vo * 3); nor.set(k.nor, vo * 3); uv.set(k.uv, vo * 2);
      if (k.col) col.set(k.col, vo * 3);
      const ia = k.idx;
      for (let i = 0; i < ia.length; i++) idx[io++] = ia[i] + vo;
      vo += k.n;
      continue;
    }
    const geo = it.geo, e = it.e;
    const p = geo.attributes.position, n = geo.attributes.normal, u = geo.attributes.uv;
    const pa = p.array, na = n.array;
    const ps = p.isInterleavedBufferAttribute ? p.data.stride : 3, po = p.offset || 0;
    const ns = n.isInterleavedBufferAttribute ? n.data.stride : 3, no = n.offset || 0;
    // Normal matrix: inverse transpose of the upper 3 x 3.
    nm.setFromMatrix4(tmpM.fromArray(e)).invert().transpose();
    const q = nm.elements;
    const count = p.count;
    for (let i = 0; i < count; i++) {
      const pi = i * ps + po, x = pa[pi], y = pa[pi + 1], z = pa[pi + 2];
      const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
      const o3 = (vo + i) * 3;
      pos[o3] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
      pos[o3 + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
      pos[o3 + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
      const ni = i * ns + no, a = na[ni], c = na[ni + 1], d = na[ni + 2];
      const nx = q[0] * a + q[3] * c + q[6] * d, ny = q[1] * a + q[4] * c + q[7] * d, nz = q[2] * a + q[5] * c + q[8] * d;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nor[o3] = nx / len; nor[o3 + 1] = ny / len; nor[o3 + 2] = nz / len;
      if (u) { const o2 = (vo + i) * 2; uv[o2] = u.getX(i); uv[o2 + 1] = u.getY(i); }
      if (it.color) { col[o3] = it.color.r; col[o3 + 1] = it.color.g; col[o3 + 2] = it.color.b; }
    }
    if (geo.index) { const ia = geo.index.array; for (let i = 0; i < geo.index.count; i++) idx[io++] = ia[i] + vo; }
    else for (let i = 0; i < count; i++) idx[io++] = i + vo;
    vo += count;
  }
  return { pos, nor, uv, col, idx };
}

// Every ink edge in the batch as one Float32Array of segment ends in world space, or null when there are none.
function fillLines(batch) {
  let total = batch.lines.length;
  for (const it of batch.edgeItems) total += it.arr.length;
  if (!total) return null;
  const arr = new Float32Array(total);
  let o = 0;
  for (const it of batch.edgeItems) {
    const a = it.arr, e = it.e;
    if (!e) { arr.set(a, o); o += a.length; continue; } // baked: already in world space
    for (let i = 0; i < a.length; i += 3) {
      const x = a[i], y = a[i + 1], z = a[i + 2];
      const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
      arr[o++] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
      arr[o++] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
      arr[o++] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    }
  }
  arr.set(batch.lines, o);
  return arr;
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
