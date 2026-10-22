import test from 'node:test';
import assert from 'node:assert/strict';
import { GRID_N, tileIndex } from '../src/world/grid.js';
import { EDGES, ZONES, buildNet, refreshCosts, solveField, newField, zoneOfTile } from '../src/sim/traffic.js';
import { Fleet, CAR, BUS, DRIVE, PARK, CAR_LEN, KIND, tileKinds, laneOf, laneOffset } from '../src/render/vehicle-agents.js';
import { busTours } from '../src/render/cars.js';

const key = (gx, gz) => tileIndex(gx, gz);
// a straight two-way street along row z, from x0 to x1 (inclusive)
const street = (z, x0, x1, t = 'two') => {
  const out = {};
  for (let x = x0; x <= x1; x++) out[key(x, z)] = { t };
  return out;
};
const merge = (...parts) => Object.assign({}, ...parts);

// A town of roads with origin and destination tiles. Each endpoint is the anchor of its own zone, and every ordered
// pair of endpoints is a trip, so the sim's gravity table is stood in for by unit weights.
function scenario(roads, endpoints) {
  const net = refreshCosts(buildNet(roads), new Float64Array(EDGES));
  const anchors = new Int32Array(ZONES).fill(-1);
  for (const u of endpoints) anchors[zoneOfTile(u % GRID_N, Math.floor(u / GRID_N))] = u;
  const fields = [];
  for (let j = 0; j < ZONES; j++) if (anchors[j] >= 0) fields[j] = solveField(net, anchors[j], newField());
  const total = new Float64Array(ZONES * ZONES);
  for (const a of endpoints) for (const b of endpoints) {
    if (a === b) continue;
    total[zoneOfTile(a % GRID_N, Math.floor(a / GRID_N)) * ZONES + zoneOfTile(b % GRID_N, Math.floor(b / GRID_N))] = 1;
  }
  return { roads, net, fields, anchors, total, version: 0, tours: [], carWant: 0, busWant: 0 };
}

const STEP = 1 / 30;
const drivers = (fleet) => fleet.agents.filter((a) => a.alive && a.state === DRIVE);

test('cars on one lane keep a gap: no two cars on a straight street ever overlap, across tiles too', () => {
  const env = scenario(street(10, 10, 30), [key(10, 10), key(30, 10)]);
  env.carWant = 25;
  const fleet = new Fleet(3);
  let peak = 0, seen = new Set();
  for (let s = 0; s < 4000; s++) {
    fleet.step(STEP, env);
    const cars = drivers(fleet).filter((a) => a.kind === CAR);
    peak = Math.max(peak, cars.length);
    cars.forEach((a) => seen.add(a.id));
    // each direction is its own lane. A car's place along the street is its column plus its progress when it drives
    // east, and minus its progress when it drives west (its progress runs towards smaller columns).
    for (const mv of [0, 2]) {
      const g = cars.filter((a) => a.mv === mv).map((a) => {
        const c = a.tile % GRID_N;
        return mv === 0 ? c + a.x : -(c - a.x);
      }).sort((p, q) => p - q);
      for (let i = 1; i < g.length; i++) assert.ok(g[i] - g[i - 1] >= CAR_LEN - 1e-6, `overlap at step ${s}: ${g[i - 1]} and ${g[i]}`);
    }
  }
  assert.ok(peak >= 5, 'the street fills up');
  assert.ok(seen.size > 10, 'cars keep coming in');
});

test('cars at a junction: one entry arm at a time, and cars on the same arm keep their gap', () => {
  const col = {};
  for (let z = 10; z <= 30; z++) col[key(20, z)] = { t: 'two' };
  const all = merge(street(20, 10, 30), col);
  const J = key(20, 20);
  const ends = [key(10, 20), key(30, 20), key(20, 10), key(20, 30)];
  const env = scenario(all, ends);
  env.carWant = 40;
  const fleet = new Fleet(11);
  const arms = new Set();
  for (let s = 0; s < 6000; s++) {
    fleet.step(STEP, env);
    const inside = drivers(fleet).filter((a) => a.tile === J);
    const mvs = new Set(inside.map((a) => a.mv));
    assert.ok(mvs.size <= 1, `two entry arms in the junction at step ${s}`);
    inside.forEach((a) => arms.add(a.mv));
    // gap on each lane, inside the junction tile
    for (const p of inside) for (const q of inside) {
      if (p === q || p.mv !== q.mv || p.lane !== q.lane) continue;
      assert.ok(Math.abs(p.x - q.x) >= CAR_LEN - 1e-6, `cars overlap in the junction at step ${s}`);
    }
  }
  assert.ok(arms.size >= 3, `cars came through from more than one arm (got ${arms.size})`);
});

test('a car drives its route to the zone anchor, parks, then shrinks away: nothing just vanishes', () => {
  const env = scenario(street(10, 10, 30), [key(10, 10), key(30, 10)]);
  env.carWant = 20;
  const fleet = new Fleet(5);
  for (let s = 0; s < 2000; s++) fleet.step(STEP, env);
  assert.ok(fleet.carCount() > 0);
  env.carWant = 0;
  let parkedAtDest = 0, wasAlive = new Map();
  for (let s = 0; s < 4000 && fleet.agents.some((a) => a.alive); s++) {
    for (const a of fleet.agents) {
      if (a.alive && a.state === PARK && wasAlive.get(a.id) === DRIVE) {
        // the trips run both ways, so a car parks at whichever end it was driving to
        assert.ok(a.tile === key(10, 10) || a.tile === key(30, 10), 'cars park at a zone anchor');
        parkedAtDest++;
      }
      if (!a.alive && wasAlive.get(a.id) !== undefined) assert.equal(wasAlive.get(a.id), PARK, 'a car leaves only after it has parked');
    }
    wasAlive = new Map(fleet.agents.map((a) => [a.id, a.alive ? a.state : undefined]));
    fleet.step(STEP, env);
  }
  assert.equal(fleet.agents.filter((a) => a.alive).length, 0, 'every car has gone once the demand stops');
  assert.ok(parkedAtDest > 5, 'the cars parked at the anchor');
});

test('the same seed and the same demand give the same traffic, step for step', () => {
  const env = scenario(street(10, 10, 30), [key(10, 10), key(30, 10)]);
  env.carWant = 15;
  const run = () => {
    const f = new Fleet(9);
    for (let s = 0; s < 600; s++) f.step(STEP, env);
    return JSON.stringify(f.agents.filter((a) => a.alive).map((a) => [a.id, a.tile, a.x, a.v, a.state, a.lane]));
  };
  assert.equal(run(), run());
});

test('buses drive their loop for ever and visit every stop of it', () => {
  const ring = merge(street(10, 10, 14, 'bus'), street(12, 10, 14, 'bus'),
    { [key(10, 11)]: { t: 'bus' }, [key(14, 11)]: { t: 'bus' } });
  const tours = busTours(ring);
  assert.equal(tours.length, 1);
  const env = scenario(ring, []);
  env.tours = tours;
  env.busWant = 1;
  const fleet = new Fleet(2);
  const visited = new Set();
  for (let s = 0; s < 3000; s++) {
    fleet.step(STEP, env);
    for (const a of fleet.agents) if (a.alive && a.kind === BUS && a.state === DRIVE) visited.add(a.tile);
  }
  assert.equal(fleet.busCount(), 1);
  assert.ok(visited.size >= Object.keys(ring).length, 'the bus reaches every stop');
});

test('tile kinds: a dead end, a straight, a bend and a junction are told apart', () => {
  const col = {};
  for (let z = 10; z <= 30; z++) col[key(20, z)] = { t: 'two' };
  const roads = merge(street(5, 0, 3), { [key(3, 6)]: { t: 'two' }, [key(3, 7)]: { t: 'two' } }, street(20, 10, 30), col);
  const net = refreshCosts(buildNet(roads), new Float64Array(EDGES));
  const kinds = tileKinds(net);
  assert.equal(kinds[key(0, 5)], KIND.END);
  assert.equal(kinds[key(1, 5)], KIND.STRAIGHT);
  assert.equal(kinds[key(3, 5)], KIND.BEND);
  assert.equal(kinds[key(15, 20)], KIND.STRAIGHT);
  assert.equal(kinds[key(20, 20)], KIND.JUNCTION);
});

test('lanes: a car takes the nearest lane a road has, and a two-lane road has two lanes apart', () => {
  const roads = { [key(1, 1)]: { t: 'two' }, [key(2, 1)]: { t: 'free' }, [key(3, 1)]: { t: 'one' } };
  assert.equal(laneOf(roads, key(1, 1), 1), 0);
  assert.equal(laneOf(roads, key(2, 1), 1), 1);
  assert.equal(laneOf(roads, key(2, 1), 0), 0);
  assert.notEqual(laneOffset(roads, key(2, 1), 0), laneOffset(roads, key(2, 1), 1));
  assert.notEqual(laneOffset(roads, key(3, 1), 0), laneOffset(roads, key(3, 1), 1));
});

test('the pool stays small: finished vehicles are reused, and the count is what the demand asks for', () => {
  const env = scenario(street(10, 10, 30), [key(10, 10), key(30, 10)]);
  env.carWant = 30;
  const fleet = new Fleet(4);
  for (let s = 0; s < 6000; s++) {
    fleet.step(STEP, env);
    assert.ok(fleet.carCount() <= 30);
  }
  assert.ok(fleet.agents.length <= 60, `pool grew to ${fleet.agents.length}`);
});
