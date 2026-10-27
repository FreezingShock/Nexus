import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { getLayout } from '../src/world/layout.js';
import { wrap, unwrap } from '../src/sim/save.js';
import { GRID_N } from '../src/world/grid.js';
import { checkLot } from '../src/world/placement.js';
import { SERVICES, PARKS, LANDMARKS, MOOD } from '../src/sim/services-config.js';
import { kindOf, sourceOf, reachOf, happinessMap, growthOf, describeModel } from '../src/sim/services.js';
import servicesOverlay from '../src/render/systems/services-overlay.js';

const layout = getLayout();
const mk = () => { const state = freshState(); state.coins = 1e6; return createSim({ state, layout }); };

// The first open lot where a fw x fd building can stand, scanning row by row.
function findLot(sim, fw, fd, skip = []) {
  for (let gz = 2; gz < GRID_N - 2; gz++) for (let gx = 2; gx < GRID_N - 2; gx++) {
    if (skip.some(([x, z]) => Math.abs(x - gx) < 4 && Math.abs(z - gz) < 4)) continue;
    if (checkLot(sim.grid, gx, gz, fw, fd).ok) return [gx, gz];
  }
  return null;
}
const place = (sim, model, fw, fd, at) => {
  const before = sim.placedRecords().length;
  sim.dispatch({ type: 'place', model, gx: at[0], gz: at[1], fw, fd, rot: 0 });
  assert.equal(sim.placedRecords().length, before + 1, model + ' should be placed');
  return sim.placedRecords()[before];
};

test('kinds: services, parks and landmarks give coverage; homes and shops do not', () => {
  assert.equal(kindOf('clinic'), 'service');
  assert.equal(kindOf('green'), 'park');
  assert.equal(kindOf('town-hall'), 'landmark');
  assert.equal(kindOf('cottage'), null);
  assert.equal(sourceOf({ id: 'b1', model: 'cottage', gx: 0, gz: 0, fw: 1, fd: 1 }), null);
  const s = sourceOf({ id: 'b1', model: 'clinic', gx: 5, gz: 6, fw: 1, fd: 2 });
  assert.equal(s.kind, 'service');
  assert.equal(s.radius, SERVICES.clinic.radius);
  assert.equal(s.upkeep, SERVICES.clinic.upkeep);
});

test('every park and landmark has a config entry, and every service model is a service', () => {
  for (const m of ['green', 'plaza', 'playground', 'pond', 'garden', 'square', 'orchard']) assert.ok(PARKS[m], m);
  for (const m of ['town-hall', 'church']) assert.ok(LANDMARKS[m], m);
  for (const m of ['clinic', 'school', 'fire-station', 'police']) assert.ok(SERVICES[m], m);
});

test('reach: full weight on the footprint edge, fading to nothing at radius + 1', () => {
  const s = { gx: 10, gz: 10, fw: 1, fd: 1, radius: 4, strength: 0.5 };
  const w = new Map(reachOf(s).map(([x, z, v]) => [x + ',' + z, v]));
  assert.equal(w.get('10,10'), 0.5);
  assert.ok(Math.abs(w.get('14,10') - 0.1) < 1e-9, 'distance 4 is a fifth of strength');
  assert.equal(w.has('15,10'), false);
  assert.ok(Math.abs(w.get('14,14') - 0.1) < 1e-9, 'corners use Chebyshev distance: (14,14) is still 4 away');
  assert.equal(w.has('15,15'), false, 'and (15,15) is 5 away, outside');
  assert.ok(reachOf({ gx: 10, gz: 10, fw: 2, fd: 1, radius: 2, strength: 1 }).some(([x, z, v]) => x === 11 && z === 10 && v === 1));
});

test('reach is clipped to the grid at the edges', () => {
  const out = reachOf({ gx: 0, gz: 0, fw: 1, fd: 1, radius: 5, strength: 1 });
  assert.ok(out.every(([x, z]) => x >= 0 && z >= 0 && x < GRID_N && z < GRID_N));
});

test('happiness: base with no coverage, higher near sources, bounded, and it saturates', () => {
  const none = happinessMap([]);
  assert.ok(none.every((v) => v === MOOD.base));
  const one = happinessMap([sourceOf({ id: 'b1', model: 'school', gx: 20, gz: 20, fw: 1, fd: 2 })]);
  assert.ok(one[20 * GRID_N + 20] > one[5 * GRID_N + 5], 'near a school is happier than far away');
  const many = happinessMap(Array.from({ length: 12 }, () => sourceOf({ id: 'x', model: 'school', gx: 20, gz: 20, fw: 1, fd: 2 })));
  const i = 20 * GRID_N + 20;
  assert.ok(many[i] > one[i] && many[i] < 1, 'more coverage helps, but never reaches 1');
  assert.ok([...many].every((v) => v >= MOOD.base && v <= 1));
  assert.deepEqual(happinessMap([sourceOf({ id: 'b1', model: 'clinic', gx: 3, gz: 3, fw: 1, fd: 1 })]), happinessMap([sourceOf({ id: 'b1', model: 'clinic', gx: 3, gz: 3, fw: 1, fd: 1 })]));
});

test('growth multiplier: 1 with nothing built, bounded, faster when happy', () => {
  assert.equal(growthOf(0.9, 0), 1);
  assert.equal(growthOf(0.5, 10), 1);
  assert.ok(growthOf(1, 10) > 1 && growthOf(1, 10) <= MOOD.growthMax);
  assert.ok(growthOf(0, 10) < 1 && growthOf(0, 10) >= MOOD.growthMin);
});

test('tooltips say what a model does, and landmarks show their coins', () => {
  assert.match(describeModel('clinic'), /upkeep 0\.25/);
  assert.match(describeModel('town-hall'), /\+1\.5 coins\/s/);
  assert.equal(describeModel('cottage'), '');
});

test('a placed clinic adds upkeep, covers tiles, and its tiles count as built', () => {
  const sim = mk(); // the starter town already has a park (its upkeep is in the baseline)
  const before = sim.services.summary();
  const at = findLot(sim, 1, 1);
  place(sim, 'clinic', 1, 1, at);
  const s = sim.services.summary();
  assert.equal(s.services, before.services + 1);
  assert.ok(Math.abs(s.upkeep - before.upkeep - SERVICES.clinic.upkeep) < 1e-9);
  assert.ok(s.built >= 1);
  assert.ok(sim.services.happinessAt(at[0] + 1, at[1]) > MOOD.base, 'the neighbour tile feels the clinic');
  assert.ok(s.average >= MOOD.base && s.average <= 1);
});

test('services are never punishing: thirty clinics still leave the town earning', () => {
  const sim = mk();
  const spots = [];
  for (let n = 0; n < 30; n++) {
    const at = findLot(sim, 1, 1, spots);
    if (!at) break;
    spots.push(at);
    place(sim, 'clinic', 1, 1, at);
  }
  assert.ok(sim.services.summary().services >= 20);
  assert.ok(sim.rate() > 0, 'upkeep stays below the base income');
});

test('landmarks pay a flat amount that the rate includes', () => {
  const sim = mk();
  const base = sim.rate();
  place(sim, 'town-hall', 2, 1, findLot(sim, 2, 1));
  assert.equal(sim.services.summary().landmarkCoins, LANDMARKS['town-hall'].coins);
  assert.ok(sim.rate() >= base + LANDMARKS['town-hall'].coins - 0.5, 'landmark coins land in the rate (less any mood change)');
});

test('parks place on open ground, cover tiles, and cannot be upgraded', () => {
  const sim = mk();
  const parks = sim.services.summary().parks;
  const rec = place(sim, 'green', 1, 1, findLot(sim, 1, 1));
  assert.equal(sim.services.summary().parks, parks + 1);
  sim.dispatch({ type: 'upgrade', id: rec.id });
  assert.equal(sim.state.levels[rec.id], undefined, 'a park has no storeys to add');
});

test('a placed park survives a save, with its coverage back', () => {
  const sim = mk();
  const at = findLot(sim, 2, 2);
  place(sim, 'pond', 2, 2, at);
  const back = createSim({ state: unwrap(wrap(sim.state, 1)).state, layout });
  assert.equal(back.services.summary().parks, sim.services.summary().parks);
  assert.equal(back.services.happinessAt(at[0], at[1]), sim.services.happinessAt(at[0], at[1]));
});

test('bulldozing a clinic removes its upkeep and coverage', () => {
  const sim = mk();
  const before = sim.services.summary();
  const rec = place(sim, 'clinic', 1, 1, findLot(sim, 1, 1));
  sim.dispatch({ type: 'bulldoze', id: rec.id });
  assert.equal(sim.services.summary().services, before.services);
  assert.ok(Math.abs(sim.services.summary().upkeep - before.upkeep) < 1e-9);
});

test('the overlay writes covered tiles and hides when cleared', () => {
  const world = new THREE.Group();
  const sys = servicesOverlay.create({ world });
  sys.show({ cover: [[3, 4], [5, 6]], focus: [[5, 6]] });
  assert.equal(world.children[0].visible, true);
  sys.show({ cover: [], focus: [] });
  assert.equal(world.children[0].visible, false);
  sys.clear();
  assert.equal(world.children[0].visible, false);
});
