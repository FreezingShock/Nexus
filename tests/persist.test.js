import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_KEY, BACKUP_KEY, UNREADABLE_PREFIX, SAVE_VERSION, BACKUP_EVERY_MS, MAX_FILE_CHARS,
  wrap, unwrap, sanitize, writeSave, readSave, loadGame, backupInfo, restoreBackup, clearSave, exportText, importText,
} from '../src/sim/save.js';
import { freshState } from '../src/sim/state.js';
import { createSim } from '../src/sim/sim.js';
import { getLayout } from '../src/world/layout.js';
import { systems } from '../src/sim/systems/index.js';

const layout = getLayout();
const MIN = 60 * 1000;

// In-memory localStorage stand-in. `broken` makes every call throw, like a private window with storage blocked.
function memory({ broken = false } = {}) {
  const m = new Map();
  const guard = () => { if (broken) throw new Error('blocked'); };
  return {
    m,
    getItem: (k) => { guard(); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { guard(); m.set(k, String(v)); },
    removeItem: (k) => { guard(); m.delete(k); },
  };
}
const town = (coins) => { const s = freshState(); s.coins = coins; return s; };

test('the first autosave writes the primary slot and no backup', () => {
  const st = memory();
  assert.equal(writeSave(town(10), 1000, st), true);
  assert.equal(st.m.has(BACKUP_KEY), false);
  assert.equal(readSave(st).state.coins, 10);
});

test('the backup slot is refreshed at most every 10 minutes while playing', () => {
  const st = memory();
  writeSave(town(1), 0, st);
  writeSave(town(2), 45 * 1000, st); // 45 s later: the first save is too new to be a backup
  assert.equal(st.m.has(BACKUP_KEY), false);
  writeSave(town(3), 45 * 1000 + BACKUP_EVERY_MS, st); // the 45 s save is now 10 min old, so it becomes the backup
  assert.equal(unwrap(st.m.get(BACKUP_KEY)).state.coins, 2);
  assert.equal(backupInfo(st).savedAt, 45 * 1000);
});

test('forceBackup always keeps the previous save, however recent', () => {
  const st = memory();
  writeSave(town(1), 0, st);
  writeSave(town(2), 1000, st, { forceBackup: true });
  assert.equal(unwrap(st.m.get(BACKUP_KEY)).state.coins, 1);
});

test('a corrupt primary never replaces a good backup', () => {
  const st = memory();
  writeSave(town(5), 0, st);
  writeSave(town(6), 1000, st, { forceBackup: true }); // backup now holds coins 5
  st.m.set(SAVE_KEY, '{{broken');
  writeSave(town(7), 20 * MIN, st); // the corrupt primary must not be copied over the good backup
  assert.equal(unwrap(st.m.get(BACKUP_KEY)).state.coins, 5);
});

test('healthy load reports the save and its time', () => {
  const st = memory();
  writeSave(town(42), 5000, st);
  const g = loadGame(st, 9000);
  assert.equal(g.source, 'save');
  assert.equal(g.state.coins, 42);
  assert.equal(g.savedAt, 5000);
  assert.equal(g.notice, '');
});

test('an empty browser starts a new town without a notice', () => {
  const g = loadGame(memory(), 1);
  assert.equal(g.source, 'new');
  assert.equal(g.savedAt, null);
  assert.equal(g.notice, '');
});

test('a corrupt primary is kept as an unreadable copy and the backup takes its place', () => {
  const st = memory();
  writeSave(town(8), 0, st);
  writeSave(town(9), 1000, st, { forceBackup: true }); // backup holds coins 8
  st.m.set(SAVE_KEY, 'garbage');
  const g = loadGame(st, 777);
  assert.equal(g.source, 'backup');
  assert.equal(g.state.coins, 8);
  assert.match(g.notice, /restored from its backup/);
  assert.equal(st.m.get(UNREADABLE_PREFIX + 777), 'garbage', 'the unreadable text is kept, never dropped');
});

test('a corrupt primary with no usable backup starts fresh, keeps the text and says so', () => {
  const st = memory();
  st.m.set(SAVE_KEY, '{"v":1,"state":');
  st.m.set(BACKUP_KEY, 'also broken');
  const g = loadGame(st, 5);
  assert.equal(g.source, 'new');
  assert.match(g.notice, /could not be read/);
  assert.equal(st.m.get(UNREADABLE_PREFIX + 5), '{"v":1,"state":');
  assert.equal(st.m.get(BACKUP_KEY), 'also broken', 'an unreadable backup is left alone');
});

test('blocked storage loads a fresh town and explains why saves will not stick', () => {
  const g = loadGame(memory({ broken: true }), 1);
  assert.equal(g.source, 'new');
  assert.match(g.notice, /will not keep saves/);
  assert.equal(loadGame(null, 1).source, 'new');
  assert.equal(writeSave(town(1), 1, memory({ broken: true })), false);
  assert.equal(clearSave(memory({ broken: true })), false);
  assert.equal(restoreBackup(memory({ broken: true }), 1), false);
  assert.equal(backupInfo(memory({ broken: true })), null);
});

test('restore swaps the backup in, stamps it with now, and keeps the current town as the backup', () => {
  const st = memory();
  writeSave(town(1), 0, st);
  writeSave(town(2), 1000, st, { forceBackup: true }); // backup holds coins 1
  assert.equal(restoreBackup(st, 99999), true);
  const back = readSave(st);
  assert.equal(back.state.coins, 1);
  assert.equal(back.savedAt, 99999, 'no offline credit for the time the backup sat there');
  assert.equal(unwrap(st.m.get(BACKUP_KEY)).state.coins, 2, 'undoable: the replaced town is now the backup');
  assert.equal(restoreBackup(memory(), 1), false, 'nothing to restore');
});

test('start over moves the town to the backup slot before clearing the primary', () => {
  const st = memory();
  writeSave(town(33), 0, st);
  assert.equal(clearSave(st), true);
  assert.equal(st.m.has(SAVE_KEY), false);
  assert.equal(unwrap(st.m.get(BACKUP_KEY)).state.coins, 33);
});

test('export text is a versioned envelope that imports back to the same town', () => {
  const s = town(64); s.removed.push('b3');
  const text = exportText(s, 1234);
  const r = importText(text);
  assert.equal(r.ok, true);
  assert.equal(r.savedAt, 1234);
  assert.equal(r.state.coins, 64);
  assert.deepEqual(r.state.removed, ['b3']);
});

test('import rejects anything that is not a Nexus town, before the player is asked to replace anything', () => {
  assert.equal(importText('').ok, false);
  assert.equal(importText('not json').ok, false);
  assert.equal(importText('x'.repeat(MAX_FILE_CHARS + 1)).ok, false);
  assert.match(importText('{"hello":1}').error, /not a Nexus save/);
  assert.match(importText(JSON.stringify({ v: SAVE_VERSION + 4, savedAt: 1, state: {} })).error, /newer version/);
  assert.match(importText(JSON.stringify({ v: 1, savedAt: 1, state: { coins: 5 } })).error, /does not hold a Nexus town/);
  assert.match(importText(JSON.stringify({ v: 1, savedAt: 1, state: { roads: {} } })).error, /does not hold a Nexus town/);
});

test('import clamps hostile values and keeps a missing save time as null', () => {
  const r = importText(JSON.stringify({ v: 1, state: { coins: -5, roads: {}, speed: 99, levels: { b1: 1e9 } } }));
  assert.equal(r.ok, true);
  assert.equal(r.savedAt, null);
  assert.equal(r.state.coins, 0);
  assert.equal(r.state.speed, 1);
  assert.deepEqual(r.state.levels, { b1: 99 });
});

test('migrations run in order, one step per version, and each step sees the previous result', () => {
  const env = { v: 1, savedAt: 10, state: { coins: 1 } };
  const steps = [(s) => ({ ...s, coins: s.coins + 1 }), (s) => ({ ...s, coins: s.coins * 10 })];
  const r = unwrap(env, { version: 3, steps });
  assert.equal(r.ok, true);
  assert.equal(r.state.coins, 20);
  assert.equal(r.v, 1);
});

test('migrations that are missing, throw or return junk fail cleanly, never throw', () => {
  const env = { v: 1, savedAt: 10, state: { coins: 1 } };
  assert.match(unwrap(env, { version: 3, steps: [(s) => s] }).error, /no upgrade from version 2/);
  assert.equal(unwrap(env, { version: 2, steps: [() => { throw new Error('boom'); }] }).ok, false);
  assert.equal(unwrap(env, { version: 2, steps: [() => 'nope'] }).ok, false);
});

test('a save with a bad time loads with savedAt null, so it earns no offline credit', () => {
  assert.equal(unwrap({ v: 1, savedAt: 'soon', state: {} }).savedAt, null);
  assert.equal(unwrap({ v: 1, savedAt: 0, state: {} }).savedAt, null);
  assert.equal(unwrap({ v: 1, savedAt: -5, state: {} }).savedAt, null);
});

test('corrupt data of every shape is refused with a reason', () => {
  for (const raw of ['', 'null', '[]', '42', '{"v":0,"state":{}}', '{"v":1.5,"state":{}}', '{"v":1,"state":[]}', '{"v":1}']) {
    const r = unwrap(raw);
    assert.equal(r.ok, false, raw);
    assert.equal(typeof r.error, 'string', raw);
  }
});

test('a system without a sanitize hook keeps saved values only when their type matches', () => {
  const defs = [{ id: 'probe', state: () => ({ thing: 0, list: [] }) }];
  const good = sanitize({ thing: 5, list: [1, 2] }, defs);
  assert.equal(good.thing, 5);
  assert.deepEqual(good.list, [1, 2]);
  const bad = sanitize({ thing: 'five', list: 'x' }, defs);
  assert.equal(bad.thing, 0);
  assert.deepEqual(bad.list, []);
});

test('every system owns its own state keys: no two systems share one', () => {
  const seen = new Map();
  for (const d of systems) {
    if (!d.state) continue;
    for (const k of Object.keys(d.state())) {
      assert.ok(!seen.has(k), 'state key "' + k + '" is claimed by ' + seen.get(k) + ' and ' + d.id);
      seen.set(k, d.id);
    }
  }
});

test('a road drawn over painted tiles is not saved as paint, and the reloaded town matches the live one', () => {
  const sim = createSim({ layout });
  sim.state.coins = 1e6;
  sim.dispatch({ type: 'paintZone', zone: 1, a: [20, 20], b: [24, 22] });
  sim.dispatch({ type: 'drawRoad', roadType: 'two', path: [[20, 18], [20, 19], [20, 20]] });
  const saved = sim.prepareSave();
  const live = Array.from(sim.grid.zone);
  const back = createSim({ state: unwrap(JSON.stringify(wrap(saved, 1))).state, layout });
  assert.deepEqual(Array.from(back.grid.zone), live);
  assert.equal(saved.zones.split('').filter((c) => c !== '0').length, live.filter((z) => z).length);
});

test('a whole town survives a save: zones, lots, roads, placed buildings with seeds, levels and coins', () => {
  const sim = createSim({ layout });
  sim.state.coins = 1e6;
  sim.dispatch({ type: 'paintZone', zone: 1, a: [20, 20], b: [24, 22] });
  sim.dispatch({ type: 'drawRoad', roadType: 'two', path: [[20, 18], [20, 19], [20, 20]] });
  sim.dispatch({ type: 'place', model: 'mansard', gx: 36, gz: 20, fw: 2, fd: 2, rot: 1 });
  sim.dispatch({ type: 'upgrade', id: layout.buildings[0].id });
  for (let i = 0; i < 60; i++) sim.tick();

  const raw = JSON.stringify(wrap(sim.prepareSave(), 100));
  const back = createSim({ state: unwrap(raw).state, layout });
  const a = sim.state, b = back.state;
  assert.equal(b.zones, a.zones);
  assert.deepEqual(b.lots, a.lots);
  assert.deepEqual(b.roads, a.roads);
  assert.deepEqual(b.levels, a.levels);
  assert.equal(b.gseed, a.gseed);
  assert.equal(b.placed.length, 1);
  assert.equal(b.placed[0].id, a.placed[0].id);
  assert.equal(b.placed[0].seed, a.placed[0].seed);
  assert.equal(typeof b.placed[0].seed, 'number');
  assert.equal(back.rate(), sim.rate(), 'the rate is rebuilt from the save, not stored');
  assert.ok(back.grid.lot.some((v) => v >= 40000), 'placed buildings are back on the grid');
});
