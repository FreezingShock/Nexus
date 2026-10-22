import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { getLayout } from '../src/world/layout.js';
import { freshState } from '../src/sim/state.js';
import { ROAD_TYPES } from '../src/sim/catalog.js';
import { SAVE_VERSION, migrations, sanitize, unwrap, wrap } from '../src/sim/save.js';
import { seasonLengthS } from '../src/core/calendar.js';
import {
  GOALS, GROUPS, LEGACY_MILESTONES, REWARD_COINS, REWARD_PARTS, STAGES, fmtTarget, goalById, legacyDone, nearest, rewardFor,
  rewardLine, stagesReached, standing, summary, totalStages, unlockFor,
} from '../src/sim/achievements.js';
import { METRICS } from '../src/sim/achievement-metrics.js';

const layout = getLayout();
const T0 = Date.UTC(2026, 9, 22, 12);
const mk = (opts = {}) => createSim({ layout, now: () => T0, ...opts });
const run = (sim, n = 3) => { for (let i = 0; i < n; i++) sim.tick(); };
// The first spot with n open tiles in a row, for painting.
function openRow(sim, n) {
  for (let gz = 0; gz < 96; gz++) for (let gx = 0; gx + n <= 96; gx++) {
    let ok = true;
    for (let k = 0; k < n && ok; k++) ok = sim.grid.isOpen(gx + k, gz);
    if (ok) return [gx, gz];
  }
  throw new Error('no open row');
}
const collect = (sim) => { const out = []; sim.subscribe((e) => { if (e.type === 'milestone') out.push(e); }); return out; };

// ---- the catalogue ----

test('every goal is well formed: unique id, known group and metric, one to five rising targets', () => {
  const ids = new Set();
  for (const g of GOALS) {
    assert.ok(!ids.has(g.id), 'duplicate ' + g.id); ids.add(g.id);
    assert.ok(GROUPS.some((x) => x.id === g.group), g.id + ' group');
    assert.equal(typeof METRICS[g.metric], 'function', g.id + ' needs a reader for ' + g.metric);
    assert.ok(g.name && g.blurb && g.unit, g.id + ' text');
    assert.ok(g.tiers.length >= 1 && g.tiers.length <= STAGES.length, g.id + ' stage count');
    g.tiers.forEach((t, i) => { assert.ok(t > 0); if (i) assert.ok(t > g.tiers[i - 1], g.id + ' targets must rise'); });
    for (const [stage, road] of Object.entries(g.unlocks || {})) {
      assert.ok(stage >= 1 && stage <= g.tiers.length, g.id + ' unlock stage');
      assert.ok(ROAD_TYPES.some((r) => r.id === road && r.unlockParts), g.id + ' unlocks a road that Parts gate');
    }
  }
  for (const grp of GROUPS) assert.ok(GOALS.some((g) => g.group === grp.id), grp.id + ' has goals');
  assert.ok(totalStages() >= 100, 'in depth: well over a hundred stages');
});

test('rewards rise with every stage, pay both currencies and scale with the goal weight', () => {
  for (let i = 1; i < 5; i++) { assert.ok(REWARD_COINS[i] > REWARD_COINS[i - 1]); assert.ok(REWARD_PARTS[i] > REWARD_PARTS[i - 1]); }
  const g = goalById('placed'), heavy = goalById('renewals');
  for (let s = 1; s <= 5; s++) {
    const r = rewardFor(g, s);
    assert.ok(r.coins > 0 && r.parts > 0);
    if (s > 1) assert.ok(r.coins > rewardFor(g, s - 1).coins);
    assert.ok(rewardFor(heavy, s).coins > r.coins, 'a weighted goal pays more');
  }
});

test('stagesReached counts targets met, and standing reports the next target and how far along it is', () => {
  const g = goalById('placed'); // 1, 10, 40, 100, 250
  assert.equal(stagesReached(g, 0), 0);
  assert.equal(stagesReached(g, 1), 1);
  assert.equal(stagesReached(g, 39), 2);
  assert.equal(stagesReached(g, 1e9), 5);
  const s = freshState();
  s.stats.placed = 25; s.ach.done.placed = 2;
  const st = standing(s, g);
  assert.equal(st.value, 25);
  assert.equal(st.next, 40);
  assert.ok(Math.abs(st.frac - 0.5) < 1e-9, 'halfway between 10 and 40');
  s.ach.done.placed = 5;
  assert.equal(standing(s, g).complete, true);
  assert.equal(standing(s, g).frac, 1);
});

test('summary and nearest read the same standings the panel draws', () => {
  const s = freshState();
  assert.deepEqual(summary(s), { stages: 0, totalStages: totalStages(), goalsComplete: 0, totalGoals: GOALS.length });
  s.stats.placed = 9; // 9 of 10: nearly Silver
  const [first] = nearest(s, 3);
  assert.equal(first.goal.id, 'placed');
  assert.equal(nearest(s, 2).length, 2);
});

test('text helpers: targets read in words and reward lines name coins, Parts and the road they open', () => {
  assert.equal(fmtTarget(goalById('placed'), 10), '10 buildings placed');
  assert.equal(fmtTarget(goalById('earned'), 1e7), '10 million coins');
  assert.equal(fmtTarget(goalById('snow'), 1), 'See the first snow');
  assert.equal(rewardLine({ coins: 3000, parts: 60 }, 'bike', () => 'Bike street'), '+3,000 coins · +60 Parts · opens Bike street');
  assert.equal(unlockFor(goalById('roadTiles'), 2), 'bike');
  assert.equal(unlockFor(goalById('roadTiles'), 1), null);
});

// ---- the sim ----

test('a brand-new town has paid nothing: the starter village is a gift, not an achievement', () => {
  const sim = mk();
  const notes = collect(sim);
  const coins = sim.state.coins;
  run(sim, 6);
  assert.deepEqual(sim.state.ach.done, {});
  assert.equal(notes.length, 0);
  assert.ok(sim.state.coins >= coins, 'and nothing was taken');
});

test('reaching a stage pays its reward once, with a postcard note', () => {
  const sim = mk();
  const notes = collect(sim);
  sim.state.stats.placed = 1;
  const coins = sim.state.coins, parts = sim.state.parts;
  run(sim);
  const r = rewardFor(goalById('placed'), 1);
  assert.equal(sim.state.ach.done.placed, 1);
  assert.ok(sim.state.coins >= coins + r.coins && sim.state.parts >= parts + r.parts);
  assert.equal(notes.length, 1);
  assert.match(notes[0].title, /Bronze/);
  assert.match(notes[0].text, /1 buildings placed/);
  const after = sim.state.coins;
  run(sim, 6);
  assert.equal(notes.length, 1, 'no second note');
  assert.ok(sim.state.coins - after < r.coins, 'and no second payment');
});

test('several stages at once arrive as one bundled postcard, but are all paid', () => {
  const sim = mk();
  const notes = collect(sim);
  sim.state.stats.placed = 300; // all five stages of Builder
  sim.state.stats.painted = 60; // and two of Painted ground
  const coins = sim.state.coins;
  run(sim);
  assert.equal(sim.state.ach.done.placed, 5);
  assert.equal(sim.state.ach.done.painted, 2);
  assert.equal(notes.length, 1);
  assert.match(notes[0].text, /^7 stages across 2 goals/);
  let want = 0;
  for (let s = 1; s <= 5; s++) want += rewardFor(goalById('placed'), s).coins;
  for (let s = 1; s <= 2; s++) want += rewardFor(goalById('painted'), s).coins;
  assert.ok(sim.state.coins >= coins + want);
});

test('a stage is never taken back: the best value is kept when the town shrinks', () => {
  const sim = mk();
  sim.state.stats.roadTiles = 200;
  run(sim);
  assert.equal(sim.state.ach.done.roadTiles, 3);
  sim.state.stats.roadTiles = 0;
  run(sim);
  assert.equal(sim.state.ach.done.roadTiles, 3);
  assert.equal(standing(sim.state, goalById('roadTiles')).value, 200, 'and its progress stays too');
});

test('a stage can open a road type for free', () => {
  const sim = mk();
  sim.state.parts = 0;
  assert.ok(!sim.state.roadUnlocks.includes('bike'));
  sim.state.stats.roadTiles = 60;
  run(sim);
  assert.ok(sim.state.roadUnlocks.includes('bike'), 'Silver road builder opens the bike street');
  assert.ok(!sim.state.roadUnlocks.includes('one'));
  sim.state.stats.roadTiles = 150;
  run(sim);
  assert.ok(sim.state.roadUnlocks.includes('one'));
  assert.equal(sim.state.roadUnlocks.filter((r) => r === 'bike').length, 1, 'never listed twice');
});

test('commands pay too: a first upgrade and a first painted row show up without waiting for a tick', () => {
  const sim = mk();
  const notes = collect(sim);
  sim.state.coins = 1e6;
  const [gx, gz] = openRow(sim, 12);
  sim.dispatch({ type: 'paintZone', zone: 1, a: [gx, gz], b: [gx + 3, gz] });
  assert.equal(sim.state.stats.painted, 4);
  assert.equal(sim.state.ach.done.painted || 0, 0, 'four tiles is short of the first stage');
  sim.dispatch({ type: 'paintZone', zone: 1, a: [gx + 4, gz], b: [gx + 11, gz] });
  assert.equal(sim.state.ach.done.painted, 1);
  assert.equal(notes.length, 1);
});

test('finishing a goal counts towards Goal getter, and a finished daily set counts too', () => {
  const sim = mk();
  sim.state.goals.slots[0] = { k: 'earn', p: 2999 };
  run(sim, 1);
  assert.equal(sim.state.ach.counts.goalsDone, 1);
  const g = sim.state.goals;
  g.slots = [{ k: 'earn', p: 2999 }, { k: 'build', p: 1.9 }, { k: 'paint', p: 11.9 }];
  g.doneToday = 0;
  g.slots[0].p = 2999;
  run(sim, 1);
  assert.equal(sim.state.ach.counts.goalsDone, 2);
  assert.equal(sim.state.ach.counts.dailies, 0, 'the daily set needs all three');
  g.doneToday = GOALS.length; // many goals done today
  g.slots[0] = { k: 'earn', p: 2999 };
  g.bonusDay = '';
  run(sim, 1);
  assert.equal(sim.state.ach.counts.dailies, 1);
});

test('seasons are counted from the game clock in closed form, so time away counts', () => {
  const sim = mk({ now: () => T0 });
  const len = seasonLengthS(sim.calendarOptions);
  const before = sim.ticks;
  sim.catchUp(T0 - 3 * 3600 * 1000); // three hours away
  assert.equal(sim.ticks, before, 'catch-up is one evaluation, not a loop over ticks');
  assert.ok(sim.state.clockS >= 10000);
  run(sim);
  const seasons = Math.floor(sim.state.clockS / len);
  assert.ok(seasons >= 7);
  assert.equal(METRICS.seasons({ sim, state: sim.state }), seasons);
  assert.equal(sim.state.ach.done.seasons, 2, 'one season and four seasons are reached, eight is just short');
});

test('a Renewal keeps every stage, best value and count', () => {
  const sim = mk();
  sim.state.coins = 1e9; sim.state.runEarned = 1e7 * 1.5;
  sim.state.stats.placed = 12;
  run(sim);
  assert.equal(sim.state.ach.done.placed, 2);
  const kept = JSON.stringify(sim.state.ach);
  sim.dispatch({ type: 'renew' });
  assert.equal(sim.state.renewals, 1);
  assert.equal(sim.state.ach.done.placed, 2);
  assert.equal(sim.state.ach.done.renewals, 1, 'and the Renewal itself earned its first stage');
  const a = JSON.parse(kept);
  for (const [k, v] of Object.entries(a.best)) assert.ok(sim.state.ach.best[k] >= v, k);
});

test('metrics: population counts homes, lots and shops; the starter village counts as neighbours but not as builder work', () => {
  const sim = mk();
  const ctx = { sim, state: sim.state, grid: sim.grid };
  const start = METRICS.population(ctx);
  assert.ok(start > 0, 'people live in the starter village');
  assert.equal(METRICS.services(ctx), 0);
  assert.equal(METRICS.parks(ctx), 0);
  assert.equal(METRICS.farms(ctx), 0);
  sim.state.lots.push([0, 3, 1]); sim.grid.zone[0] = 1;
  assert.equal(METRICS.population(ctx), start + 12);
  assert.equal(METRICS.zoneKinds(ctx), 1);
});

// ---- saving ----

test('sanitize keeps only well-formed stages: unknown goals dropped, counts clamped, junk replaced', () => {
  const s = sanitize({
    ach: { done: { placed: 3, nope: 4, roadTypes: 99, snow: -2, earned: 1.5 }, best: { earned: 5e3, population: -1, nope: 3, income: 'x' }, counts: { goalsDone: 7, dailies: 'x' } },
  });
  assert.deepEqual(s.ach.done, { placed: 3, roadTypes: 4 });
  assert.deepEqual(s.ach.best, { earned: 5e3 });
  assert.deepEqual(s.ach.counts, { goalsDone: 7, dailies: 0 });
  assert.deepEqual(sanitize({ ach: 'bad' }).ach, { done: {}, best: {}, counts: { goalsDone: 0, dailies: 0 } });
  assert.deepEqual(sanitize(null).ach.done, {});
});

test('stages survive a save and a reload, and are not paid a second time', () => {
  const sim = mk();
  sim.state.stats.placed = 12; sim.state.stats.upgrades = 2;
  run(sim);
  const back = unwrap(JSON.stringify(wrap(sim.prepareSave(), 1)));
  assert.ok(back.ok);
  assert.deepEqual(back.state.ach.done, sim.state.ach.done);
  const sim2 = createSim({ layout, now: () => T0, state: back.state });
  const coins = sim2.state.coins;
  run(sim2, 6);
  assert.ok(sim2.state.coins - coins < 100, 'only the ordinary income arrives');
});

test('the v6 migration turns paid milestone ids into paid stages and drops the old list', () => {
  assert.equal(SAVE_VERSION, 6);
  const old = { ...freshState(), milestones: ['coins-1k', 'coins-100k', 'place-1', 'nope'], earned: 2e5 };
  delete old.ach;
  const r = unwrap(JSON.stringify({ v: 5, savedAt: 1, state: old }));
  assert.ok(r.ok);
  assert.deepEqual(r.state.ach.done, { earned: 2, placed: 1 });
  assert.equal('milestones' in r.state, false);
  // the town has already earned 200,000 coins, which is two stages, both already paid: nothing pays again
  const sim = createSim({ layout, now: () => T0, state: r.state });
  const coins = sim.state.coins;
  run(sim);
  assert.equal(sim.state.ach.done.earned, 2);
  assert.ok(sim.state.coins - coins < 100);
});

test('every legacy milestone maps to a real stage that its old target reaches', () => {
  const OLD = { 'coins-1k': 1e3, 'coins-100k': 1e5, 'coins-10m': 1e7, 'place-1': 1, 'place-10': 10, 'place-40': 40, 'paint-50': 50, 'road-60': 60, 'upgrade-10': 10, 'boost-3': 3, 'renew-1': 1 };
  assert.deepEqual(Object.keys(OLD).sort(), Object.keys(LEGACY_MILESTONES).sort());
  for (const [id, [goalId, stage]] of Object.entries(LEGACY_MILESTONES)) {
    const g = goalById(goalId);
    assert.ok(g && stage <= g.tiers.length, id);
    assert.ok(g.tiers[stage - 1] <= OLD[id], id + ' must not pay a stage the old milestone had not reached');
  }
  assert.deepEqual(legacyDone(['place-1', 'place-10', 'x']), { placed: 2 });
  assert.deepEqual(legacyDone('nope'), {});
});

test('the migration list ends at the achievements step and every step is a function', () => {
  assert.equal(migrations.length, SAVE_VERSION - 1);
  assert.ok(migrations.every((m) => typeof m === 'function'));
});
