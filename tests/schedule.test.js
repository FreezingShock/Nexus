import test from 'node:test';
import assert from 'node:assert/strict';
import { unit, driveWindows, walkWindow, isDriving, isWalking, drivingNow, walkingNow, carTripsPerPerson } from '../src/sim/schedule.js';
import { ROUTINE } from '../src/sim/population-config.js';
import { createSim } from '../src/sim/sim.js';
import { Fleet, CAR } from '../src/render/vehicle-agents.js';

const N = 2000;
const hours = Array.from({ length: 96 }, (_, k) => k / 4);

test('schedules are pure: the same person at the same hour is always doing the same thing', () => {
  for (const i of [0, 1, 7, 99, 1500]) {
    assert.deepEqual(driveWindows(i), driveWindows(i));
    assert.deepEqual(walkWindow(i), walkWindow(i));
    for (const h of [3, 8.2, 12, 17.4]) assert.equal(isDriving(i, h), isDriving(i, h));
  }
  const u = Array.from({ length: 1000 }, (_, i) => unit(i, 1));
  assert.ok(u.every((x) => x >= 0 && x < 1));
  assert.ok(Math.abs(u.reduce((a, b) => a + b) / u.length - 0.5) < 0.05, 'the hash is spread evenly');
});

test('about the chosen share of residents drive, and each has their own times', () => {
  let drivers = 0;
  const starts = new Set();
  for (let i = 0; i < N; i++) { const w = driveWindows(i); if (w.length) { drivers++; starts.add(Math.round(w[0][0] * 100)); } }
  assert.ok(Math.abs(drivers / N - ROUTINE.driveShare) < 0.04);
  assert.ok(starts.size > 50, 'people leave at many different times, not all together');
});

test('the car count is a realistic fraction of the population, peaking at rush hours', () => {
  const buf = new Int32Array(N);
  const at = (h) => drivingNow(N, h, buf) / N;
  const peak = Math.max(...hours.map(at));
  assert.ok(peak < 0.2, `at most a fifth of residents are on the road at once (got ${peak})`);
  assert.ok(peak > 0.06, 'rush hour is visibly busier');
  assert.equal(at(3), 0, 'nobody drives at 3 am');
  assert.ok(at(8) > at(11) && at(17.2) > at(13), 'the rush hours beat the middle of the day');
});

test('walkers have their own windows, and nobody walks while driving', () => {
  const buf = new Int32Array(N);
  let walkers = 0;
  for (let i = 0; i < N; i++) if (walkWindow(i)) walkers++;
  assert.ok(Math.abs(walkers / N - ROUTINE.walkShare) < 0.04);
  assert.equal(walkingNow(N, 2, buf), 0, 'the streets are empty of walkers at night');
  assert.ok(walkingNow(N, 16.5, buf) > 0);
  for (const h of hours) for (let i = 0; i < 300; i++) assert.ok(!(isDriving(i, h) && isWalking(i, h)));
});

test('trips per person follow the routines', () => {
  let trips = 0;
  for (let i = 0; i < N; i++) trips += driveWindows(i).length;
  assert.ok(Math.abs(trips / N - carTripsPerPerson()) < 0.1);
});

test('sim traffic scales with the population: more people, more trips, same roads', () => {
  const sum = (sim) => { const m = sim.traffic; let t = 0; for (let k = 0; k < m.total.length; k++) t += m.total[k]; return t; };
  const run = (pop) => { const sim = createSim(); sim.state.pop = pop; for (let i = 0; i < 80; i++) { sim.state.pop = pop; sim.tick(); } return sum(sim); };
  const small = run(8), big = run(32);
  assert.ok(small > 0 && big > small * 3.5, `trips follow population (${small} vs ${big})`);
});

test('the fleet gives each car to a resident who is out driving, once, and keeps their car', () => {
  const persons = Int32Array.from([5, 9, 12]);
  const fleet = new Fleet(1);
  assert.equal(fleet.pickPerson({ persons: new Int32Array(0), personN: 0 }), null, 'nobody out, no car');
  const seen = new Set();
  for (let k = 0; k < 3; k++) {
    const id = fleet.pickPerson({ persons, personN: 3 });
    assert.ok(persons.includes(id));
    assert.ok(!seen.has(id));
    seen.add(id);
    const a = fleet.slot(CAR); a.person = id; a.kind = CAR;
  }
  assert.equal(fleet.pickPerson({ persons, personN: 3 }), null, 'everyone out is already in a car');
  assert.equal(fleet.pickPerson({}), -1, 'bare scenarios still spawn');
});
