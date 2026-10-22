import test from 'node:test';
import assert from 'node:assert/strict';
import { quietSim as createSim } from './support/quiet.js';
import { freshState } from '../src/sim/state.js';
import { getLayout } from '../src/world/layout.js';
import { BASE_RATE } from '../src/sim/economy.js';
import { STARTER_COUNT } from '../src/world/starter.js';

const layout = getLayout();

test('layout is deterministic and holds only the scenery; the village is placed records', () => {
  assert.equal(getLayout(), layout);
  assert.equal(layout.farms, undefined, 'farms are built by the player, not spawned');
  assert.equal(layout.turbines.length, 2);
  assert.ok(layout.trees.length > 20 && layout.pines.length > 50);
  assert.equal(freshState().placed.length, STARTER_COUNT);
});

test('one tick adds the rate; game speed means more ticks, not bigger steps', () => {
  const sim = createSim({ layout });
  const c0 = sim.state.coins, rate = sim.rate();
  const run = (seconds) => { for (let i = 0; i < seconds * 4; i++) sim.advance(0.25); }; // frames are capped at 0.25 s
  run(0.75); assert.equal(sim.state.coins, c0);
  run(0.25); assert.equal(sim.state.coins, c0 + rate);
  sim.dispatch({ type: 'cycleSpeed' });
  const c1 = sim.state.coins;
  run(1); assert.equal(sim.state.coins, c1 + 2 * rate);
});

test('paused sim does not advance', () => {
  const sim = createSim({ layout });
  sim.dispatch({ type: 'togglePause' });
  const c = sim.state.coins; for (let i = 0; i < 40; i++) sim.advance(0.25);
  assert.equal(sim.state.coins, c);
});

test('upgrade spends coins, raises the rate; bulldoze lowers it again', () => {
  const sim = createSim({ layout });
  const id = 'b1000'; // the starter terrace, on the north side of the main street
  sim.state.coins = 1e6;
  const rate0 = sim.rate();
  const cost = sim.cost(id), before = sim.state.coins;
  sim.dispatch({ type: 'upgrade', id });
  assert.equal(sim.state.coins, before - cost);
  assert.ok(sim.rate() > rate0);
  sim.dispatch({ type: 'bulldoze', id });
  assert.ok(sim.rate() <= rate0 + 1e-9, 'bulldozing the house takes its extra income away');
  sim.dispatch({ type: 'upgrade', id }); // gone: no-op
  assert.equal(sim.state.levels[id], 2);
});

test('cannot upgrade without coins, or past the top level', () => {
  const sim = createSim({ layout });
  const id = 'b1000';
  sim.state.coins = 0;
  sim.dispatch({ type: 'upgrade', id });
  assert.equal(sim.state.levels[id], undefined);
  sim.state.coins = 1e12;
  for (let i = 0; i < 20; i++) sim.dispatch({ type: 'upgrade', id });
  assert.equal(sim.state.levels[id], 5);
});

test('catch-up: short absences apply silently, long ones become a postcard, collect pays once', () => {
  const sim = createSim({ layout, now: () => 1e12 });
  const c0 = sim.state.coins, rate = sim.rate();
  assert.equal(sim.catchUp(1e12 - 60 * 1000), null);
  assert.equal(sim.state.coins, c0 + 60 * rate);
  const o = sim.catchUp(1e12 - 6 * 3600 * 1000);
  assert.ok(o && o.coins > 0 && o.awayS === 6 * 3600);
  const before = sim.state.coins;
  sim.dispatch({ type: 'collectOffline' });
  assert.equal(sim.state.coins, before + o.coins);
  assert.equal(sim.state.offline, null);
  sim.dispatch({ type: 'collectOffline' });
  assert.equal(sim.state.coins, before + o.coins);
});

test('rate is derived from the base, the village and its services, never stored', () => {
  const sim = createSim({ state: freshState(), layout });
  const s = sim.services.summary();
  assert.ok(Math.abs(sim.rate() - (BASE_RATE + s.moodCoins + s.landmarkCoins - s.upkeep)) < 0.11);
});

test('a tick stays far under the 2 ms budget', () => {
  // A loaded CI runner can stall one batch, so each batch reports its median tick and the test takes the median of
  // five batches. A tick that is really slow (a regression) raises every batch, so it still fails here.
  const batchMedians = [];
  for (let b = 0; b < 5; b++) {
    const sim = createSim({ layout });
    const times = [];
    for (let i = 0; i < 400; i++) { sim.tick(); times.push(sim.lastTickMs); }
    times.sort((x, y) => x - y);
    batchMedians.push(times[times.length >> 1]);
  }
  batchMedians.sort((x, y) => x - y);
  const median = batchMedians[2];
  assert.ok(median < 2, 'median tick ' + median.toFixed(3) + ' ms (budget 2 ms), batches ' + batchMedians.map((t) => t.toFixed(3)).join(', '));
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
  const plain = createSim({ layout, state: freshState() }).rate();
  systems.push(probe);
  try {
    const sim = createSim({ layout, state: freshState() });
    assert.equal(sim.rate(), plain + 5);
    sim.tick(); sim.dispatch({ type: 'probeBump' });
    assert.equal(sim.state.probe, 11);
    assert.equal(sanitize({ probe: 7 }).probe, 7);
    assert.equal(sanitize({}).probe, 0);
  } finally { systems.pop(); }
});
