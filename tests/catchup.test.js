import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { getLayout } from '../src/world/layout.js';
import { PARTS_RATE } from '../src/sim/economy.js';
import { CAP_S, offlineWindow } from '../src/sim/offline.js';

const layout = getLayout();
const H = 3600, NOW = 1e12;
const at = (secondsAgo) => NOW - secondsAgo * 1000;

test('no usable save time means no catch-up at all (never the epoch, never 24 hours)', () => {
  const sim = createSim({ layout, now: () => NOW });
  const c = sim.state.coins;
  assert.equal(sim.catchUp(null), null);
  assert.equal(sim.catchUp(undefined), null);
  assert.equal(sim.state.coins, c);
  assert.equal(sim.state.offline, null);
});

test('a save time in the future (clock moved back) earns nothing and is not penalised', () => {
  const sim = createSim({ layout, now: () => NOW });
  const c = sim.state.coins;
  assert.equal(sim.catchUp(NOW + 3600 * 1000), null);
  assert.equal(sim.state.coins, c);
});

test('a clock jump of years is capped at 24 hours of income', () => {
  const sim = createSim({ layout, now: () => NOW });
  const o = sim.catchUp(at(365 * 24 * H));
  assert.equal(o.awayS, CAP_S);
  assert.equal(o.fullS, offlineWindow(CAP_S).fullS);
});

test('the postcard numbers are the closed-form numbers at the current rate', () => {
  const sim = createSim({ layout, now: () => NOW });
  const rate = sim.rate();
  const o = sim.catchUp(at(10 * H));
  const eff = offlineWindow(10 * H).effectiveS;
  assert.ok(Math.abs(o.coins - rate * eff) < 1e-6);
  assert.ok(Math.abs(o.parts - PARTS_RATE * eff) < 1e-6);
  assert.equal(o.fullS, 4 * H);
  assert.equal(o.awayS, 10 * H);
});

test('short absences pay straight into the town and leave no postcard', () => {
  const sim = createSim({ layout, now: () => NOW });
  const c = sim.state.coins, p = sim.state.parts, rate = sim.rate();
  assert.equal(sim.catchUp(at(120)), null);
  assert.equal(sim.state.coins, c + rate * 120);
  assert.ok(Math.abs(sim.state.parts - (p + PARTS_RATE * 120)) < 1e-9);
});

test('a second long absence adds to an unclaimed postcard instead of replacing it', () => {
  const sim = createSim({ layout, now: () => NOW });
  const rate = sim.rate();
  const a = sim.catchUp(at(5 * H));
  const b = sim.catchUp(at(3 * H));
  assert.ok(Math.abs(b.coins - (a.coins + rate * offlineWindow(3 * H).effectiveS)) < 1e-6);
  assert.equal(b.awayS, 8 * H);
});

test('catch-up is closed form: a full day loads in one evaluation, not a loop of ticks', () => {
  const sim = createSim({ layout, now: () => NOW });
  const ticks = sim.ticks;
  sim.catchUp(at(CAP_S));
  assert.equal(sim.ticks, ticks, 'no ticks were run to catch up');
});
