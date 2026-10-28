// The zoning ghost: see-through buildings only where something could grow (open ground beside a road), nothing in the sim.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import ghost from '../src/render/systems/zone-ghost.js';

function fakeGrid(open) {
  return { isOpen: (x, z) => open(x, z), roadBeside: (x, z) => x === 5, roadAt: (x, z) => (x === 4 ? 1 : 0) };
}
const meshes = (world) => world.children[0].children;

test('ghosts appear only on open tiles beside a road, and hide again', () => {
  const world = new THREE.Group();
  const g = ghost.create({ THREE, world, grid: fakeGrid((x) => x !== 7) });
  const root = world.children[0];
  g.show([[5, 5], [5, 6], [6, 5], [7, 5]], 1);
  assert.equal(root.visible, true);
  assert.ok(meshes(world).length > 0);
  for (const m of meshes(world)) assert.ok(!m.material.depthWrite && m.material.transparent && m.material.opacity < 1);
  g.show([[6, 5], [7, 5]], 1); // no tile beside a road
  assert.equal(root.visible, false);
  assert.equal(meshes(world).length, 0);
  g.show([[5, 5]], 2); g.hide();
  assert.equal(root.visible, false);
});

test('the same tiles give the same ghosts (no re-roll while a drag grows)', () => {
  const world = new THREE.Group();
  const g = ghost.create({ THREE, world, grid: fakeGrid(() => true) });
  g.show([[5, 5], [5, 6]], 3);
  const a = meshes(world).map((m) => m.geometry.attributes.position.count).join();
  g.show([[5, 5], [5, 6]], 3);
  assert.equal(meshes(world).map((m) => m.geometry.attributes.position.count).join(), a);
});
