// String lights for the festive seasons: where they hang, and the render system in node.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { getLayout } from '../src/world/layout.js';
import { createTown } from '../src/render/town.js';
import { bodyStrings, hangString, luck, spiral, SAG, SPACING } from '../src/render/festive/strings.js';
import lights, { MAX_BULBS } from '../src/render/systems/festive-lights.js';

test('a string droops between hooks and keeps its bulbs evenly spaced', () => {
  const pts = [];
  const n = hangString(0, 0, 3, 0, 5, (x, y, z) => pts.push([x, y, z]));
  assert.equal(n, pts.length);
  assert.ok(Math.abs(pts[1][0] - pts[0][0] - SPACING) < 0.1);
  assert.equal(pts[0][1], 5, 'hung from the hook at the eave');
  assert.ok(Math.min(...pts.map((p) => p[1])) >= 5 - SAG - 1e-9);
  assert.ok(pts.some((p) => p[1] < 5 - SAG * 0.8), 'and droops between hooks');
});

test('strings go round all four eaves of a body, and spirals wind up a tree', () => {
  const pts = [], wires = [];
  bodyStrings({ x: 0, z: 0, y0: 0.3, w: 3, d: 3, floors: 2 }, (x, y, z) => pts.push([x, y, z]), (...a) => wires.push(a));
  assert.ok(pts.length > 20);
  assert.ok(pts.some((p) => p[2] > 1.5) && pts.some((p) => p[2] < -1.5) && pts.some((p) => p[0] > 1.5) && pts.some((p) => p[0] < -1.5));
  assert.ok(pts.every((p) => p[1] > 2 && p[1] < 2.6), 'at the eave of the second storey');
  const sp = [];
  spiral(0, 0, 1, 4, 1.2, 0.2, 3, 0, (x, y, z) => sp.push([x, y, z]));
  assert.ok(sp[0][1] < sp[sp.length - 1][1]);
  assert.ok(Math.hypot(sp[0][0], sp[0][2]) > Math.hypot(sp.at(-1)[0], sp.at(-1)[2]), 'narrower at the top');
  const ls = Array.from({ length: 2000 }, (_, i) => luck(i, 1));
  assert.ok(ls.every((l) => l >= 0 && l < 1));
  assert.ok(Math.abs(ls.reduce((a, b) => a + b) / ls.length - 0.5) < 0.05, 'luck is even');
});

test('the lights system dresses the town for Christmas, a few houses at first and every one by the day', () => {
  const sim = createSim({ state: freshState(), layout: getLayout() });
  const world = new THREE.Group();
  const town = createTown(world, {});
  town.setState(sim.state);
  const sys = lights.create({ THREE, world, town, sys: () => null });
  const frame = (night = 0) => sys.frame({ dt: 1 / 30, t: 10, state: sim.state, sky: { night } });
  const bulbs = world.children.find((o) => o.isInstancedMesh);
  sim.state.event = ''; frame();
  assert.equal(bulbs.visible, false, 'no lights outside an event');
  sim.state.event = 'christmas'; sim.state.eventCover = 0.35;
  for (let i = 0; i < 400; i++) frame(1);
  assert.ok(bulbs.visible && bulbs.count > 100 && bulbs.count <= MAX_BULBS, 'bulbs: ' + bulbs.count);
  const lit = () => bulbs.geometry.attributes.aOn.array.slice(0, bulbs.count).filter((v) => v > 0.99).length;
  const some = lit();
  assert.ok(some > 0 && some < bulbs.count * 0.7, 'some lit: ' + some + ' of ' + bulbs.count);
  sim.state.eventCover = 1;
  for (let i = 0; i < 400; i++) frame(1);
  assert.ok(lit() > some, 'more lit by the big day');
  const halo = world.children.filter((o) => o.isInstancedMesh)[1];
  assert.equal(halo.visible, true, 'halos glow after dusk');
  frame(0);
  assert.equal(halo.visible, false, 'and not by day');
  sim.state.event = ''; frame();
  assert.equal(bulbs.visible, false, 'down again after the season');
});
