// Seeded land: same seed, same ground; the centre is flat; the edge is always mountains; the river, bridge, tunnel and
// starter village work on any seed; old saves keep the old land; Renewal rolls new land. See docs/TERRAIN.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { getLayout } from '../src/world/layout.js';
import { heightAt, setTerrainSeed, terrainSeed, riverX, newSeed } from '../src/world/terrain.js';
import { BASE, GRID_N, GRID_HALF, createGrid, tileCenter, tileIndex } from '../src/world/grid.js';
import { starterPlaced, starterStreetTiles, TUNNEL_GATE } from '../src/world/starter.js';
import { roadBlock } from '../src/world/roadnet.js';
import { lotTiles } from '../src/world/placement.js';
import { sanitize, unwrap, wrap } from '../src/sim/save.js';

const SEEDS = Array.from({ length: 48 }, (_, i) => 1 + i * 40503 + (i % 7) * 977);
const withSeed = (seed, fn) => { setTerrainSeed(seed); try { return fn(); } finally { setTerrainSeed(0); } };
const grid = (seed) => withSeed(seed, () => { const g = createGrid(getLayout()); return g; });

test('seed 0 is the original land, to the last digit', () => {
  setTerrainSeed(0);
  const want = { '0,0': 0, '30,10': 0, '-60,40': 4.6799, '80,5': 29.9739, '100,-100': 16.1186, '52,0': -0.9394, '120,20': 28.1475 };
  for (const [k, v] of Object.entries(want)) {
    const [x, z] = k.split(',').map(Number);
    assert.ok(Math.abs(heightAt(x, z) - v) < 1e-4, k + ' ' + heightAt(x, z));
  }
});

test('a seed gives the same land every time, and different seeds give different land', () => {
  const sample = (s) => withSeed(s, () => [[-60, 30], [-90, -70], [20, 90], [-40, -100], [10, -60]].map(([x, z]) => heightAt(x, z).toFixed(4)).join());
  assert.equal(sample(1234), sample(1234));
  const all = new Set(SEEDS.map(sample));
  assert.ok(all.size >= SEEDS.length - 1, 'land differs seed to seed: ' + all.size);
});

test('on every seed the centre is flat, the edge is mountains and the rest has real shape', () => {
  for (const s of SEEDS) withSeed(s, () => {
    for (let a = 0; a < 16; a++) for (const r of [0, 20, 36]) {
      const x = Math.cos(a / 16 * 2 * Math.PI) * r, z = Math.sin(a / 16 * 2 * Math.PI) * r;
      if (Math.abs(x - riverX(z)) < 8) continue;
      assert.ok(Math.abs(heightAt(x, z)) < 0.25, `seed ${s}: centre (${x | 0},${z | 0}) is ${heightAt(x, z)}`);
    }
    const g = createGrid(getLayout());
    const E = 5; // the outer five rows and columns
    for (let gz = 0; gz < GRID_N; gz++) for (let gx = 0; gx < GRID_N; gx++) {
      if (gx >= E && gz >= E && gx < GRID_N - E && gz < GRID_N - E) continue;
      assert.notEqual(g.base[tileIndex(gx, gz)], BASE.LAND, `seed ${s}: tile ${gx},${gz} at the edge is buildable`);
    }
    for (let gx = 0; gx < GRID_N; gx++) {
      const [cx] = tileCenter(gx, 0);
      assert.ok(heightAt(cx, -GRID_HALF * 3 + 1) > 12 || Math.abs(cx - riverX(-143)) < 8, `seed ${s}: the north edge climbs at ${gx}`);
    }
    let land = 0, high = 0, wet = 0;
    for (let i = 0; i < g.base.length; i++) { if (g.base[i] === BASE.LAND) { land++; if (g.thi[i] > 2.5) high++; } else if (g.base[i] === BASE.WATER) wet++; }
    assert.ok(land > 1700 && land < 6500, `seed ${s}: ${land} buildable tiles`);
    assert.ok(high > 40, `seed ${s}: ${high} buildable tiles up on plateaus and hills`);
  });
});

test('buildable means gentle: every buildable tile is within the slope rule, whatever its height', () => {
  for (const s of SEEDS.slice(0, 12)) {
    const g = grid(s);
    for (let i = 0; i < g.base.length; i++) if (g.base[i] === BASE.LAND) assert.ok(g.thi[i] - g.tlo[i] <= 0.9 + 1e-9 && g.thi[i] <= 26);
    let roadable = 0, plateau = 0;
    withSeed(s, () => {
      for (let gz = 0; gz < GRID_N; gz++) for (let gx = 0; gx < GRID_N; gx++) {
        if (g.base[tileIndex(gx, gz)] !== BASE.LAND) continue;
        if (roadBlock(g, null, null, gx, gz) === null) { roadable++; if (g.thi[tileIndex(gx, gz)] > 2.5) plateau++; }
      }
    });
    assert.ok(roadable > 1200, `seed ${s}: ${roadable} roadable tiles`);
    assert.ok(plateau > 20, `seed ${s}: roads reach the high ground (${plateau})`);
  }
});

test('the river, the bridge, the tunnel and the starter village work on every seed', () => {
  for (const s of SEEDS) withSeed(s, () => {
    const state = freshState(); state.terrainSeed = s;
    const sim = createSim({ state });
    const g = sim.grid;
    assert.equal(terrainSeed(), s);
    for (const [gx, gz] of starterStreetTiles()) {
      const b = g.base[tileIndex(gx, gz)];
      assert.ok(b === BASE.LAND || b === BASE.WATER, `seed ${s}: street tile ${gx},${gz} is ${b}`);
    }
    for (const r of state.placed.filter((p) => p.starter)) for (const [x, z] of lotTiles(r.gx, r.gz, r.fw, r.fd)) assert.equal(g.base[tileIndex(x, z)], BASE.LAND, `seed ${s}: ${r.model} stands on bad ground`);
    assert.equal(state.placed.filter((p) => p.starter).length, starterPlaced().length);
    assert.equal(g.base[tileIndex(TUNNEL_GATE.gx, TUNNEL_GATE.gz)], BASE.LAND, 'the gate is on land');
    const [gx0, gz0] = tileCenter(TUNNEL_GATE.gx, TUNNEL_GATE.gz);
    assert.ok(Math.abs(heightAt(gx0, gz0)) < 0.2 && heightAt(gx0 + 14, 0) > 12, 'the tunnel mountain stands behind the gate');
    // the road corridor east of the village is level and dry except for the river
    for (let x = 6; x < 70; x += 3) {
      if (Math.abs(x - riverX(0)) < 7) continue;
      assert.ok(Math.abs(heightAt(x, 0)) < 0.3, `seed ${s}: the road at x=${x} is ${heightAt(x, 0)}`);
    }
    let wet = 0; for (let gz = 40; gz < 56; gz++) if (g.base[tileIndex(GRID_HALF + 17, gz)] === BASE.WATER) wet++;
    assert.ok(wet >= 8, 'the river runs where it always did: ' + wet);
  });
});

test('the east bank, the river and the tunnel mountain are the same on every seed', () => {
  const at = (s) => withSeed(s, () => [[60, 10], [65, -20], [90, 0], [80, 40], [riverX(30), 30]].map(([x, z]) => heightAt(x, z).toFixed(3)).join());
  assert.equal(at(11), at(2222));
  assert.equal(at(11), at(31337));
});

test('the scenery follows the land: trees and masts stand on dry ground, off the village', () => {
  for (const s of SEEDS.slice(0, 16)) withSeed(s, () => {
    const lay = getLayout();
    assert.equal(lay.turbines.length, 2, `seed ${s}: two masts`);
    for (const t of lay.turbines) assert.ok(heightAt(t.x, t.z) > 0 && t.x < riverX(t.z), 'a mast on dry ground');
    for (const t of lay.trees) assert.ok(heightAt(t.x, t.z) > -0.2, `seed ${s}: a tree in the water`);
    assert.ok(lay.trees.length > 25, 'there are trees: ' + lay.trees.length);
  });
});

test('a save without a seed is an old town and keeps the old land; a seed in a save is kept', () => {
  const f = freshState();
  const old = { ...f }; delete old.terrainSeed;
  assert.equal(sanitize(old).terrainSeed, 0);
  assert.equal(sanitize({ ...f, terrainSeed: 98765 }).terrainSeed, 98765);
  assert.equal(sanitize({ ...f, terrainSeed: -3 }).terrainSeed, 0);
  assert.equal(sanitize({ ...f, terrainSeed: 'x' }).terrainSeed, 0);
  const r = unwrap(JSON.stringify(wrap({ ...f, terrainSeed: 424242 }, 1)));
  assert.equal(r.state.terrainSeed, 424242);
});

test('a new village rolls a seed; Renewal rolls a new one and the ground follows', () => {
  const pinned = globalThis.NEXUS_TERRAIN_SEED;
  globalThis.NEXUS_TERRAIN_SEED = undefined;
  try {
    const a = freshState(), b = freshState();
    assert.ok(a.terrainSeed > 0 && a.terrainSeed !== b.terrainSeed, 'seeds are rolled');
    assert.equal(typeof newSeed(), 'number');
    const sim = createSim({ state: a });
    const before = Array.from(sim.grid.base), was = a.terrainSeed;
    sim.state.coins = 1e9; sim.state.runEarned = 1e7 * 1.5;
    sim.dispatch({ type: 'renew' });
    assert.equal(sim.state.renewals, 1);
    assert.notEqual(sim.state.terrainSeed, was);
    assert.equal(terrainSeed(), sim.state.terrainSeed);
    assert.notDeepEqual(Array.from(sim.grid.base), before, 'the grid read the new land');
    assert.ok(sim.state.placed.some((p) => p.starter), 'the starter village is back');
  } finally { globalThis.NEXUS_TERRAIN_SEED = pinned; setTerrainSeed(0); }
});

test('no notch in the mountain wall: the river and the valley road end in foothills, and the mountains go on past the edge', () => {
  for (const s of SEEDS.slice(0, 16)) withSeed(s, () => {
    for (const z of [-150, -140, 140, 150]) assert.ok(heightAt(riverX(z), z) > 14, `seed ${s}: the river cuts the wall at z=${z}`);
    for (const x of [150, 160]) assert.ok(heightAt(x, 0) > 25, `seed ${s}: the road corridor cuts the wall at x=${x}`);
    for (const [x, z] of [[-200, 0], [0, 220], [-300, -300], [260, 130], [0, -400]]) assert.ok(heightAt(x, z) > 20, `seed ${s}: mountains at ${x},${z}: ${heightAt(x, z)}`);
  });
});
