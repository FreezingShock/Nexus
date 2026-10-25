// The Happiness panel's words: the level, what helps, what pulls the streets down, and up to three tips with a spot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { getLayout } from '../src/world/layout.js';
import { GRID_N, GRID_HALF } from '../src/world/grid.js';
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
  assert.equal(areaPhrase(GRID_HALF + 28, GRID_HALF), 'the east side');
  assert.equal(areaPhrase(GRID_HALF, GRID_HALF + 28), 'the south side');
  assert.equal(areaPhrase(GRID_HALF, GRID_HALF), 'the middle of town');
});

test('four bare homes in the west get tips for a clinic, a green and a shop, and a count of the bare homes', () => {
  const homes = [[5, 5], [5, 6], [6, 5], [6, 6]];
  const adv = adviceFrom({ built: 4, average: 0.3, homes: homesAt(homes), maps: maps(), counts: { ...none, service: 1 } });
  assert.equal(adv.level.label, 'Finding its feet');
  assert.equal(adv.summary, '0 of 4 homes are well served, with two or more good things in reach. 4 homes still have nothing nearby.');
  assert.doesNotMatch(adv.summary, /%/, 'happiness is never a percentage');
  assert.deepEqual(adv.served, { well: 0, some: 0, none: 4 });
  assert.equal(adv.homes, 4);
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
  // the starter village is already built, so the advice starts from it
  const empty = sim.services.advice();
  assert.ok(empty.built > 0, 'the starter village counts as built');
  assert.equal(sim.services.advice(), empty, 'same object while nothing changed');
  let spot = null;
  for (let gz = 2; gz < GRID_N - 2 && !spot; gz++) for (let gx = 2; gx < GRID_N - 2 && !spot; gx++) if (checkLot(sim.grid, gx, gz, 1, 1).ok) spot = [gx, gz];
  sim.dispatch({ type: 'place', model: 'cottage', gx: spot[0], gz: spot[1], fw: 1, fd: 1, rot: 0 });
  const after = sim.services.advice();
  assert.notEqual(after, empty, 'a placement rebuilds the advice');
  assert.equal(after.built, empty.built + 1, 'one more built tile');
});

test('homes are sorted into well served, one thing in reach, and nothing yet', async () => {
  const { summaryOf } = await import('../src/sim/happiness-advice.js');
  const homes = [[10, 10], [11, 10], [12, 10]];
  const covered = (tiles) => { const m = new Float32Array(GRID_N * GRID_N); for (const [x, z] of tiles) m[z * GRID_N + x] = 1; return m; };
  const adv = adviceFrom({ built: 3, average: 0.5, homes: homesAt(homes), maps: maps({ park: covered([[10, 10], [11, 10]]), shop: covered([[10, 10]]) }), counts: { ...none, park: 1, shop: 1 } });
  assert.deepEqual(adv.served, { well: 1, some: 1, none: 1 });
  assert.deepEqual([adv.reached.park, adv.reached.shop, adv.reached.service], [2, 1, 0]);
  assert.equal(adv.counts.park, 1);
  assert.match(adv.summary, /^1 of 3 homes is well served/);
  assert.match(adv.summary, /1 home still has nothing nearby\.$/);
  assert.equal(summaryOf(2, 0, { well: 0, some: 0, none: 0 }), 'No homes yet. Happiness is about homes and what they can reach on foot.');
  assert.equal(summaryOf(2, 2, { well: 2, some: 0, none: 0 }), 'Every home is well served, with two or more good things in reach.');
});

test('the Happiness plaque and panel: a mood word and a face, never a percentage, and a row per thing in reach', async () => {
  const { moodStep, faceSvg, pipsHtml, panelHtml, hoverHtml, FACTORS } = await import('../src/ui/happiness-view.js');
  assert.deepEqual(ADVICE.levels.map((l) => moodStep(l.label)), [4, 3, 2, 1]);
  assert.equal(moodStep('Nothing built yet'), 0);
  assert.match(faceSvg(4), /<svg/);
  assert.notEqual(faceSvg(1), faceSvg(4), 'the face changes with the mood');
  assert.equal((pipsHtml(2).match(/class="on"/g) || []).length, 2);
  const homes = [[10, 10], [11, 10], [12, 10]];
  const adv = adviceFrom({ built: 3, average: 0.5, homes: homesAt(homes), maps: maps(), counts: { ...none, industry: 2 } });
  const html = panelHtml(adv);
  assert.doesNotMatch(html, /\d%</, 'no percentages in the words');
  for (const f of FACTORS) assert.match(html, new RegExp(f.name));
  assert.match(html, /0 of 3/);
  assert.match(html, /Workshops nearby/);
  assert.match(html, /How happiness works/);
  assert.match(html, /Roads do not change it/);
  assert.match(html, /data-tip="0"/);
  assert.match(hoverHtml(adv), /Click to see what homes can reach/);
  assert.match(hoverHtml({ built: 0 }), /appears once there are homes/);
});
