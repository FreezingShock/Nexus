// The zoning ghost: real models drawn instanced, only where something could grow (open ground beside a road).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import ghost from '../src/render/systems/zone-ghost.js';

const fakeGrid = (open) => ({ isOpen: (x, z) => open(x, z), roadBeside: (x) => x === 5, roadAt: (x) => (x === 4 ? 1 : 0) });
const meshes = (world) => world.children[0].children;
const shown = (world) => meshes(world).filter((m) => m.visible && m.count > 0);
const total = (world) => meshes(world).reduce((n, m) => n + (m.visible ? m.count : 0), 0);

test('ghosts appear only on open tiles beside a road, as instances, and hide again', () => {
  const world = new THREE.Group();
  const g = ghost.create({ THREE, world, grid: fakeGrid((x) => x !== 7) });
  const root = world.children[0];
  g.show([[5, 5], [5, 6], [6, 5], [7, 5]], 1, 'a');
  assert.equal(root.visible, true);
  assert.ok(meshes(world).every((m) => m.isInstancedMesh && m.material.transparent && !m.material.depthWrite));
  assert.ok(total(world) >= 2 && total(world) % 2 === 0 || total(world) > 0);
  g.show([[6, 5], [7, 5]], 1, 'b'); // no tile beside a road
  assert.equal(root.visible, false);
  assert.equal(shown(world).length, 0);
  g.show([[5, 5]], 2, 'c'); g.hide();
  assert.equal(root.visible, false);
});

test('an unchanged brush costs nothing, and the same tiles give the same ghosts', () => {
  const world = new THREE.Group();
  const g = ghost.create({ THREE, world, grid: fakeGrid(() => true) });
  g.show([[5, 5], [5, 6]], 3, 's');
  const snap = () => shown(world).map((m) => m.count + ':' + Array.from(m.instanceMatrix.array.slice(0, 16 * m.count)).join()).join('|');
  const a = snap();
  g.show([[5, 5], [5, 6]], 3, 's');
  assert.equal(snap(), a);
  g.hide(); g.show([[5, 5], [5, 6]], 3, 's2');
  assert.equal(snap(), a);
});

test('buildings are built once per zone, never per brush move', () => {
  const world = new THREE.Group();
  const g = ghost.create({ THREE, world, grid: fakeGrid(() => true) });
  g.show([[5, 5]], 1, 'x');
  const n = meshes(world).length, geos = meshes(world).map((m) => m.geometry);
  for (let i = 0; i < 20; i++) g.show([[5, i], [5, i + 1]], 1, 'm' + i);
  assert.equal(meshes(world).length, n);
  assert.ok(meshes(world).every((m, i) => m.geometry === geos[i]));
});

test('showPainted ghosts painted empty tiles of any zone, facing the road being drawn', () => {
  const world = new THREE.Group();
  const zones = { '5,5': 1, '5,6': 2 };
  const grid = { ...fakeGrid(() => true), zoneAt: (x, z) => zones[x + ',' + z] || 0 };
  const g = ghost.create({ THREE, world, grid });
  g.showPainted([[5, 5], [5, 6], [5, 7]], 'road', new Set([96 * 5 + 6]));
  assert.equal(world.children[0].visible, true);
  g.showPainted([[5, 7]], 'none');
  assert.equal(world.children[0].visible, false);
});
