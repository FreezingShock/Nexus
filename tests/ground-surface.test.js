// One surface: the ground mesh, the tile overlays and the roads all lie on world/terrain.js heightAt, so on a hillside no
// grass pokes through a road and no overlay hangs in the air.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import { quietSim as createSim } from './support/quiet.js';
import { freshState } from '../src/sim/state.js';
import { GRID_N, GRID_HALF, TILE } from '../src/world/grid.js';
import { heightAt } from '../src/world/terrain.js';
import { roadBlock } from '../src/world/roadnet.js';
import { buildTerrain } from '../src/render/terrain.js';
import { groundPlaneGeometry } from '../src/render/ground.js';
import { Acc, emitTiles } from '../src/render/road-mesh.js';

const seeded = () => { const state = freshState(); state.terrainSeed = 1234567; state.coins = 1e7; return createSim({ state }); };
const cy = (gx, gz) => heightAt((gx - GRID_HALF) * TILE, (gz - GRID_HALF) * TILE);
const BARY = [[1 / 3, 1 / 3], [0.1, 0.1], [0.8, 0.1], [0.1, 0.8], [0.5, 0.25], [0.25, 0.5]];

// Every sample point inside each triangle of positions `p` (indexed by `idx`, or in threes): f(x, yOnTriangle, z).
// Upright triangles (the skirts, a road's kerb walls) cover no ground and are skipped.
function eachSample(p, idx, f) {
  const n = idx ? idx.length : p.count, at = (k) => (idx ? idx[k] : k);
  for (let t = 0; t < n; t += 3) {
    const a = at(t), b = at(t + 1), c = at(t + 2);
    const area = (p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a)) - (p.getX(c) - p.getX(a)) * (p.getZ(b) - p.getZ(a));
    if (Math.abs(area) < 1e-6) continue;
    for (const [u, v] of BARY) {
      const w = 1 - u - v, g = (axis) => p['get' + axis](a) * w + p['get' + axis](b) * u + p['get' + axis](c) * v;
      f(g('X'), g('Y'), g('Z'));
    }
  }
}

// A straight run of open, hilly ground.
function hillRun(sim, len = 8) {
  const g = sim.grid;
  for (let gz = 10; gz < GRID_N - 10; gz++) for (let gx = 10; gx < GRID_N - 10 - len; gx++) {
    const path = Array.from({ length: len }, (_, k) => [gx + k, gz]);
    if (!path.every(([x, z]) => g.isOpen(x, z) && roadBlock(g, null, sim.state, x, z) === null)) continue;
    if (Math.abs(cy(gx + len - 1, gz) - cy(gx, gz)) > 2) return path;
  }
  return null;
}

test('the ground mesh is heightAt, inside every triangle', () => {
  seeded();
  const world = new THREE.Group();
  buildTerrain(world);
  const p = world.children[0].geometry.attributes.position;
  let worst = 0, n = 0;
  eachSample(p, null, (x, y, z) => {
    if (n++ % 7) return; // a sample
    worst = Math.max(worst, Math.abs(y - heightAt(x, z)));
  });
  assert.ok(worst < 1e-3, `mesh off the ground by ${worst}`);
  createSim({ state: freshState() });
});

test('tile overlays lie on the ground, not over or under it', () => {
  seeded();
  const geo = groundPlaneGeometry(0), p = geo.attributes.position;
  let worst = 0;
  // Tiles dipping into the river are left out: the overlays stay at the water line there, and nothing is built in it.
  const wet = (x, z) => { const i = Math.floor((x + 145.5) / TILE) * TILE - 145.5, j = Math.floor((z + 145.5) / TILE) * TILE - 145.5;
    return [[0, 0], [3, 0], [0, 3], [3, 3]].some(([u, v]) => heightAt(i + u, j + v) < 0); };
  eachSample(p, geo.index.array, (x, y, z) => { if (!wet(x, z)) worst = Math.max(worst, Math.abs(y - heightAt(x, z))); });
  assert.ok(worst < 0.02, `overlay off the ground by ${worst}`);
  createSim({ state: freshState() });
});

test('a road on a hillside never dips under the ground, before or after it is graded', () => {
  const sim = seeded(), path = hillRun(sim);
  assert.ok(path, 'found a hillside');
  const check = (roads, label) => {
    const acc = new Acc();
    emitTiles(acc, path, roads);
    const mesh = acc.toMesh(new THREE.MeshBasicMaterial()), p = mesh.geometry.attributes.position;
    let worst = Infinity;
    eachSample(p, mesh.geometry.index.array, (x, y, z) => { worst = Math.min(worst, y - Math.max(0, heightAt(x, z))); });
    assert.ok(worst > 0.05, `${label}: road ${worst.toFixed(3)} above the ground at its lowest`);
  };
  const hyp = {};
  for (const [gx, gz] of path) hyp[gz * GRID_N + gx] = { t: 'two' };
  check(hyp, 'on the natural slope');
  sim.dispatch({ type: 'drawRoad', roadType: 'two', path });
  check(sim.state.roads, 'graded');
  createSim({ state: freshState() });
});
