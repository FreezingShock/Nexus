import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, describe, fitFootprint, footprintsOf, canonicalDims, pickModelForLot, modelById, seedOf } from '../src/world/models.js';
import { starterPlaced } from '../src/world/starter.js';
import { buildParts, builderIds, trianglesOf } from '../src/render/models/builders.js';
import { getLayout } from '../src/world/layout.js';
import { quietSim as createSim } from './support/quiet.js';
import { sanitize } from '../src/sim/save.js';
import { tileIndex, TILE } from '../src/world/grid.js';
import * as THREE from '../vendor/three/three.module.min.js';
import { PARKS } from '../src/sim/services-config.js';

const layout = getLayout();
// The buildings the player placed (the starter village is in state.placed too).
const mine = (sim) => sim.state.placed.filter((r) => !r.starter);
const rec = (model, fw, fd, extra = {}) => ({ id: 'b1000', model, gx: 10, gz: 10, fw, fd, rot: 0, ...extra });

test('every model has a builder, and every builder has a model', () => {
  assert.deepEqual(builderIds().sort(), MODELS.map((m) => m.id).sort());
});

// A part that strays far from its lot (a bad argument shifting a box into the wrong slot) stretches the merged mesh
// across the whole map and hides the town, so every vertex must stay near the building's own footprint.
test('every model stays within its footprint at every size and level', () => {
  const v = new THREE.Vector3();
  for (const m of MODELS) for (const size of footprintsOf(m)) for (let lv = 1; lv <= 5; lv++) {
    const [fw, fd] = canonicalDims(m, size);
    const hx = fw * TILE / 2 + 1, hz = fd * TILE / 2 + 1;
    for (const p of buildParts(describe(rec(m.id, fw, fd), lv))) {
      for (const g of p.splits ? p.splits.map((s) => s.geo) : [p.geo]) {
        const pos = g.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(p.local);
          assert.ok(Math.abs(v.x) <= hx && Math.abs(v.z) <= hz && v.y > -3 && v.y < 40,
            `${m.id} ${size} L${lv}: vertex (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}) is outside the footprint`);
        }
      }
    }
  }
});

test('every model builds at every size and level within the triangle budget', () => {
  for (const m of MODELS) for (const size of footprintsOf(m)) for (let lv = 1; lv <= 5; lv++) {
    const [fw, fd] = canonicalDims(m, size);
    const parts = buildParts(describe(rec(m.id, fw, fd), lv));
    const tris = trianglesOf(parts);
    const budget = m.tile === 'row' ? 520 + 220 * (fw - 1) : m.cat === 'park' ? 450 + 110 * fw * fd : 650; // a row is several houses, a park grows with its lot
    assert.ok(tris > 0 && tris <= budget, `${m.id} ${size} L${lv}: ${tris} triangles (budget ${budget})`);
    for (const p of parts) for (const g of p.splits ? p.splits.map((s) => s.geo) : [p.geo]) {
      assert.ok(g.attributes.position.array.every(Number.isFinite), `${m.id} has a NaN vertex`);
    }
  }
});

test('the same record always builds the same building; upgrading only adds parts', () => {
  const sig = (lv) => buildParts(describe(rec('mansard', 1, 1), lv)).map((p) => p.geo.type + p.local.elements.join(',')).join('|');
  assert.equal(sig(3), sig(3));
  assert.ok(buildParts(describe(rec('mansard', 1, 1), 5)).length > buildParts(describe(rec('mansard', 1, 1), 1)).length);
  const a = describe(rec('cottage', 1, 1), 1), b = describe(rec('cottage', 1, 1), 5);
  assert.equal(a.floors, b.floors); assert.equal(a.pal, b.pal);
  assert.notEqual(describe(rec('cottage', 1, 1, { id: 'b1001' }), 1).seed, a.seed);
});

test('footprints: drawn sizes are exact, rows stretch, others shrink to fit or refuse', () => {
  const cottage = modelById('cottage'), terrace = modelById('terrace'), hall = modelById('town-hall');
  assert.deepEqual(fitFootprint(cottage, 1, 1), { fw: 1, fd: 1, exact: true });
  assert.equal(fitFootprint(terrace, 4, 1).exact, true);
  assert.equal(fitFootprint(terrace, 1, 4).exact, true);
  assert.deepEqual(fitFootprint(cottage, 3, 2), { fw: 1, fd: 1, exact: false });
  assert.equal(fitFootprint(hall, 1, 1), null);
  assert.deepEqual(canonicalDims(terrace, [1, 3]), [3, 1]);
  assert.equal(pickModelForLot('landmark', 1, 1), null);
  assert.equal(pickModelForLot('home', 2, 2, 7).fit.exact, true);
});

test('the starter village is catalog models that fit their lots and draw', () => {
  for (const r of starterPlaced()) {
    const d = describe(r, 1);
    assert.ok(modelById(d.model), r.id);
    assert.equal(fitFootprint(modelById(r.model), r.fw, r.fd).exact, true, r.id);
    assert.ok(trianglesOf(buildParts(d)) > 0, r.id);
  }
});

test('placing charges coins, fills the grid, pays income; bulldozing frees the tiles', () => {
  const sim = createSim({ layout });
  sim.state.coins = 1e6;
  const rate0 = sim.rate(), coins0 = sim.state.coins;
  sim.dispatch({ type: 'place', model: 'shop-row', gx: 45, gz: 35, fw: 3, fd: 1, rot: 0 });
  assert.equal(mine(sim).length, 1);
  const r = mine(sim)[0];
  assert.ok(coins0 - sim.state.coins >= 600);
  assert.ok(sim.rate() > rate0);
  assert.ok(sim.alive(r.id) && sim.building(r.id).name === 'Shop row');
  assert.ok(sim.grid.lot[tileIndex(46, 35)] >= 40000);
  sim.dispatch({ type: 'place', model: 'cottage', gx: 46, gz: 35, fw: 1, fd: 1, rot: 0 });
  assert.equal(mine(sim).length, 1);
  const before = sim.state.coins; sim.dispatch({ type: 'upgrade', id: r.id });
  assert.equal(sim.state.levels[r.id], 2); assert.ok(sim.state.coins < before);
  sim.dispatch({ type: 'bulldoze', id: r.id });
  assert.equal(mine(sim).length, 0);
  assert.equal(sim.grid.lot[tileIndex(46, 35)], 0);
  assert.equal(sim.rate(), rate0);
});

test('placement refuses bad ground, bad sizes and empty pockets', () => {
  const sim = createSim({ layout });
  sim.state.coins = 1e6;
  for (const t of [
    { model: 'cottage', gx: 48, gz: 48, fw: 1, fd: 1 },
    { model: 'cottage', gx: 69, gz: 14, fw: 1, fd: 1 }, // the tunnel mountain's face is a cliff
    { model: 'town-hall', gx: 46, gz: 35, fw: 1, fd: 1 },
    { model: 'nope', gx: 46, gz: 35, fw: 1, fd: 1 },
  ]) sim.dispatch({ type: 'place', rot: 0, ...t });
  assert.equal(mine(sim).length, 0);
  sim.state.coins = 1;
  sim.dispatch({ type: 'place', model: 'cottage', gx: 46, gz: 35, fw: 1, fd: 1, rot: 0 });
  assert.equal(mine(sim).length, 0);
  assert.notEqual(sim.grid.road[tileIndex(48, 48)], 0); // the village's cross street is still a road
});

test('placed buildings survive a save, and a tampered save is cleaned', () => {
  const sim = createSim({ layout });
  sim.state.coins = 1e6;
  sim.dispatch({ type: 'place', model: 'mansard', gx: 52, gz: 36, fw: 2, fd: 2, rot: 1 });
  const back = sanitize(JSON.parse(JSON.stringify(sim.state)));
  assert.deepEqual(back.placed, sim.state.placed);
  const bad = JSON.parse(JSON.stringify(sim.state));
  bad.placed.push({ id: 'b1500', model: 'mansard', gx: 52, gz: 36, fw: 2, fd: 2, rot: 0 }, { id: 'x', model: 'cottage' }, { id: 'b1501', model: 'cottage', gx: 99, gz: 1, fw: 1, fd: 1 });
  assert.equal(sanitize(bad).placed.length, sim.state.placed.length, 'the three bad records are dropped, the rest stay');
  const again = createSim({ layout, state: back });
  assert.ok(again.alive(back.placed[0].id));
  assert.equal(again.rate(), sim.rate());
  assert.equal(seedOf('b1000'), seedOf('b1000'));
});

test('townhouses vary their window style by seed and grown lots can use the new 1 x 1 models', async () => {
  const styles = new Set();
  for (let i = 0; i < 40; i++) styles.add(describe(rec('townhouse', 1, 1, { id: 'b' + (2000 + i) }), 1).style);
  assert.ok(styles.size >= 2);
  const { ZONE_MODELS } = await import('../src/world/lots.js');
  assert.ok(ZONE_MODELS[1].includes('townhouse') && ZONE_MODELS[2].includes('bakery'));
  for (const id of ['manor', 'apartments', 'department']) assert.ok(fitFootprint(modelById(id), 2, 3), id + ' fits a 2 x 3 lot');
});

test('every park is ground: no storeys, a service entry, and sizes from a pocket lot up to three tiles square', () => {
  const parks = MODELS.filter((m) => m.cat === 'park');
  assert.ok(parks.length >= 7, 'parks: ' + parks.map((m) => m.id).join(', '));
  for (const m of parks) {
    assert.deepEqual(m.floors, [0, 0], m.id);
    assert.ok(PARKS[m.id], m.id + ' has no coverage entry');
    const sizes = footprintsOf(m);
    assert.ok(sizes.length >= 2, m.id + ' offers one size');
    for (const [a, b] of sizes) assert.ok(a <= 3 && b <= 3, m.id + ' too big');
  }
  assert.ok(parks.some((m) => footprintsOf(m).some(([a, b]) => a === 1 && b === 1)), 'a one-tile park exists');
  assert.ok(parks.some((m) => footprintsOf(m).some(([a, b]) => a === 3 && b === 3)), 'a three-tile park exists');
});

test('a park looks the same at every level and bigger lots get more furniture', () => {
  const sig = (id, w, d, lv) => buildParts(describe(rec(id, w, d), lv)).map((p) => p.local.elements.join(',')).join('|');
  for (const id of ['green', 'plaza', 'pond', 'garden', 'square', 'orchard']) assert.equal(sig(id, 2, 2, 1), sig(id, 2, 2, 5), id);
  const count = (id, w, d) => buildParts(describe(rec(id, w, d), 1)).length;
  assert.ok(count('green', 3, 3) > count('green', 1, 1));
  assert.ok(count('plaza', 3, 3) > count('plaza', 1, 1));
  assert.ok(count('playground', 2, 2) > count('playground', 1, 1));
});
