// Festive costumes for the townsfolk (src/render/festive/costumes.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import { PARTS, WARDROBE, costumeFor, costumeGeometry, costumeLayer } from '../src/render/festive/costumes.js';
import { createActors } from '../src/render/life/pools.js';

test('every costume part is in the merged geometry, and every wardrobe names real parts', () => {
  const g = costumeGeometry();
  const parts = new Set(g.attributes.aPart.array);
  for (let i = 0; i < PARTS.length; i++) assert.ok(parts.has(i), PARTS[i]);
  assert.equal(g.attributes.aPart.count, g.attributes.position.count);
  for (const [ev, list] of Object.entries(WARDROBE)) {
    assert.ok(list.reduce((a, r) => a + r[1], 0) < 0.6, ev + ': plenty come as themselves');
    for (const [part] of list) assert.ok(PARTS.includes(part));
  }
});

test('who wears what is steady per person, and nobody dresses up on an ordinary day', () => {
  assert.equal(costumeFor('', 5), null);
  assert.deepEqual(costumeFor('halloween', 77), costumeFor('halloween', 77));
  const worn = Array.from({ length: 1000 }, (_, i) => costumeFor('christmas', i)).filter(Boolean);
  assert.ok(worn.length > 350 && worn.length < 600, 'about half: ' + worn.length);
  assert.ok(worn.some((w) => PARTS[w.kind] === 'antlers') && worn.some((w) => PARTS[w.kind] === 'santa'));
});

test('a crowd changes into costume when the event starts, sharing its matrices, and out again after', () => {
  const world = new THREE.Group();
  const actors = createActors(world, 16);
  const layer = world.children.find((o) => o.isInstancedMesh && o.geometry.attributes.aKind);
  assert.ok(layer, 'the costume layer rides along');
  assert.equal(layer.instanceMatrix, actors.mesh.instanceMatrix);
  for (let i = 0; i < 16; i++) actors.spawn({ pts: [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 4, z: 0 }], doorY: 0 });
  actors.setEvent('halloween');
  actors.step(0.1, 0);
  assert.equal(layer.visible, true);
  assert.ok(layer.geometry.attributes.aKind.array.slice(0, 16).some((k) => k >= 0));
  actors.setEvent('');
  actors.step(0.1, 0);
  assert.equal(layer.visible, false);
  assert.ok(layer.geometry.attributes.aKind.array.every((k) => k === -1));
  const lone = costumeLayer(world, actors.mesh, 16);
  lone.dress(0, 'july4', 3); lone.sync();
  assert.equal(lone.mesh.count, actors.mesh.count);
});

test('Snoopy Days dresses a few townsfolk as white beagles and flying aces', () => {
  const worn = Array.from({ length: 1000 }, (_, i) => costumeFor('snoopy', i)).filter(Boolean);
  assert.ok(worn.some((w) => PARTS[w.kind] === 'beagle') && worn.some((w) => PARTS[w.kind] === 'ace'));
  assert.ok(worn.length > 200 && worn.length < 450);
});
