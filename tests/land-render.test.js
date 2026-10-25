// Built things follow the ground when the terrain tools move it: the ground mesh, roads, trees and the land watch they share.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import { quietSim as createSim } from './support/quiet.js';
import { freshState } from '../src/sim/state.js';
import { heightAt } from '../src/world/terrain.js';
import { TILE, GRID_N, worldToTile } from '../src/world/grid.js';
import { createLandWatch } from '../src/render/land-watch.js';
import { buildTerrain } from '../src/render/terrain.js';
import trees from '../src/render/systems/trees.js';

const mk = () => { const state = freshState(); state.coins = 1e6; return createSim({ state }); };
const P = { x: 6 * TILE + 1, z: 4 * TILE + 1 };
const raise = (sim, stroke = 1, n = 3) => { for (let k = 0; k < n; k++) sim.dispatch({ type: 'terraform', tool: 'raise', x: P.x, z: P.z, size: 'medium', stroke }); };

test('the land watch reports the tiles a dab moved, once', () => {
  const sim = mk(), w = createLandWatch();
  assert.equal(w.poll(), null, 'nothing yet');
  raise(sim);
  const m = w.poll();
  assert.ok(m && !m.all);
  const [gx, gz] = worldToTile(P.x, P.z);
  assert.ok(m.tiles.has(gz * GRID_N + gx), 'the tile under the brush');
  assert.ok(m.box.x0 <= P.x && m.box.x1 >= P.x && m.box.z0 <= P.z && m.box.z1 >= P.z);
  assert.equal(w.poll(), null, 'reported once');
  sim.dispatch({ type: 'undo' });
  assert.ok(w.poll(), 'undo moves it back');
});

test('the ground mesh is lifted where the land rose', () => {
  const sim = mk(), world = new THREE.Group();
  const ground = buildTerrain(world);
  raise(sim);
  ground.follow();
  const q = world.children[0].geometry.attributes.position;
  let worst = 0, near = 0;
  for (let k = 0; k < q.count; k++) {
    const x = q.getX(k), z = q.getZ(k);
    if (Math.hypot(x - P.x, z - P.z) > 8) continue;
    near++; worst = Math.max(worst, Math.abs(q.getY(k) - heightAt(x, z)));
  }
  assert.ok(near > 10);
  assert.ok(worst < 1e-4, `mesh matches the ground (${worst})`);
});

test('trees stand on the moved ground', () => {
  const sim = mk(), world = new THREE.Group();
  // a tree right under the brush
  sim.state.trees = [...sim.state.trees, { id: 't9999', k: 'b', x: P.x, z: P.z, s: 1, rot: 0, col: 0 }];
  const sys = trees.create({ THREE, world, layout: sim.layout, grid: sim.grid, camera: null, scene: world, sys: () => null });
  sys.frame({ state: sim.state });
  const trunk = world.children[2], m = new THREE.Matrix4(), p = new THREE.Vector3();
  const idx = sim.state.trees.filter((t) => t.k !== 'p').findIndex((t) => t.id === 't9999');
  trunk.getMatrixAt(idx, m); const y0 = p.setFromMatrixPosition(m).y;
  raise(sim);
  sys.frame({ state: sim.state });
  trunk.getMatrixAt(idx, m); const y1 = p.setFromMatrixPosition(m).y;
  assert.ok(y1 > y0 + 0.5, `tree rose ${y0} -> ${y1}`);
});
