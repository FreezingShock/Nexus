// Fireworks (src/render/festive/fireworks.js and the render system): rockets climb, burst, fall and fade.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { getLayout } from '../src/world/layout.js';
import { createTown } from '../src/render/town.js';
import { launch, makePool, showRate, stepPool } from '../src/render/festive/fireworks.js';
import fireworks from '../src/render/systems/fireworks.js';

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('a rocket climbs, bursts into a shell of sparks at the top, and the sparks fade out', () => {
  const p = makePool(400);
  for (let shell = 0; shell < 5; shell++) launch(p, 0, 0, 0, 20, 0xE0533F, shell, rnd);
  let bursts = 0, top = 0, most = 0;
  for (let i = 0; i < 300; i++) {
    const r = stepPool(p, 1 / 30, rnd, 1, i / 30);
    bursts += r.bursts; most = Math.max(most, r.alive);
    for (let j = 0; j < p.n; j++) if (p.age[j] >= 0) top = Math.max(top, p.py[j]);
  }
  assert.equal(bursts, 5);
  assert.ok(top > 15 && top < 30, 'bursts up high: ' + top);
  assert.ok(most > 100, 'a shell of sparks: ' + most);
  assert.equal(stepPool(p, 1, rnd).alive, 0, 'and all gone after a few seconds');
});

test('the show runs after dark, with a finale at midnight', () => {
  assert.equal(showRate(13, 0), 0);
  assert.equal(showRate(19, 0.2), 0);
  assert.ok(showRate(21.5, 1) > 0);
  assert.ok(showRate(0.1, 1) > showRate(22, 1), 'finale');
  assert.equal(showRate(3, 1), 0, 'and bed by three');
});

test('the fireworks system lights the sky only on a fireworks night', () => {
  const sim = createSim({ state: freshState(), layout: getLayout() });
  const world = new THREE.Group();
  const town = createTown(world, {});
  town.setState(sim.state);
  const sys = fireworks.create({ THREE, world, town, sys: () => null });
  const pts = world.children.find((o) => o.isPoints);
  const run = (n, night) => { for (let i = 0; i < n; i++) sys.frame({ dt: 1 / 30, t: i / 30, state: sim.state, sky: { night } }); };
  Object.assign(sim.state, { event: 'christmas', fireworks: 0, hour: 23.9 });
  run(120, 1);
  assert.equal(pts.visible, false, 'Christmas Day is calm');
  sim.state.fireworks = 1;
  run(120, 1);
  assert.equal(pts.visible, true, "New Year's Eve at midnight");
  sim.state.hour = 12;
  run(200, 0);
  assert.equal(pts.visible, false, 'quiet again by day');
});
