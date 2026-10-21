import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { getLayout } from '../src/world/layout.js';
import { coinRate, BASE_RATE } from '../src/sim/economy.js';

const layout = getLayout();

test('layout is deterministic and complete', () => {
  assert.equal(layout.buildings.length, 51);
  assert.equal(layout.cars.length, 22);
  assert.equal(layout.segs.length, 41);
  assert.equal(new Set(layout.buildings.map((b) => b.id)).size, 51);
});

test('one tick adds the rate; game speed means more ticks, not bigger steps', () => {
  const sim = createSim({ layout });
  const c0 = sim.state.coins;
  const run = (seconds) => { for (let i = 0; i < seconds * 4; i++) sim.advance(0.25); }; // frames are capped at 0.25 s
  run(0.75); assert.equal(sim.state.coins, c0);
  run(0.25); assert.equal(sim.state.coins, c0 + BASE_RATE);
  sim.dispatch({ type: 'cycleSpeed' });
  const c1 = sim.state.coins;
  run(1); assert.equal(sim.state.coins, c1 + 2 * BASE_RATE);
});

test('paused sim does not advance', () => {
  const sim = createSim({ layout });
  sim.dispatch({ type: 'togglePause' });
  const c = sim.state.coins; for (let i = 0; i < 40; i++) sim.advance(0.25);
  assert.equal(sim.state.coins, c);
});

test('upgrade spends coins, raises the rate; bulldoze lowers it again', () => {
  const sim = createSim({ layout });
  const id = layout.buildings[0].id;
  sim.state.coins = 1e6;
  const cost = sim.cost(id), before = sim.state.coins;
  sim.dispatch({ type: 'upgrade', id });
  assert.equal(sim.state.coins, before - cost);
  assert.ok(sim.rate() > BASE_RATE);
  sim.dispatch({ type: 'bulldoze', id });
  assert.equal(sim.rate(), BASE_RATE);
  sim.dispatch({ type: 'upgrade', id }); // gone: no-op
  assert.equal(sim.state.levels[id], layout.buildings[0].level + 1);
});

test('cannot upgrade without coins, or past the top level', () => {
  const sim = createSim({ layout });
  const id = layout.buildings[0].id;
  sim.state.coins = 0;
  sim.dispatch({ type: 'upgrade', id });
  assert.equal(sim.state.levels[id], undefined);
  sim.state.coins = 1e12;
  for (let i = 0; i < 20; i++) sim.dispatch({ type: 'upgrade', id });
  assert.equal(sim.state.levels[id], 5);
});

test('ring road is built once and charged once', () => {
  const sim = createSim({ layout });
  sim.state.coins = 1000;
  sim.dispatch({ type: 'buildRoad', roadType: 'two' });
  sim.dispatch({ type: 'buildRoad', roadType: 'two' });
  assert.equal(sim.state.coins, 1000 - 240);
  sim.dispatch({ type: 'buildRoad', roadType: 'bus' }); // locked
  assert.equal(sim.state.coins, 760);
});

test('catch-up: short absences apply silently, long ones become a postcard, collect pays once', () => {
  const sim = createSim({ layout, now: () => 1e12 });
  const c0 = sim.state.coins;
  assert.equal(sim.catchUp(1e12 - 60 * 1000), null);
  assert.equal(sim.state.coins, c0 + 60 * BASE_RATE);
  const o = sim.catchUp(1e12 - 6 * 3600 * 1000);
  assert.ok(o && o.coins > 0 && o.awayS === 6 * 3600);
  const before = sim.state.coins;
  sim.dispatch({ type: 'collectOffline' });
  assert.equal(sim.state.coins, before + o.coins);
  assert.equal(sim.state.offline, null);
  sim.dispatch({ type: 'collectOffline' });
  assert.equal(sim.state.coins, before + o.coins);
});

test('rate is derived from levels only', () => {
  const s = freshState();
  assert.equal(coinRate(s, layout), BASE_RATE);
});

test('a tick stays far under the 2 ms budget', () => {
  const sim = createSim({ layout });
  // One GC pause on a busy CI runner can add a couple of ms to a single tick, so the budget is checked on the
  // 99th percentile, with a looser cap on the worst tick to still catch a tick that is really slow.
  const times = [];
  for (let i = 0; i < 2000; i++) { sim.tick(); times.push(sim.lastTickMs); }
  times.sort((a, b) => a - b);
  const p99 = times[Math.floor(times.length * 0.99)], worst = times[times.length - 1];
  assert.ok(p99 < 2, 'p99 tick ' + p99 + ' ms');
  assert.ok(worst < 10, 'worst tick ' + worst + ' ms');
});

test('a system can add state, rate, tick and command hooks (registry contract)', async () => {
  const { systems } = await import('../src/sim/systems/index.js');
  const { freshState } = await import('../src/sim/state.js');
  const { sanitize } = await import('../src/sim/save.js');
  const probe = {
    id: 'probe',
    state: () => ({ probe: 0 }),
    sanitize: (raw) => ({ probe: Number.isFinite(raw.probe) ? raw.probe : 0 }),
    rate: () => 5,
    tick: ({ state }) => { state.probe++; },
    commands: { probeBump({ state }) { state.probe += 10; } },
  };
  systems.push(probe);
  try {
    const sim = createSim({ layout, state: freshState() });
    assert.equal(sim.rate(), BASE_RATE + 5);
    sim.tick(); sim.dispatch({ type: 'probeBump' });
    assert.equal(sim.state.probe, 11);
    assert.equal(sanitize({ probe: 7 }).probe, 7);
    assert.equal(sanitize({}).probe, 0);
  } finally { systems.pop(); }
});
