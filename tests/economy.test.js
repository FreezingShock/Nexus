import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { getLayout } from '../src/world/layout.js';
import { BALANCE } from '../src/sim/balance.js';
import { buildCost, bulkCost, coinRate, START_COINS, START_PARTS } from '../src/sim/economy.js';
import { dayKey, goalDef, pendingPoints, pointsMult, runNeededFor, yesterdayKey } from '../src/sim/progress.js';
import { lotParts, ZONE_DEFS } from '../src/sim/zones.js';
import { ROAD_TYPES } from '../src/sim/catalog.js';
import { sanitize } from '../src/sim/save.js';

const layout = getLayout();
const T0 = Date.UTC(2026, 9, 21, 12); // a fixed clock for day keys
const mk = (opts = {}) => createSim({ layout, now: () => T0, ...opts });

test('build cost grows by r for every building already placed, and the bulk formula agrees with a loop', () => {
  assert.equal(BALANCE.growth, 1.15);
  assert.equal(buildCost(100, 0), 100);
  assert.equal(buildCost(100, 3), Math.round(100 * 1.15 ** 3));
  assert.ok(buildCost(100, 10) > buildCost(100, 9));
  let sum = 0;
  for (let k = 0; k < 5; k++) sum += 100 * 1.15 ** (2 + k);
  assert.ok(Math.abs(bulkCost(100, 2, 5) - sum) < 1e-6);
  assert.equal(bulkCost(100, 0, 3, 1), 300);
});

test('tiers: tier 2 at 150 Parts, bus at 600, freeway at 1,500, read from one config', () => {
  const gate = Object.fromEntries(ROAD_TYPES.filter((r) => r.unlockParts).map((r) => [r.id, r.unlockParts]));
  assert.deepEqual(gate, BALANCE.tiers);
  assert.equal(BALANCE.tiers.bike, 150);
  assert.equal(BALANCE.tiers.bus, 600);
  assert.equal(BALANCE.tiers.free, 1500);
});

test('a locked road tier cannot be drawn, and unlocking spends its Parts once', () => {
  const sim = mk();
  sim.state.parts = 100; sim.state.coins = 1e6;
  sim.dispatch({ type: 'unlockRoad', roadType: 'bike' });
  assert.ok(!sim.state.roadUnlocks.includes('bike'));
  assert.equal(sim.state.parts, 100);
  sim.state.parts = 150;
  sim.dispatch({ type: 'unlockRoad', roadType: 'bike' });
  assert.ok(sim.state.roadUnlocks.includes('bike'));
  assert.equal(sim.state.parts, 0);
  sim.dispatch({ type: 'unlockRoad', roadType: 'bike' });
  assert.equal(sim.state.parts, 0, 'a second unlock costs nothing');
});

test('starting values and base Parts rate match the config', () => {
  const sim = mk();
  assert.equal(sim.state.coins, START_COINS);
  assert.equal(sim.state.parts, START_PARTS);
  assert.equal(sim.partsRate(), BALANCE.base.parts);
});

test('industrial and civic lots make Parts; residential and commercial make none', () => {
  assert.equal(ZONE_DEFS[1].parts, 0);
  assert.equal(ZONE_DEFS[2].parts, 0);
  assert.equal(lotParts([[10, 4, 1]], () => 3), 4 * BALANCE.zones.ind.parts);
  assert.equal(lotParts([[10, 2, 1], [11, 1, 1]], (i) => (i === 10 ? 4 : 1)), 2 * BALANCE.zones.civ.parts + 1 * BALANCE.zones.res.parts);
});

test('Charge: building adds to it, time regenerates it slowly, it never goes past the max', () => {
  const sim = mk();
  sim.state.coins = 1e6;
  sim.dispatch({ type: 'upgrade', id: layout.buildings[0].id });
  assert.equal(sim.state.charge, BALANCE.charge.perAction);
  sim.state.charge = 99.99;
  for (let i = 0; i < 60; i++) sim.tick();
  assert.equal(sim.state.charge, BALANCE.charge.max);
});

test('boost needs enough Charge, doubles coins for a minute, then ends by itself', () => {
  const sim = mk();
  sim.state.charge = BALANCE.charge.boostCost - 1;
  sim.dispatch({ type: 'boost' });
  assert.equal(sim.state.boostS, 0);
  sim.state.charge = BALANCE.charge.boostCost;
  const base = sim.rate();
  sim.dispatch({ type: 'boost' });
  assert.equal(sim.state.boostS, BALANCE.charge.boostS);
  assert.equal(sim.state.charge, 0);
  assert.ok(Math.abs(sim.rate() - base * BALANCE.charge.boostMult) < 0.2);
  for (let i = 0; i < BALANCE.charge.boostS; i++) sim.tick();
  assert.equal(sim.state.boostS, 0);
  assert.ok(Math.abs(sim.rate() - base) < 0.2);
});

test('goal progress survives a day change, and finishing a goal pays once and starts its slot over', () => {
  const sim = mk();
  sim.state.coins = 1e7;
  sim.state.goals.slots = [{ k: 'upgrade', p: 1 }, { k: 'paint', p: 0 }, { k: 'road', p: 0 }];
  sim.state.goals.day = '1999-01-01';
  const id = layout.buildings.find((b) => b.level < 5).id;
  sim.dispatch({ type: 'upgrade', id });
  sim.tick();
  assert.equal(sim.state.goals.slots[0].p, 2, 'progress is kept across the day change');
  assert.equal(sim.state.goals.day, dayKey(T0), 'the day is stamped on the tick');
  const before = sim.state.coins, cost = sim.cost(id), reward = goalDef('upgrade').reward.coins;
  sim.dispatch({ type: 'upgrade', id });
  assert.equal(sim.state.coins, before - cost + reward, 'pays the upgrade cost and the goal reward, once');
  assert.equal(sim.state.goals.doneToday, 1);
  assert.equal(sim.state.goals.slots[0].p, 0, 'the slot starts a new goal');
  const again = sim.state.coins;
  sim.tick();
  assert.ok(sim.state.coins - again < reward, 'the reward is not paid again on the next tick');
});

test('finishing all open goals in one day pays the daily bonus; a missed day resets the streak, not the coins', () => {
  const run = (bonusDay, streak) => {
    const sim = mk();
    sim.state.coins = 1e9;
    const id = layout.buildings.find((b) => b.level < 5).id;
    sim.state.goals.slots = [{ k: 'upgrade', p: 2 }, { k: 'upgrade', p: 2 }, { k: 'upgrade', p: 2 }];
    sim.state.goals.day = dayKey(T0); sim.state.goals.doneToday = 0; sim.state.goals.bonusDay = bonusDay; sim.state.goals.streak = streak;
    const parts = sim.state.parts, coins = sim.state.coins, cost = sim.cost(id);
    sim.dispatch({ type: 'upgrade', id });
    return { sim, parts, coins, cost };
  };
  const first = run('', 0);
  assert.equal(first.sim.state.goals.bonusDay, dayKey(T0));
  assert.equal(first.sim.state.goals.streak, 1);
  assert.equal(first.sim.state.parts, first.parts + BALANCE.goals.dailyBonus.parts);
  const second = run(yesterdayKey(T0), 4);
  assert.equal(second.sim.state.goals.streak, 5);
  assert.equal(second.sim.state.parts, second.parts + BALANCE.goals.dailyBonus.parts + BALANCE.goals.dailyBonus.perStreakDay * 4);
  const missed = run('2020-01-01', 6);
  assert.equal(missed.sim.state.goals.streak, 1, 'a missed day restarts the streak');
  assert.ok(missed.sim.state.coins > missed.coins - missed.cost, 'coins are never taken away');
});

test('milestones pay once each', () => {
  const sim = mk();
  sim.state.earned = 1500;
  const parts = sim.state.parts;
  sim.tick();
  const m = BALANCE.milestones.find((x) => x.id === 'coins-1k');
  assert.ok(sim.state.milestones.includes('coins-1k'));
  assert.ok(sim.state.parts >= parts + m.reward.parts);
  const after = sim.state.parts;
  sim.tick();
  assert.ok(sim.state.parts - after < m.reward.parts, 'the milestone pays only once');
  assert.equal(sim.state.milestones.filter((id) => id === 'coins-1k').length, 1);
});

test('points: floor of the cube root of coins this run over the divisor; +2% income each', () => {
  const d = BALANCE.renewal.divisor;
  assert.equal(pendingPoints(0), 0);
  assert.equal(pendingPoints(d * 0.99), 0);
  assert.equal(pendingPoints(d), 1);
  assert.equal(pendingPoints(d * 7.9), 1);
  assert.equal(pendingPoints(d * 8), 2);
  assert.equal(runNeededFor(0), d);
  assert.equal(runNeededFor(1), d * 8);
  assert.ok(Math.abs(pointsMult(3) - 1.06) < 1e-12);
});

test('Renewal is refused until this run has enough coins, and changes nothing when refused', () => {
  const sim = mk();
  const placed = sim.state.roads, coins = sim.state.coins;
  sim.dispatch({ type: 'renew' });
  assert.equal(sim.state.renewals, 0);
  assert.equal(sim.state.roads, placed);
  assert.equal(sim.state.coins, coins);
});

test('Renewal starts the town over and keeps points, unlocks, milestones, lifetime coins and settings', () => {
  const sim = mk();
  const s = sim.state;
  s.coins = 5e9; s.parts = 900; s.runEarned = BALANCE.renewal.divisor * 1.2; s.earned = 6e9; s.points = 2;
  s.roadUnlocks = ['bike']; s.milestones = ['coins-1k']; s.night = 1; s.speed = 2; s.stats.placed = 3;
  s.levels[layout.buildings[0].id] = 4; s.removed.push(layout.buildings[1].id);
  const roads = s.roads;
  sim.dispatch({ type: 'renew' });
  assert.equal(s.renewals, 1);
  assert.equal(s.points, 3);
  assert.equal(s.coins, START_COINS);
  assert.equal(s.parts, START_PARTS);
  assert.deepEqual(s.levels, {});
  assert.deepEqual(s.removed, []);
  assert.equal(s.runEarned, 0);
  assert.equal(s.earned, 6e9);
  assert.deepEqual(s.roadUnlocks, ['bike']);
  assert.deepEqual(s.milestones, ['coins-1k']);
  assert.equal(s.night, 1);
  assert.equal(s.speed, 2);
  assert.equal(s.stats.placed, 3);
  assert.notEqual(s.roads, roads);
  assert.ok(sim.grid.zone.every((z) => z === 0));
  assert.equal(sim.rate(), Math.round(coinRate(s, layout) * pointsMult(3) * 10) / 10);
  assert.equal(sim.state, s, 'the same state object is kept, so the rest of the app keeps its reference');
});

test('offline catch-up adds to lifetime and run coins, using the same closed form as the coins it pays', () => {
  const sim = mk({ now: () => T0 });
  sim.catchUp(T0 - 3600 * 1000);
  const o = sim.state.offline;
  assert.ok(o && o.coins > 0);
  assert.ok(Math.abs(sim.state.earned - o.coins) < 1e-6);
  assert.ok(Math.abs(sim.state.runEarned - o.coins) < 1e-6);
});

test('save sanitize: garbage in gives safe defaults, boosts never survive a load, milestones are unique', () => {
  const s = sanitize({ coins: 1, earned: 'x', charge: 999, boostS: 50, stats: null, goals: { slots: 'bad' }, milestones: ['nope', 'coins-1k', 'coins-1k'], points: -4, renewals: 1.5 });
  assert.equal(s.charge, BALANCE.charge.max);
  assert.equal(s.boostS, 0);
  assert.equal(s.earned, 0);
  assert.equal(s.points, 0);
  assert.equal(s.renewals, 0);
  assert.deepEqual(s.milestones, ['coins-1k']);
  assert.equal(s.goals.slots.length, BALANCE.goals.open);
  assert.ok(s.goals.slots.every((x) => goalDef(x.k)));
  assert.deepEqual(s.stats, { placed: 0, painted: 0, roadTiles: 0, upgrades: 0, boosts: 0 });
});

test('day keys use the local calendar; yesterday crosses a month boundary', () => {
  const d = new Date(2026, 2, 1, 9).getTime();
  assert.equal(dayKey(d), '2026-03-01');
  assert.equal(yesterdayKey(d), '2026-02-28');
});

test('Renewal pacing: 10 million coins this run is about five hours at 550 coins/s, the first point', () => {
  assert.equal(BALANCE.renewal.divisor, 1e7);
  const hours = BALANCE.renewal.divisor / 550 / 3600;
  assert.ok(hours > 4.5 && hours < 5.5, 'got ' + hours.toFixed(2) + ' h');
});
