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
import { buildStatic } from '../src/render/props.js';
import roads from '../src/render/systems/roads.js';
import trees from '../src/render/systems/trees.js';

test('every instanced mesh in the town has an instance colour buffer', () => {
  const layout = getLayout();
  const sim = createSim({ state: freshState(), layout });
  const world = new THREE.Group();
  const camera = { view: { tx: 0, tz: 0, half: 46, zoom: 1 } };
  buildStatic(world, layout);
  const treeSys = trees.create({ THREE, world, layout, grid: sim.grid, camera, scene: world, sys: () => null });
  treeSys.frame({ state: sim.state });
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
  const treeSys = trees.create({ THREE, world, layout, grid: sim.grid, camera, scene: world, sys: () => null });
  treeSys.frame({ state: sim.state });
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

test('instance buffers hold their full capacity and every draw count fits, while cars, buses and townsfolk move', () => {
  const layout = getLayout();
  const sim = createSim({ state: freshState(), layout });
  const world = new THREE.Group();
  const camera = { view: { tx: 0, tz: 0, half: 46, zoom: 1 } };
  buildStatic(world, layout);
  const treeSys = trees.create({ THREE, world, layout, grid: sim.grid, camera, scene: world, sys: () => null });
  treeSys.frame({ state: sim.state });
  const cars = buildCars(world, sim.grid, camera);
  const folk = buildTownsfolk(world, sim.grid, camera);
  const sys = roads.create({ THREE, world, layout, grid: sim.grid, camera, scene: world });
  ensureInstanceColors(world);
  const check = (tag) => {
    world.traverse((o) => {
      if (o.isInstancedMesh) {
        const cap = o.instanceMatrix.count;
        assert.ok(o.count <= cap, `${tag}: ${o.material.type} draws ${o.count} instances from a capacity of ${cap}`);
        assert.ok(o.instanceColor.count >= cap, `${tag}: instanceColor holds ${o.instanceColor.count} of ${cap}`);
      }
      const g = o.geometry;
      if (g && g.index) {
        const pos = g.attributes.position ? g.attributes.position.count : 0;
        let max = -1;
        for (let i = 0; i < g.index.count; i++) max = Math.max(max, g.index.getX(i));
        assert.ok(max < pos, `${tag}: ${o.type} index ${max} reaches past ${pos} vertices`);
      }
    });
  };
  check('start');
  for (let f = 0; f < 600; f++) {
    sim.tick();
    cars.update(1 / 30, sim.state.roads);
    folk.update(1 / 30, sim.state.roads);
    if (sys && sys.frame) sys.frame({ dt: 1 / 30, t: f / 30, simDt: 1 / 30, state: sim.state, tool: null });
    if (f % 30 === 0) check(`frame ${f}`);
  }
  check('end');
  assert.ok(cars.carCount() > 0 && folk.count() > 0, 'the simulation should have produced traffic and townsfolk');
});
