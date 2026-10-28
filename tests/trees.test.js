import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { SAVE_VERSION, migrations, sanitize, unwrap, wrap } from '../src/sim/save.js';
import { getLayout } from '../src/world/layout.js';
import { BASE, tileIndex, worldToTile } from '../src/world/grid.js';
import { checkLot } from '../src/world/placement.js';
import { roadBlock } from '../src/world/roadnet.js';
import { sanitizeTrees, seedTrees, speciesOf } from '../src/world/trees.js';
import { starterReserved } from '../src/world/starter.js';
import trees from '../src/render/systems/trees.js';
import { roadBesideTiles } from './support/road.js';

const layout = getLayout();
const mk = (state = freshState()) => { state.coins = 1e9; return createSim({ state, layout }); };
const tileOf = (t) => { const [gx, gz] = worldToTile(t.x, t.z); return [gx, gz]; };
const json = (x) => JSON.parse(JSON.stringify(x));
// The buildings the player placed (the starter village is in state.placed too).
const mine = (sim) => sim.state.placed.filter((r) => !r.starter);

// A tree on open ground, with a free neighbour to its east for a road. Scans the town, so it survives retuning.
function openTree(sim) {
  const { grid, state } = sim;
  for (const t of state.trees) {
    const [gx, gz] = tileOf(t);
    if (grid.baseAt(gx, gz) !== BASE.LAND || grid.roadAt(gx, gz) || grid.zoneAt(gx, gz) || grid.lotAt(gx, gz)) continue;
    if (roadBlock(grid, layout, state, gx, gz) || roadBlock(grid, layout, state, gx + 1, gz)) continue;
    if (sim.state.trees.some((o) => o !== t && tileOf(o)[0] === gx + 1 && tileOf(o)[1] === gz)) continue;
    return { t, gx, gz };
  }
  throw new Error('no open tree spot in the town');
}
const treesOn = (sim, gx, gz) => sim.state.trees.filter((t) => { const [x, z] = tileOf(t); return x === gx && z === gz; });

test('the town starts with its trees as objects, none standing on a street or a building', () => {
  const sim = mk();
  const ids = sim.state.trees.map((t) => t.id);
  assert.ok(sim.state.trees.length > 100, 'trees and conifers from the generator');
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  const reserved = starterReserved();
  for (const t of sim.state.trees) assert.ok(!reserved.has(tileIndex(...tileOf(t))), `${t.id} stands on the village`);
});

test('seeding is deterministic, and the v1 save migration seeds the same trees', () => {
  assert.deepEqual(seedTrees(layout), seedTrees(layout));
  const old = freshState();
  delete old.trees;
  const fromMigration = migrations[0](json(old)).trees;
  assert.deepEqual(fromMigration, seedTrees(layout));
  assert.equal(SAVE_VERSION, 8);
});

test('no tree stands on a road, a zone or a lot once the town is loaded', () => {
  const sim = mk();
  for (const t of sim.state.trees) {
    const [gx, gz] = tileOf(t);
    assert.equal(sim.grid.roadAt(gx, gz), 0, `${t.id} on a road`);
    assert.equal(sim.grid.zoneAt(gx, gz), 0, `${t.id} on paint`);
    assert.equal(sim.grid.lotAt(gx, gz), 0, `${t.id} on a lot`);
  }
});

test('a save that holds trees on paint loses those trees on load', () => {
  const sim = mk();
  const { t, gx, gz } = openTree(sim);
  // Paint the tile inside a saved state that still lists the tree there, then load it.
  const saved = json(sim.state);
  saved.zones = saved.zones.slice(0, tileIndex(gx, gz)) + '1' + saved.zones.slice(tileIndex(gx, gz) + 1);
  const back = createSim({ state: sanitize(saved), layout });
  assert.equal(back.grid.zoneAt(gx, gz), 1);
  assert.equal(back.state.trees.some((o) => o.id === t.id), false, 'the tree on paint is gone');
  assert.ok(back.state.trees.length < sim.state.trees.length);
});

test('zoning takes the trees on the painted tiles, and undo puts them back in order', () => {
  const sim = mk();
  const { gx, gz } = openTree(sim);
  const before = json(sim.state.trees);
  const cleared = treesOn(sim, gx, gz);
  assert.ok(cleared.length >= 1);
  roadBesideTiles(sim, [[gx, gz]]);
  sim.dispatch({ type: 'paintZone', zone: 1, a: [gx, gz], b: [gx, gz] });
  assert.equal(treesOn(sim, gx, gz).length, 0, 'the tile is clear');
  assert.equal(sim.grid.zoneAt(gx, gz), 1, 'the tile is painted');
  sim.dispatch({ type: 'undo' });
  assert.deepEqual(json(sim.state.trees), before, 'every tree is back, in its place');
});

test('a road drawn through trees takes them, and undo brings them back', () => {
  const sim = mk();
  const { t, gx, gz } = openTree(sim);
  const before = json(sim.state.trees);
  sim.dispatch({ type: 'drawRoad', roadType: 'two', path: [[gx, gz], [gx + 1, gz]] });
  assert.equal(sim.state.trees.some((o) => o.id === t.id), false, 'the road took the tree');
  assert.ok(sim.grid.roadAt(gx, gz));
  sim.dispatch({ type: 'undo' });
  assert.deepEqual(json(sim.state.trees), before);
  assert.equal(sim.grid.roadAt(gx, gz), 0);
});

test('a placed building takes the trees under its footprint, and undo brings them back', () => {
  const sim = mk();
  const { gx, gz } = openTree(sim);
  assert.ok(checkLot(sim.grid, gx, gz, 1, 1).ok, 'the spot is open for a building');
  const before = json(sim.state.trees);
  sim.dispatch({ type: 'place', model: 'cottage', gx, gz, fw: 1, fd: 1, rot: 0 });
  assert.equal(mine(sim).length, 1);
  assert.equal(treesOn(sim, gx, gz).length, 0);
  sim.dispatch({ type: 'undo' });
  assert.equal(mine(sim).length, 0);
  assert.deepEqual(json(sim.state.trees), before);
});

test('a dragged row of buildings takes its trees in one step, and one undo gives them all back', () => {
  const sim = mk();
  const { gx, gz } = openTree(sim);
  const before = json(sim.state.trees);
  const items = [0, 1].map((k) => ({ model: 'cottage', gx: gx + k, gz, fw: 1, fd: 1, rot: 0 }));
  sim.dispatch({ type: 'placeMany', items });
  assert.ok(mine(sim).length >= 1);
  assert.equal(treesOn(sim, gx, gz).length, 0);
  sim.dispatch({ type: 'undo' });
  assert.deepEqual(json(sim.state.trees), before);
});

test('bulldozing a single tree is free and undoable', () => {
  const sim = mk();
  const { t } = openTree(sim);
  const coins = sim.state.coins;
  sim.dispatch({ type: 'removeTree', id: t.id });
  assert.equal(sim.state.trees.some((o) => o.id === t.id), false);
  assert.equal(sim.state.coins, coins, 'free');
  assert.ok(speciesOf(t).length > 0, 'a species name for the card');
  sim.dispatch({ type: 'undo' });
  assert.ok(sim.state.trees.some((o) => o.id === t.id));
  assert.deepEqual(sim.state.trees.find((o) => o.id === t.id), t);
});

test('the inspect lookup finds a tree by id and forgets it once cleared', () => {
  const sim = mk();
  const { t, gx, gz } = openTree(sim);
  assert.deepEqual(sim.tree(t.id), t);
  roadBesideTiles(sim, [[gx, gz]]);
  sim.dispatch({ type: 'paintZone', zone: 2, a: [gx, gz], b: [gx, gz] });
  assert.equal(sim.tree(t.id), null);
});

test('a saved town keeps its trees, and the ones taken stay taken', () => {
  const sim = mk();
  const { t, gx, gz } = openTree(sim);
  roadBesideTiles(sim, [[gx, gz]]);
  sim.dispatch({ type: 'paintZone', zone: 1, a: [gx, gz], b: [gx, gz] });
  const back = createSim({ state: unwrap(wrap(sim.prepareSave(), 1)).state, layout });
  assert.deepEqual(json(back.state.trees), json(sim.state.trees));
  assert.equal(back.state.trees.some((o) => o.id === t.id), false);
});

test('sanitizing drops junk tree records and keeps the good ones', () => {
  const good = { id: 't5', k: 'b', x: 10, z: -4, s: 1.2, rot: 0.5, col: 1 };
  const out = sanitizeTrees([good, { ...good, id: 't5' }, { ...good, id: 'x9' }, { ...good, id: 't7', k: 'q' },
    { ...good, id: 't8', x: 'far' }, { ...good, id: 't9', col: 99 }, { ...good, id: 't10', s: 0 }, null]);
  assert.deepEqual(out, [good]);
  assert.equal(sanitizeTrees('nope'), null, 'no list: the town seeds its trees');
});

test('picking finds the tree under a ray, and not one that has been cleared', () => {
  const sim = mk();
  const { t, gx, gz } = openTree(sim);
  const world = new THREE.Group();
  const sys = trees.create({ THREE, world, layout, grid: sim.grid, camera: null, scene: world, sys: () => null });
  sys.frame({ state: sim.state });
  world.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(t.x, 60, t.z), new THREE.Vector3(0, -1, 0));
  const hit = sys.pick(ray);
  assert.ok(hit, 'a tree under the ray');
  assert.equal(hit.id, t.id);
  roadBesideTiles(sim, [[gx, gz]]);
  sim.dispatch({ type: 'paintZone', zone: 1, a: [gx, gz], b: [gx, gz] });
  sys.frame({ state: sim.state });
  world.updateMatrixWorld(true);
  const after = sys.pick(new THREE.Raycaster(new THREE.Vector3(t.x, 60, t.z), new THREE.Vector3(0, -1, 0)));
  assert.ok(!after || after.id !== t.id, 'the cleared tree is not picked');
});
