// Building on hills: hillsides are buildable (only cliffs and mountain tops are not) and lots on a slope stand on a terrace.
import test from 'node:test';
import assert from 'node:assert/strict';
import { quietSim as createSim } from './support/quiet.js';
import { freshState } from '../src/sim/state.js';
import { BASE, CLIFF, GRID_N, tileIndex } from '../src/world/grid.js';
import { checkLot } from '../src/world/placement.js';
import { terraceOf, terracesOf, WALL_FROM } from '../src/render/systems/terraces.js';

const seeded = (seed = 1234567) => { const state = freshState(); state.terrainSeed = seed; state.coins = 1e7; return createSim({ state }); };

test('hillsides are buildable, cliffs are not', () => {
  const sim = seeded(), g = sim.grid;
  let hill = 0, cliffs = 0;
  for (let i = 0; i < g.base.length; i++) {
    const spread = g.thi[i] - g.tlo[i];
    if (g.base[i] === BASE.LAND && spread > 0.9) hill++;
    if (spread > CLIFF && g.base[i] !== BASE.WATER) { assert.equal(g.base[i], BASE.STEEP); cliffs++; }
  }
  assert.ok(hill > 100, `steep but buildable tiles (${hill})`);
  createSim({ state: freshState() });
});

test('a house placed on a steep hillside stands on a terrace with a wall down to the low side', () => {
  const sim = seeded(), g = sim.grid;
  let spot = null;
  for (let i = 0; i < g.base.length && !spot; i++) {
    const gx = i % GRID_N, gz = Math.floor(i / GRID_N);
    if (g.base[i] === BASE.LAND && g.thi[i] - g.tlo[i] > 1.5 && g.isOpen(gx, gz) && checkLot(g, gx, gz, 1, 1).ok) spot = [gx, gz];
  }
  assert.ok(spot, 'a steep open tile');
  sim.dispatch({ type: 'place', model: 'cottage', gx: spot[0], gz: spot[1], fw: 1, fd: 1, rot: 0 });
  const rec = sim.state.placed.find((r) => r.gx === spot[0] && r.gz === spot[1]);
  assert.ok(rec, 'placed on the hillside');
  const t = terraceOf(rec.gx, rec.gz, rec.fw, rec.fd);
  assert.ok(t && t.y - t.lo >= WALL_FROM, 'it gets a terrace');
  assert.ok(terracesOf(sim.state).some((x) => x.x === t.x && x.z === t.z));
  createSim({ state: freshState() });
});

test('level ground needs no terrace', () => {
  createSim({ state: freshState() });
  assert.equal(terraceOf(48 + 6, 48 + 4, 1, 1), null);
});
