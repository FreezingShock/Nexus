import test from 'node:test';
import assert from 'node:assert/strict';
import { wrap, unwrap, sanitize, readSave, writeSave, SAVE_VERSION } from '../src/sim/save.js';
import { freshState } from '../src/sim/state.js';

test('round trip through the envelope', () => {
  const s = freshState(); s.coins = 99.5; s.levels.b3 = 4; s.removed.push('b1');
  const r = unwrap(JSON.stringify(wrap(s, 1234)));
  assert.equal(r.ok, true);
  assert.equal(r.savedAt, 1234);
  assert.deepEqual(r.state, { ...s, paused: false });
});

test('rejects junk, other games and saves from a newer version', () => {
  assert.equal(unwrap('not json').ok, false);
  assert.equal(unwrap('{"hello":1}').ok, false);
  assert.equal(unwrap(JSON.stringify({ v: SAVE_VERSION + 1, savedAt: 0, state: {} })).ok, false);
});

test('sanitize clamps hostile values', () => {
  const s = sanitize({ coins: -5, parts: 'x', levels: { b1: 1e9, evil: 3, b2: 2.5 }, removed: ['b1', '<script>'], speed: 99, night: 'yes', offline: { coins: NaN } });
  assert.equal(s.coins, 0);
  assert.equal(s.parts, freshState().parts);
  assert.deepEqual(s.levels, { b1: 99 });
  assert.deepEqual(s.removed, ['b1']);
  assert.equal(s.speed, 1);
  assert.equal(s.night, 1);
  assert.equal(s.offline.coins, 0);
});

test('storage failures never throw', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.equal(readSave(broken).ok, false);
  assert.equal(writeSave(freshState(), 1, broken), false);
  assert.equal(readSave(null).ok, false);
});

test('write then read with a working storage', () => {
  const m = new Map();
  const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  assert.equal(writeSave(freshState(), 42, st), true);
  const r = readSave(st);
  assert.equal(r.ok, true);
  assert.equal(r.savedAt, 42);
});
