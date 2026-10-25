// The merge behind every building mesh (render/geom.js Batch): parts go straight into typed arrays, and a baked piece
// merged again later (grown lots, placed buildings) draws exactly what merging its parts directly would.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import { Batch, xf } from '../src/render/geom.js';

const matA = new THREE.MeshLambertMaterial(), matB = new THREE.MeshLambertMaterial();
const red = new THREE.Color(1, 0, 0);

function fill(batch, dx) {
  batch.add(new THREE.BoxGeometry(1, 2, 1), matA, xf(dx, 0, 0, 0, 0.7, 0, 2, 1, 1), { edge: true });
  batch.add(new THREE.ConeGeometry(1, 1, 5), matB, xf(dx, 2, 0), { color: red });
  batch.add(new THREE.BoxGeometry(1, 1, 1), matB, xf(dx, 3, 1));
}
// A mesh's buffers as plain rounded numbers, for comparing two merges.
const dump = (m) => ({
  ...Object.fromEntries(Object.entries(m.geometry.attributes).map(([k, a]) => [k, Array.from(a.array, (x) => Math.round(x * 1e5) / 1e5)])),
  index: m.geometry.index ? Array.from(m.geometry.index.array) : null, mat: m.material.uuid,
});

test('a part is placed by its matrix, with unit normals and one mesh per material plus the ink lines', () => {
  const b = new Batch();
  b.add(new THREE.BoxGeometry(2, 2, 2), matA, xf(10, 1, 0));
  const out = b.build(new THREE.Group());
  assert.equal(out.length, 1);
  const g = out[0].geometry;
  g.computeBoundingBox();
  assert.deepEqual(g.boundingBox.min.toArray(), [9, 0, -1]);
  assert.deepEqual(g.boundingBox.max.toArray(), [11, 2, 1]);
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-5);
  const two = new Batch(); fill(two, 0);
  const meshes = two.build(new THREE.Group());
  assert.equal(meshes.filter((m) => m.isMesh).length, 2);
  assert.equal(meshes.filter((m) => m.isLineSegments).length, 1);
});

test('uncoloured parts in a coloured bucket stay white', () => {
  const b = new Batch(); fill(b, 0);
  const m = b.build(new THREE.Group()).find((o) => o.material === matB);
  const c = m.geometry.attributes.color, last = c.count - 1;
  assert.deepEqual([c.getX(0), c.getY(0), c.getZ(0)], [1, 0, 0]);
  assert.deepEqual([c.getX(last), c.getY(last), c.getZ(last)], [1, 1, 1]);
});

test('baking pieces and merging them again matches merging the parts directly', () => {
  const direct = new Batch(); fill(direct, 0); fill(direct, 5);
  const p1 = new Batch(); fill(p1, 0);
  const p2 = new Batch(); fill(p2, 5);
  const merged = new Batch(); merged.addBaked(p1.bake()); merged.addBaked(p2.bake());
  const a = direct.build(new THREE.Group()), b = merged.build(new THREE.Group());
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].type, b[i].type);
    assert.deepEqual(dump(b[i]), dump(a[i]));
  }
});
