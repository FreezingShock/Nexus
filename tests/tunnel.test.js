import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { getLayout } from '../src/world/layout.js';
import { GRID_N, BASE, createGrid, tileCenter, tileIndex } from '../src/world/grid.js';
import { heightAt } from '../src/world/terrain.js';
import { connMask, dirsOfMask, starterRoads } from '../src/world/roadnet.js';
import { TUNNEL_GATE, starterProtected } from '../src/world/starter.js';
import { EDGES, ZONES, buildNet, refreshCosts, solveField, newField, zoneOfTile } from '../src/sim/traffic.js';
import { Fleet, CAR, DRIVE } from '../src/render/vehicle-agents.js';
import { buildTownsfolk } from '../src/render/townsfolk.js';

const GATE = tileIndex(TUNNEL_GATE.gx, TUNNEL_GATE.gz);
const key = (gx, gz) => tileIndex(gx, gz);
const street = (z, x0, x1) => { const out = {}; for (let x = x0; x <= x1; x++) out[key(x, z)] = { t: 'two' }; return out; };

test('the stem ends at the tunnel gate: a dead end with the road behind it only', () => {
  const roads = starterRoads();
  assert.ok(roads[GATE], 'the gate is a road tile');
  assert.deepEqual(dirsOfMask(connMask(roads, TUNNEL_GATE.gx, TUNNEL_GATE.gz)), [2], 'only the road to the west');
});

test('the bridge and the road into the tunnel are protected, and they are water-bound where the river is', () => {
  const kept = starterProtected();
  assert.ok(kept.has(GATE));
  const g = createGrid(getLayout());
  const wet = [...kept].filter((i) => g.base[i] === BASE.WATER).length;
  assert.ok(wet >= 4, 'the bridge covers the river: ' + wet + ' water tiles');
  assert.equal(g.base[GATE], BASE.LAND, 'the gate stands on level ground');
});

test('the gate is level and the mountain rises behind it', () => {
  const [x, z] = tileCenter(TUNNEL_GATE.gx, TUNNEL_GATE.gz);
  assert.ok(Math.abs(heightAt(x, z)) < 0.2, 'gate height ' + heightAt(x, z));
  assert.ok(heightAt(x + 14, 0) > 12, 'the mountain behind the gate');
  assert.ok(heightAt(x + 14, 0) > heightAt(x, z) + 10);
});

test('bulldozing takes the rest of the stem and leaves the bridge and the tunnel road', () => {
  const sim = createSim({ state: freshState(), layout: getLayout() });
  sim.state.coins = 1e9;
  const tiles = [];
  for (let gx = 40; gx <= TUNNEL_GATE.gx; gx++) tiles.push([gx, TUNNEL_GATE.gz]);
  sim.dispatch({ type: 'bulldozeRoad', tiles });
  for (const [gx, gz] of tiles) {
    const kept = starterProtected().has(tileIndex(gx, gz));
    assert.equal(sim.grid.roadAt(gx, gz) !== 0, kept, `${gx},${gz}`);
  }
});

test('cars come out of the tunnel and drive into it: none stay on the gate once they have gone in', () => {
  // a straight stem from the village to the gate, with two zones at its ends so trips and routes exist
  const roads = street(TUNNEL_GATE.gz, 40, TUNNEL_GATE.gx);
  const endpoints = [key(40, TUNNEL_GATE.gz), key(50, TUNNEL_GATE.gz)];
  const net = refreshCosts(buildNet(roads), new Float64Array(EDGES));
  const anchors = new Int32Array(ZONES).fill(-1);
  for (const u of endpoints) anchors[zoneOfTile(u % GRID_N, Math.floor(u / GRID_N))] = u;
  const fields = [];
  for (let j = 0; j < ZONES; j++) if (anchors[j] >= 0) fields[j] = solveField(net, anchors[j], newField());
  const total = new Float64Array(ZONES * ZONES);
  total[zoneOfTile(endpoints[0] % GRID_N, Math.floor(endpoints[0] / GRID_N)) * ZONES + zoneOfTile(endpoints[1] % GRID_N, Math.floor(endpoints[1] / GRID_N))] = 1;
  const env = { roads, net, fields, anchors, total, version: 0, tours: [], carWant: 12, busWant: 0 };
  const fleet = new Fleet(7);
  let entered = 0, left = 0;
  for (let s = 0; s < 6000; s++) {
    fleet.step(1 / 30, env);
    for (const a of fleet.agents) {
      if (!a.alive || a.state !== DRIVE || a.kind !== CAR) continue;
      if (a.exit) left++;
      if (a.tile === GATE && a.mv === 2 && a.x < 0.6 && !a.exit) entered++;
      assert.ok(!(a.exit && a.tile === GATE && a.x >= 0.6), 'an exiting car is gone once it reaches the gate');
    }
  }
  assert.ok(entered > 0, 'cars come out of the tunnel');
  assert.ok(left > 0, 'cars leave for the tunnel');
});

test('townsfolk come out of the tunnel and walk in, and the crowd keeps going', () => {
  const grid = createGrid(getLayout());
  const roads = starterRoads();
  const camera = { view: { half: 200, zoom: 1, tx: 0, tz: 0 } };
  const town = buildTownsfolk(new THREE.Group(), grid, camera);
  for (let f = 0; f < 3000; f++) town.update(0.1, roads);
  assert.ok(town.count() > 0, 'walkers on the streets');
});
