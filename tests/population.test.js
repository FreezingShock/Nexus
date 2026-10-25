import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { advance, rateG, speedOf, summaryOf } from '../src/sim/population.js';
import { unwrap, wrap, migrations } from '../src/sim/save.js';
import { POP } from '../src/sim/population-config.js';
import { graphSvg, panelHtml, steps } from '../src/ui/modules/population.js';
import { townCard } from '../src/ui/hud-detail.js';

test('growth is closed form: ticking and one big step agree', () => {
  let p = 10;
  for (let i = 0; i < 600; i++) p = advance(p, 100, 0.5, 1);
  assert.ok(Math.abs(p - advance(10, 100, 0.5, 600)) < 1e-9);
});

test('time constant: about two thirds of the gap closes in timeConstS at average happiness', () => {
  const p = advance(0, 90, POP.avgHappy, POP.timeConstS);
  assert.ok(Math.abs(p / 90 - (1 - Math.exp(-1))) < 1e-9);
});

test('happier towns fill faster, and nothing stops growth', () => {
  assert.ok(advance(0, 100, 1, 60) > advance(0, 100, 0.1, 60));
  assert.ok(advance(0, 100, 0, 60) > 0);
  assert.ok(speedOf(0) >= POP.mBase && rateG() > 0);
});

test('never above capacity, never below zero, eases down when homes go', () => {
  assert.equal(advance(5, 5, 1, 1e9), 5);
  assert.ok(advance(50, 20, 0.5, 100000) >= 20 - 1e-9);
  assert.ok(advance(50, 20, 0.5, 60) < 50);
  assert.equal(advance(7, 0, 0.5, 1e9), 0);
  assert.equal(advance(7, 10, 0.5, -5), 7);
});

test('sim: the starter town gets a population within its capacity and it grows', () => {
  const sim = createSim();
  const cap = sim.population.capacity();
  assert.ok(cap > 0);
  const p0 = sim.state.pop;
  assert.ok(p0 > 0 && p0 <= cap);
  sim.state.pop = 0;
  for (let i = 0; i < 60; i++) sim.tick();
  assert.ok(sim.state.pop > 0 && sim.state.pop <= cap);
  assert.ok(sim.state.popHist.length >= 1);
});

test('population does not change income', () => {
  const sim = createSim();
  const r = sim.rate();
  sim.state.pop = 0; sim.refresh && sim.refresh();
  assert.equal(sim.rate(), r);
});

test('offline catch-up uses the closed form', () => {
  const t0 = 1_000_000_000_000;
  const sim = createSim({ now: () => t0 + 3600 * 1000 });
  sim.state.pop = 0;
  sim.catchUp(t0);
  const cap = sim.population.capacity();
  assert.ok(sim.state.pop > cap * 0.99, 'an hour is twelve time constants');
});

test('the history ring stays bounded and saves round-trip', () => {
  const sim = createSim();
  for (let i = 0; i < 15 * 200; i++) sim.tick();
  assert.ok(sim.state.popHist.length <= 41);
  const back = unwrap(wrap(sim.prepareSave(), Date.now()));
  assert.ok(back.ok);
  assert.ok(Math.abs(back.state.pop - sim.state.pop) < 1e-9);
  assert.equal(back.state.popHist.length, sim.state.popHist.length);
  assert.equal(back.state.popLive, undefined);
});

test('bad saved values are repaired', () => {
  const env = wrap(freshState(), Date.now());
  env.state.pop = 'lots'; env.state.popHist = [[1, 2], 'x', [NaN, 1]];
  const r = unwrap(env);
  assert.ok(r.ok);
  assert.equal(r.state.pop, -1);
  assert.deepEqual(r.state.popHist, [[1, 2]]);
});

test('version 6 saves migrate and start at a share of capacity', () => {
  const s = freshState(); delete s.pop; delete s.popHist;
  const r = unwrap({ v: 6, savedAt: Date.now(), state: s });
  assert.ok(r.ok);
  assert.equal(r.state.pop, -1);
  const sim = createSim({ state: r.state });
  assert.ok(Math.abs(sim.state.pop - sim.population.capacity() * POP.startShare) < 1e-9);
  assert.equal(typeof migrations[migrations.length - 1], 'function');
});

test('panel and hover card text', () => {
  const sum = summaryOf(40, 100, 0.6);
  assert.equal(sum.pace, 'Steady');
  const html = panelHtml(sum, [[10, 100], [40, 100]], 0.6);
  assert.match(html, /of 100 places/);
  assert.match(html, /<svg/);
  assert.match(graphSvg([]), /<svg/);
  const card = townCard({ renewals: 0, points: 0 }, { people: 40, capacity: 100, perMin: 3 });
  assert.match(card, /40 of 100/);
  assert.match(card, /3\.0 a minute/);
  assert.match(townCard({ renewals: 0, points: 0 }), /Renewals/);
});

test('graph covers 10 minutes with a hover point every 2 minutes', () => {
  const hist = Array.from({ length: 41 }, (_, i) => [i * 2, 100]);
  const st = steps(hist);
  assert.deepEqual(st.map((q) => q.minAgo), [10, 8, 6, 4, 2, 0]);
  assert.equal(st[st.length - 1].people, 80);
  assert.equal(st[0].people, 0);
  assert.ok(Math.abs(st[st.length - 1].perMin - 8) < 1e-9, '16 people per 2 min is 8 a minute');
  assert.equal(st[0].perMin, null);
  assert.match(panelHtml(summaryOf(80, 100, 0.5), hist, 0.5, 2), /pp-tip/);
  assert.doesNotMatch(panelHtml(summaryOf(80, 100, 0.5), hist, 0.5), /pp-tip/);
  assert.equal(steps([[1, 2]]).length, 1);
  assert.match(graphSvg(hist, 5), /<line/);
});

test('the counter flies whole-number changes and ignores jumps', async () => {
  const { popDelta, flyLabel, hoppers, hoverHtml, FLY_MAX } = await import('../src/ui/modules/population.js');
  assert.equal(popDelta(10.2, 10.9), 0, 'no new whole person yet');
  assert.equal(popDelta(10.9, 11.1), 1);
  assert.equal(popDelta(11.1, 13.4), 2);
  assert.equal(popDelta(12, 11.5), -1, 'someone moved out');
  assert.equal(popDelta(10, 10 + FLY_MAX + 5), 0, 'offline catch-up or import is not a fly-off');
  assert.equal(popDelta(-1, 5), 0, 'unset population');
  assert.equal(popDelta(NaN, 5), 0);
  assert.equal(flyLabel(3), '+3');
  assert.equal(flyLabel(-1), '\u22121');
  assert.equal(flyLabel(0), '');
  assert.deepEqual([hoppers(1), hoppers(2), hoppers(9), hoppers(-2)], [1, 2, 3, 0]);
  assert.match(hoverHtml(summaryOf(40, 100, 0.6)), /40 residents/);
  assert.match(hoverHtml(summaryOf(100, 100, 0.6)), /Every home is full/);
});
