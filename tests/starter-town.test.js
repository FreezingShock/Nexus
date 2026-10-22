// The starter town: placed records and street tiles that the player can edit like their own, the save reset that
// replaces the old town (settings kept, old town in the backup slot), and Renewal. See docs/STARTER-TOWN.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { getLayout } from '../src/world/layout.js';
import { starterPlaced, starterStreetTiles, starterReserved, STARTER_COUNT } from '../src/world/starter.js';
import { BASE, GRID_HALF, tileIndex } from '../src/world/grid.js';
import { LOT_BASE, frontRoadCount, lotTiles } from '../src/world/placement.js';
import { areaCost, modelById } from '../src/world/models.js';
import { buildCost, START_COINS } from '../src/sim/economy.js';
import { BALANCE } from '../src/sim/balance.js';
import { zoneDemand } from '../src/sim/traffic.js';
import { BACKUP_KEY, SAVE_KEY, SAVE_VERSION, backupInfo, loadGame, restoreBackup, wrap } from '../src/sim/save.js';

const layout = getLayout();
const mk = (state = freshState()) => { state.coins = 1e9; return createSim({ state, layout }); };
const mine = (sim) => sim.state.placed.filter((r) => !r.starter);
const starters = (sim) => sim.state.placed.filter((r) => r.starter);
const tilesOf = (r) => lotTiles(r.gx, r.gz, r.fw, r.fd);

// An in-memory stand-in for localStorage.
function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('the starter village is ten records on catalog models, each facing a street', () => {
  const sim = mk();
  const recs = starterPlaced();
  assert.equal(recs.length, STARTER_COUNT);
  assert.equal(new Set(recs.map((r) => r.id)).size, STARTER_COUNT, 'ids are unique');
  assert.deepEqual(recs.map((r) => r.id), recs.map((_, i) => 'b' + (1000 + i)));
  for (const r of recs) {
    assert.ok(modelById(r.model), r.id);
    assert.ok(r.starter === true);
    if (r.model !== 'green') assert.ok(frontRoadCount(sim.grid, r.gx, r.gz, r.fw, r.fd, r.rot) >= 1, r.id + ' has no street at its front');
    for (const [x, z] of tilesOf(r)) assert.equal(sim.grid.baseAt(x, z), BASE.LAND, r.id + ' is on plain ground');
  }
});

test('the village leaves open land to grow into around its square', () => {
  const sim = mk();
  const reserved = starterReserved();
  let open = 0;
  for (let gz = GRID_HALF - 12; gz <= GRID_HALF + 12; gz++) for (let gx = GRID_HALF - 12; gx <= GRID_HALF + 12; gx++) {
    if (!reserved.has(tileIndex(gx, gz)) && sim.grid.isOpen(gx, gz)) open++;
  }
  assert.ok(open >= 150, 'open tiles near the square: ' + open);
});

test('while a starter building stands its tiles are built; bulldozing frees them for zoning', () => {
  const sim = mk();
  for (const r of starterPlaced()) {
    for (const [x, z] of tilesOf(r)) assert.ok(sim.grid.lotAt(x, z) >= LOT_BASE, r.id + ' is stamped on the lot layer');
  }
  const r = starterPlaced().find((x) => x.model === 'terrace');
  sim.dispatch({ type: 'bulldoze', id: r.id });
  for (const [x, z] of tilesOf(r)) {
    assert.equal(sim.grid.lotAt(x, z), 0, 'the lot is free');
    assert.ok(sim.grid.isOpen(x, z), 'and open ground');
  }
  const [x0, z0] = tilesOf(r)[0], [x1, z1] = tilesOf(r).at(-1);
  sim.dispatch({ type: 'paintZone', zone: 1, a: [x0, z0], b: [x1, z1] });
  for (const [x, z] of tilesOf(r)) assert.equal(sim.grid.zoneAt(x, z), 1, 'the freed ground takes paint');
});

test('every starter building can be bulldozed and its ground built on again', () => {
  for (const r of starterPlaced()) {
    const sim = mk();
    sim.dispatch({ type: 'bulldoze', id: r.id });
    assert.equal(sim.alive(r.id), false, r.id + ' is gone');
    sim.dispatch({ type: 'place', model: 'cottage', gx: r.gx, gz: r.gz, fw: 1, fd: 1, rot: 0 });
    assert.equal(mine(sim).length, 1, 'a new cottage stands on the freed lot of ' + r.id);
  }
});

test('every starter street tile can be bulldozed, and the road can be drawn back', () => {
  const sim = mk();
  const tiles = starterStreetTiles();
  sim.dispatch({ type: 'bulldozeRoad', tiles });
  for (const [gx, gz] of tiles) assert.equal(sim.grid.roadAt(gx, gz), 0, 'gone');
  sim.dispatch({ type: 'undo' });
  for (const [gx, gz] of tiles) assert.notEqual(sim.grid.roadAt(gx, gz), 0, 'back');
});

test('undo brings a bulldozed starter building back on its lot, with its income', () => {
  const sim = mk();
  const rate0 = sim.rate();
  const r = starterPlaced().find((x) => x.model === 'cafe');
  sim.dispatch({ type: 'bulldoze', id: r.id });
  assert.ok(sim.rate() <= rate0 + 1e-9);
  sim.dispatch({ type: 'undo' });
  assert.equal(sim.alive(r.id), true);
  assert.ok(starters(sim).some((x) => x.id === r.id && x.starter));
  assert.equal(sim.grid.lotAt(r.gx, r.gz) >= LOT_BASE, true, 'its lot is built again');
  assert.equal(sim.rate(), rate0);
});

test('a starter building that is upgraded earns the extra, not its whole income again', () => {
  const sim = mk();
  const rate0 = sim.rate();
  sim.dispatch({ type: 'upgrade', id: 'b1000' });
  const up = sim.rate() - rate0;
  assert.ok(up > 0 && up < 5, 'the level-2 gain only: ' + up);
});

test('building prices count only the player\'s own buildings', () => {
  const sim = mk();
  const cottage = modelById('cottage');
  assert.equal(sim.placeCost(cottage, 1, 1), buildCost(areaCost(cottage, 1, 1), 0));
  sim.dispatch({ type: 'place', model: 'cottage', gx: 40, gz: 20, fw: 1, fd: 1, rot: 0 });
  assert.equal(mine(sim).length, 1);
  assert.equal(sim.placeCost(cottage, 1, 1), buildCost(areaCost(cottage, 1, 1), 1));
});

test('the starter homes and shops feed traffic demand from the first tick', () => {
  const sim = mk();
  const d = zoneDemand(sim.state, sim.grid);
  const sum = (a) => a.reduce((n, v) => n + v, 0);
  assert.ok(sum(d.pop) > 0, 'residents');
  assert.ok(sum(d.shops) > 0 && sum(d.jobs) > 0, 'shops are jobs too');
});

test('a save from before the reset becomes the starter town, keeps settings, and its old town is in the backup', () => {
  const storage = fakeStorage();
  const old = mk();
  old.dispatch({ type: 'place', model: 'tower', gx: 40, gz: 20, fw: 2, fd: 2, rot: 0 });
  const oldState = JSON.parse(JSON.stringify(old.state));
  oldState.coins = 5e6; oldState.night = 1; oldState.speed = 2;
  storage.setItem(SAVE_KEY, JSON.stringify({ v: 2, savedAt: 1000, state: oldState }));
  const now = 2000000;
  const res = loadGame(storage, now);
  assert.equal(res.source, 'save');
  assert.equal(res.state.coins, START_COINS, 'the new town starts with the starting coins');
  assert.equal(res.state.night, 1, 'settings are kept');
  assert.equal(res.state.speed, 2);
  assert.equal(res.savedAt, now, 'the new town earns nothing for the time the old one was away');
  assert.equal(res.state.placed.filter((r) => r.starter).length, STARTER_COUNT);
  assert.equal(res.state.placed.filter((r) => !r.starter).length, 0);
  assert.match(res.notice, /backup/);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).v, SAVE_VERSION, 'the new town is written at once');
  assert.equal(backupInfo(storage).savedAt, 1000, 'the old town is in the backup slot');
  assert.ok(storage.getItem(BACKUP_KEY));

  assert.equal(restoreBackup(storage, now + 10), true);
  const back = loadGame(storage, now + 10);
  assert.equal(back.state.coins, 5e6, 'restore brings the old town back, not the reset one');
  assert.equal(back.state.placed.filter((r) => !r.starter).length, 1);
  assert.equal(back.notice, '');
});

test('a save already at the current version loads unchanged, with no reset and no notice', () => {
  const storage = fakeStorage();
  const state = freshState();
  state.coins = 777;
  storage.setItem(SAVE_KEY, JSON.stringify(wrap(state, 1000)));
  const res = loadGame(storage, 5000);
  assert.equal(res.state.coins, 777);
  assert.equal(res.notice, '');
  assert.equal(res.savedAt, 1000);
  assert.equal(backupInfo(storage), null);
});

test('Renewal starts the village over: all ten starter buildings are back and no player building is', () => {
  const sim = mk();
  sim.dispatch({ type: 'place', model: 'cottage', gx: 40, gz: 20, fw: 1, fd: 1, rot: 0 });
  sim.dispatch({ type: 'bulldoze', id: 'b1003' });
  sim.state.runEarned = BALANCE.renewal.divisor;
  sim.dispatch({ type: 'renew' });
  assert.equal(starters(sim).length, STARTER_COUNT);
  assert.equal(mine(sim).length, 0);
  for (const r of starters(sim)) for (const [x, z] of tilesOf(r)) assert.ok(sim.grid.lotAt(x, z) >= LOT_BASE);
});

test('a long absence in the starter village leaves a postcard with real numbers', () => {
  const NOW = 1_800_000_000_000;
  const sim = createSim({ state: freshState(), layout, now: () => NOW });
  const rate = sim.rate();
  const o = sim.catchUp(NOW - 6 * 3600 * 1000);
  assert.ok(o && o.coins > 0 && o.coins <= rate * 6 * 3600, 'the postcard holds the coins earned while away');
});
