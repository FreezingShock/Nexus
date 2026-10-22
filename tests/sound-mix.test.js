import test from 'node:test';
import assert from 'node:assert/strict';
import { SOUND_KEY, DEFAULTS, cleanVolume, sanitizeSound, busGain, createSoundStore } from '../src/audio/mix.js';

// In-memory storage. `broken` makes every call throw, like a private window with storage blocked.
function memStore({ broken = false, seed = null } = {}) {
  const m = new Map();
  if (seed !== null) m.set(SOUND_KEY, seed);
  return {
    m,
    getItem(k) { if (broken) throw new Error('blocked'); return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { if (broken) throw new Error('blocked'); m.set(k, String(v)); },
  };
}

test('volumes are clamped to 0..1 and rounded; non-numbers are rejected', () => {
  assert.equal(cleanVolume(0.333), 0.33);
  assert.equal(cleanVolume(-2), 0);
  assert.equal(cleanVolume(7), 1);
  assert.equal(cleanVolume('0.5'), null);
  assert.equal(cleanVolume(NaN), null);
  assert.equal(cleanVolume(Infinity), null);
});

test('sanitizeSound keeps valid fields and fills the rest from the defaults', () => {
  assert.deepEqual(sanitizeSound(null), DEFAULTS);
  assert.deepEqual(sanitizeSound('nope'), DEFAULTS);
  const s = sanitizeSound({ master: 0.2, music: 'loud', effects: 9, ambience: 0.1, muted: 'yes' });
  assert.equal(s.master, 0.2);
  assert.equal(s.music, DEFAULTS.music);      // a string is not a volume
  assert.equal(s.effects, 1);                 // clamped
  assert.equal(s.ambience, 0.1);
  assert.equal(s.muted, false);               // only a real boolean counts
});

test('busGain is master times the bus, and zero while muted', () => {
  const s = { master: 0.5, music: 0.5, effects: 1, ambience: 0.2, muted: false };
  assert.equal(busGain(s, 'music'), 0.25);
  assert.equal(busGain(s, 'effects'), 0.5);
  assert.equal(busGain({ ...s, muted: true }, 'effects'), 0);
  assert.equal(busGain(null, 'music'), 0);
});

test('the store starts from the defaults and saves a change in a versioned record', () => {
  const storage = memStore();
  const store = createSoundStore({ storage });
  assert.deepEqual(store.get(), DEFAULTS);
  assert.equal(store.set('music', 0.2), true);
  assert.equal(store.set('music', 0.2), false, 'the same value is not a change');
  const saved = JSON.parse(storage.m.get(SOUND_KEY));
  assert.equal(saved.v, 1);
  assert.equal(saved.music, 0.2);
  assert.equal(createSoundStore({ storage }).get().music, 0.2, 'a new store reads the saved value');
});

test('the store ignores unknown keys and bad values', () => {
  const store = createSoundStore({ storage: memStore() });
  assert.equal(store.set('turbo', 1), false);
  assert.equal(store.set('master', 'x'), false);
  assert.equal(store.set('muted', 'yes'), false);
  assert.deepEqual(store.get(), DEFAULTS);
});

test('toggleMute flips the mute and tells subscribers', () => {
  const store = createSoundStore({ storage: memStore() });
  const seen = [];
  const off = store.subscribe((s) => seen.push(s.muted));
  store.toggleMute();
  store.toggleMute();
  off();
  store.toggleMute();
  assert.deepEqual(seen, [true, false]);
  assert.equal(store.get().muted, true);
});

test('a saved record from another version is ignored, not read', () => {
  const store = createSoundStore({ storage: memStore({ seed: JSON.stringify({ v: 99, master: 0.1 }) }) });
  assert.equal(store.get().master, DEFAULTS.master);
});

test('blocked or corrupt storage falls back to defaults and never throws', () => {
  const blocked = createSoundStore({ storage: memStore({ broken: true }) });
  assert.deepEqual(blocked.get(), DEFAULTS);
  assert.equal(blocked.set('master', 0.3), true, 'the change still applies for this visit');
  assert.equal(blocked.get().master, 0.3);
  const corrupt = createSoundStore({ storage: memStore({ seed: '{not json' }) });
  assert.deepEqual(corrupt.get(), DEFAULTS);
  assert.deepEqual(createSoundStore({ storage: null }).get(), DEFAULTS);
});
