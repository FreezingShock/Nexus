// Shops lift the homes around them, industry eases them a little, and a new service's gains drive its animation.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { getLayout } from '../src/world/layout.js';
import { GRID_N } from '../src/world/grid.js';
import { checkLot } from '../src/world/placement.js';
import { MOOD, SHOPS, INDUSTRY, SHOP_LOT, INDUSTRY_LOT } from '../src/sim/services-config.js';
import { gainsOf, happinessMap, kindOf, lotSource, sourceOf, describeModel } from '../src/sim/services.js';
import servicesOverlay from '../src/render/systems/services-overlay.js';

const layout = getLayout();
const mk = () => { const state = freshState(); state.coins = 1e6; return createSim({ state, layout }); };
const at = (map, gx, gz) => map[gz * GRID_N + gx];

function findLot(sim, fw, fd, near = null) {
  for (let gz = 2; gz < GRID_N - 2; gz++) for (let gx = 2; gx < GRID_N - 2; gx++) {
    if (near && (Math.abs(gx - near[0]) > 6 || Math.abs(gz - near[1]) > 6)) continue;
    if (checkLot(sim.grid, gx, gz, fw, fd).ok) return [gx, gz];
  }
  return null;
}
function place(sim, model, fw, fd, where) {
  const before = sim.placedRecords().length;
  sim.dispatch({ type: 'place', model, gx: where[0], gz: where[1], fw, fd, rot: 0 });
  assert.equal(sim.placedRecords().length, before + 1, model + ' should be placed');
  return sim.placedRecords()[before];
}

test('kinds: shops and industry are their own kinds, and offices are not industry', () => {
  assert.equal(kindOf('shop-row'), 'shop');
  assert.equal(kindOf('cafe'), 'shop');
  assert.equal(kindOf('workshop'), 'industry');
  assert.equal(kindOf('warehouse'), 'industry');
  assert.equal(kindOf('office'), null, 'an office is a workplace, not industry');
  assert.equal(kindOf('cottage'), null);
});

test('a shop lifts the homes around it, and the lift fades with distance', () => {
  const shop = sourceOf({ id: 's1', model: 'cafe', gx: 20, gz: 20, fw: 1, fd: 1 });
  const map = happinessMap([shop]);
  assert.ok(at(map, 21, 20) > MOOD.base, 'the next tile is happier');
  assert.ok(at(map, 21, 20) > at(map, 23, 20), 'nearer is happier than further');
  assert.equal(at(map, 30, 20), MOOD.base, 'far away is untouched');
});

test('industry eases happiness down, never below the floor, however much is nearby', () => {
  const base = happinessMap([]);
  const one = happinessMap([sourceOf({ id: 'w1', model: 'workshop', gx: 20, gz: 20, fw: 1, fd: 2 })]);
  assert.ok(at(one, 21, 20) < at(base, 21, 20), 'next to a workshop feels a little worse');
  assert.ok(at(base, 21, 20) - at(one, 21, 20) < MOOD.industryMax, 'the drop is gentle');
  const crowd = Array.from({ length: 40 }, (_, k) => sourceOf({ id: 'w' + k, model: 'warehouse', gx: 20, gz: 20, fw: 2, fd: 2 }));
  const heavy = happinessMap(crowd);
  assert.ok(at(heavy, 20, 20) >= MOOD.floor, 'never below the floor');
  assert.ok([...heavy].every((v) => v >= MOOD.floor && v <= 1));
});

test('a shop next to industry offsets some of it', () => {
  const industry = sourceOf({ id: 'w1', model: 'workshop', gx: 20, gz: 20, fw: 1, fd: 1 });
  const shop = sourceOf({ id: 's1', model: 'market', gx: 21, gz: 20, fw: 1, fd: 1 });
  const alone = at(happinessMap([industry]), 20, 20);
  const both = at(happinessMap([industry, shop]), 20, 20);
  assert.ok(both > alone, 'the market lifts the same tile the workshop eases');
});

test('gainsOf lists only homes that gained, biggest first, and caps the list', () => {
  const prev = new Float32Array(GRID_N * GRID_N).fill(0.25);
  const next = new Float32Array(GRID_N * GRID_N).fill(0.25);
  const homes = new Uint8Array(GRID_N * GRID_N);
  const i1 = 5 * GRID_N + 5, i2 = 6 * GRID_N + 6, i3 = 9 * GRID_N + 9;
  next[i1] = 0.5; next[i2] = 0.3; next[i3] = 0.9; // i3 is not a home
  homes[i1] = 1; homes[i2] = 1;
  const first = gainsOf(prev, next, homes);
  assert.equal(first.length, 2);
  assert.deepEqual(first.map(([x, z]) => [x, z]), [[5, 5], [6, 6]]);
  assert.ok(Math.abs(first[0][2] - 0.25) < 1e-6 && Math.abs(first[1][2] - 0.05) < 1e-6, 'gain is next minus previous');
  next[i1] = 0.25 + MOOD.gainMin / 2; // below the threshold
  assert.equal(gainsOf(prev, next, homes).length, 1);
  homes.fill(1);
  for (let i = 0; i < next.length; i++) next[i] = 0.9;
  assert.equal(gainsOf(prev, next, homes).length, MOOD.gainCap, 'capped');
});

test('zoned lots: Commercial is a shop, Industrial is industry, and other zones give nothing', () => {
  assert.equal(lotSource(10, 2, 1).kind, 'shop');
  assert.equal(lotSource(10, 3, 1).kind, 'industry');
  assert.equal(lotSource(10, 1, 1), null, 'homes are not sources');
  assert.equal(lotSource(10, 4, 1), null, 'civic does not reach');
  assert.ok(lotSource(10, 2, 5).strength > lotSource(10, 2, 1).strength, 'a higher level is a little stronger');
  assert.equal(lotSource(10, 2, 1).radius, SHOP_LOT.radius);
  assert.equal(lotSource(10, 3, 1).radius, INDUSTRY_LOT.radius);
});

test('describe: shops and industry say what they do to the streets', () => {
  assert.match(describeModel('cafe'), /Lifts happiness on 3 tiles/);
  assert.match(describeModel('workshop'), /Eases happiness/);
  assert.equal(SHOPS.cafe.radius, 3);
  assert.equal(INDUSTRY.workshop.radius, 3);
});

test('placing a shop next to a home gives that home a gain for its animation', () => {
  const sim = mk();
  const home = findLot(sim, 1, 1);
  place(sim, 'cottage', 1, 1, home);
  const spot = [[home[0] + 2, home[1]], [home[0] - 2, home[1]], [home[0], home[1] + 2], [home[0], home[1] - 2]]
    .find(([x, z]) => checkLot(sim.grid, x, z, 1, 1).ok);
  assert.ok(spot, 'there is room for a cafe near the cottage');
  const cafe = place(sim, 'cafe', 1, 1, spot);
  const fx = sim.services.gainsFor(cafe.id);
  assert.ok(fx, 'a shop placement has gains');
  assert.equal(fx.source.id, cafe.id);
  assert.ok(fx.gains.some(([x, z, g]) => x === home[0] && z === home[1] && g >= MOOD.gainMin), 'the cottage gained');
  assert.equal(sim.services.summary().shops, 1);
});

test('placing industry lowers nearby homes, and does not start a celebration', () => {
  const sim = mk();
  const home = findLot(sim, 1, 1);
  place(sim, 'cottage', 1, 1, home);
  const before = sim.services.happinessAt(home[0], home[1]);
  const spot = [[home[0] + 2, home[1]], [home[0] - 2, home[1]], [home[0], home[1] + 2], [home[0], home[1] - 2]]
    .find(([x, z]) => checkLot(sim.grid, x, z, 1, 2).ok);
  assert.ok(spot, 'there is room for a workshop near the cottage');
  const ws = place(sim, 'workshop', 1, 2, spot);
  assert.ok(sim.services.happinessAt(home[0], home[1]) < before, 'the cottage feels the workshop');
  assert.equal(sim.services.gainsFor(ws.id), null, 'industry does not animate hearts');
  assert.equal(sim.services.summary().industry, 1);
});

test('the overlay draws industry haze and a ripple that finishes and hides', () => {
  const world = new THREE.Group();
  const ov = servicesOverlay.create({ world });
  const mesh = world.children[0];
  ov.show({ haze: [[3, 3]] });
  assert.equal(mesh.visible, true, 'haze alone shows the overlay');
  ov.clear();
  assert.equal(mesh.visible, false);
  ov.ripple(10, 10, 4);
  assert.equal(mesh.visible, true, 'a ripple shows the overlay');
  ov.frame({ dt: 0.5 });
  assert.equal(mesh.visible, true, 'still rippling halfway through');
  ov.frame({ dt: 2 });
  assert.equal(mesh.visible, false, 'hidden once the ripple has finished');
});
