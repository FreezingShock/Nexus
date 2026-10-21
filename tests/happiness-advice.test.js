// The Happiness panel's words: the level, what helps, what pulls the streets down, and up to three tips with a spot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { getLayout } from '../src/world/layout.js';
import { GRID_N } from '../src/world/grid.js';
import { checkLot } from '../src/world/placement.js';
import { ADVICE } from '../src/sim/services-config.js';
import { adviceFrom, areaPhrase, levelOf } from '../src/sim/happiness-advice.js';

const AREA = GRID_N * GRID_N;
const tile = (gx, gz) => gz * GRID_N + gx;
const zeros = () => new Float32Array(AREA);
const maps = (over = {}) => ({ service: zeros(), park: zeros(), shop: zeros(), industry: zeros(), landmark: zeros(), ...over });
const homesAt = (list) => { const m = new Uint8Array(AREA); for (const [x, z] of list) m[tile(x, z)] = 1; return m; };
const none = { service: 0, park: 0, shop: 0, landmark: 0, industry: 0 };

test('levels are cozy words, and an empty town says nothing is built yet', () => {
  assert.equal(levelOf(0.5, 0).label, 'Nothing built yet');
  assert.equal(levelOf(0.7, 10).label, 'Cozy');
  assert.equal(levelOf(0.5, 10).label, 'Settled');
  assert.equal(levelOf(0.1, 10).label, 'Just getting started', 'the lowest step is still not a failure word');
});

test('area phrases read like a sentence: sides of town, or the middle', () => {
  assert.equal(areaPhrase(5, 5), 'the north-west side');
  assert.equal(areaPhrase(60, 32), 'the east side');
  assert.equal(areaPhrase(32, 60), 'the south side');
  assert.equal(areaPhrase(32, 32), 'the middle of town');
});

test('four bare homes in the west get tips for a clinic, a green and a shop, and a count of the bare homes', () => {
  const homes = [[5, 5], [5, 6], [6, 5], [6, 6]];
  const adv = adviceFrom({ built: 4, average: 0.3, homes: homesAt(homes), maps: maps(), counts: { ...none, service: 1 } });
  assert.equal(adv.level.label, 'Finding its feet');
  assert.match(adv.summary, /30% content/);
  assert.ok(adv.hurting.some((h) => /4 homes have nothing nearby yet/.test(h.text)));
  assert.ok(adv.tips.length <= ADVICE.tipsMax);
  assert.ok(adv.tips.some((t) => t.kind === 'service' && /clinic near the north-west side/.test(t.text) && /4 homes have no service/.test(t.text)));
  assert.ok(adv.tips.every((t) => t.gx >= 5 && t.gx <= 6 && t.gz >= 5 && t.gz <= 6), 'tips point at the bare homes');
});

test('tips are capped, and the biggest group comes first', () => {
  const homes = [];
  for (let k = 0; k < 6; k++) homes.push([5 + k, 5]);
  const adv = adviceFrom({ built: 6, average: 0.25, homes: homesAt(homes), maps: maps(), counts: none });
  assert.equal(adv.tips.length, ADVICE.tipsMax, 'three tips at most');
});

test('industry that touches homes gets its own tip and a line under what pulls down', () => {
  const homes = [[40, 40], [41, 40], [40, 41], [41, 41]];
  const industry = zeros();
  for (const [x, z] of homes) industry[tile(x, z)] = 0.5;
  const service = zeros(), park = zeros(), shop = zeros();
  for (const [x, z] of homes) { service[tile(x, z)] = 0.5; park[tile(x, z)] = 0.5; shop[tile(x, z)] = 0.5; }
  const adv = adviceFrom({ built: 4, average: 0.2, homes: homesAt(homes), maps: maps({ industry, service, park, shop }), counts: { ...none, industry: 2 } });
  const tip = adv.tips.find((t) => t.kind === 'industry');
  assert.ok(tip, 'an industry tip');
  assert.match(tip.text, /pulling on 4 homes/);
  assert.match(tip.text, /park or shop between them/);
  assert.ok(adv.hurting.some((h) => /2 industry sites ease 4 homes/.test(h.text)));
  assert.equal(adv.tips.length, 1, 'fully covered homes add no other tips');
});

test('a town with every home covered and nothing pulling it down is quiet, not failing', () => {
  const homes = [[10, 10], [11, 10]];
  const covered = zeros();
  for (const [x, z] of homes) covered[tile(x, z)] = 0.5;
  const adv = adviceFrom({ built: 2, average: 0.8, homes: homesAt(homes), maps: maps({ service: covered, park: covered, shop: covered }), counts: { ...none, service: 1 } });
  assert.deepEqual(adv.tips, []);
  assert.equal(adv.quiet, true);
  assert.equal(adv.level.label, 'Cozy');
  assert.ok(adv.hurting.length === 0, 'nothing listed as pulling down');
});

test('the sim gives advice for a real town, caches it, and refreshes after a placement', () => {
  const layout = getLayout();
  const state = freshState(); state.coins = 1e6;
  const sim = createSim({ state, layout });
  const empty = sim.services.advice();
  assert.equal(empty.level.label, 'Nothing built yet');
  assert.equal(sim.services.advice(), empty, 'same object while nothing changed');
  let spot = null;
  for (let gz = 2; gz < GRID_N - 2 && !spot; gz++) for (let gx = 2; gx < GRID_N - 2 && !spot; gx++) if (checkLot(sim.grid, gx, gz, 1, 1).ok) spot = [gx, gz];
  sim.dispatch({ type: 'place', model: 'cottage', gx: spot[0], gz: spot[1], fw: 1, fd: 1, rot: 0 });
  const after = sim.services.advice();
  assert.notEqual(after, empty, 'a placement rebuilds the advice');
  assert.equal(after.built, 1, 'one built tile');
  assert.ok(after.hurting.some((h) => /1 home has nothing nearby yet/.test(h.text)), 'the lone home is named');
  assert.deepEqual(after.tips, [], 'one home is below the tip threshold, so no tip yet');
});
