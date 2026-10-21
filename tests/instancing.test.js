// three.js compiles one shader program per material and per instanceColor setting. An InstancedMesh without
// instanceColor can be drawn with the program of one that has it, and the first frame throws (black screen).
// scene.js calls ensureInstanceColors on the whole town; this checks every instanced mesh the builders make.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { getLayout } from '../src/world/layout.js';
import { ensureInstanceColors } from '../src/render/geom.js';
import { buildCars } from '../src/render/cars.js';
import { buildTownsfolk } from '../src/render/townsfolk.js';
import { buildStatic, buildTrees } from '../src/render/props.js';
import roads from '../src/render/systems/roads.js';

test('every instanced mesh in the town has an instance colour buffer', () => {
  const layout = getLayout();
  const sim = createSim({ state: freshState(), layout });
  const world = new THREE.Group();
  const camera = { view: { tx: 0, tz: 0, half: 46, zoom: 1 } };
  buildStatic(world, layout);
  buildTrees(world, layout);
  buildCars(world, sim.grid, camera);
  buildTownsfolk(world, sim.grid, camera);
  roads.create({ THREE, world, layout, grid: sim.grid, camera, scene: world });
  ensureInstanceColors(world);
  let count = 0;
  world.traverse((o) => {
    if (!o.isInstancedMesh) return;
    count++;
    assert.ok(o.instanceColor, `${o.material.type} ${o.material.color.getHexString()} has no instanceColor`);
  });
  assert.ok(count > 0, 'the scene should contain instanced meshes');
});

test('every geometry the town builds has real attributes (no null or arrayless entries)', () => {
  const layout = getLayout();
  const sim = createSim({ state: freshState(), layout });
  const world = new THREE.Group();
  const camera = { view: { tx: 0, tz: 0, half: 46, zoom: 1 } };
  buildStatic(world, layout);
  buildTrees(world, layout);
  buildCars(world, sim.grid, camera);
  buildTownsfolk(world, sim.grid, camera);
  roads.create({ THREE, world, layout, grid: sim.grid, camera, scene: world });
  let seen = 0;
  world.traverse((o) => {
    if (!o.geometry) return;
    seen++;
    for (const [name, attr] of Object.entries(o.geometry.attributes)) {
      assert.ok(attr, `${o.type} ${o.name || ''} has a null attribute "${name}"`);
      assert.ok(attr.array && attr.count > 0 || attr.count === 0, `${o.type} attribute "${name}" has no array`);
    }
  });
  assert.ok(seen > 0);
});
