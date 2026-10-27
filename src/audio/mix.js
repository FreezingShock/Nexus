// Sound settings: the master volume, three bus volumes and a mute, the per-browser store, and the gain each bus runs at.
// Pure: no Web Audio and no DOM, so the rules are tested in node. The store keeps its own key, so Start over never
// clears these. Every storage call is wrapped: a town never waits on sound settings.

export const SOUND_KEY = 'nexus.sound.v1';
const VERSION = 1;

export const VOLUMES = ['master', 'music', 'effects', 'ambience'];
export const BUSES = ['music', 'effects', 'ambience'];
// New players start at full master with music and effects at half and a low ambience bed (nate's pick, 2026-10-27).
export const DEFAULTS = { master: 1, music: 0.5, effects: 0.5, ambience: 0.25, muted: false };

// Keeps a number in 0..1 to two decimals. Anything that is not a finite number is rejected (null).
export function cleanVolume(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
}

// Keeps the valid fields of a saved record and fills the rest from the defaults.
export function sanitizeSound(raw) {
  const out = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  for (const k of VOLUMES) {
    const v = cleanVolume(raw[k]);
    if (v !== null) out[k] = v;
  }
  if (typeof raw.muted === 'boolean') out.muted = raw.muted;
  return out;
}

// The gain a bus runs at: master times the bus, and nothing at all while muted.
export function busGain(settings, bus) {
  if (!settings || settings.muted) return 0;
  return cleanVolume(settings.master * settings[bus]) ?? 0;
}

function readStored(storage) {
  try { return JSON.parse((storage && storage.getItem(SOUND_KEY)) || 'null'); }
  catch { return null; }
}

function writeStored(storage, value) {
  try { storage.setItem(SOUND_KEY, JSON.stringify({ v: VERSION, ...value })); return true; }
  catch { return false; }
}

// The store. get() returns a copy. set(key, value) returns true when the value changed; subscribe(fn) hears every change.
export function createSoundStore({ storage = null } = {}) {
  let current = readRecord();
  const listeners = new Set();
  function readRecord() {
    const raw = readStored(storage);
    return sanitizeSound(raw && raw.v === VERSION ? raw : null);
  }
  const store = {
    get: () => ({ ...current }),
    set(key, value) {
      if (!VOLUMES.includes(key) && key !== 'muted') return false;
      const next = key === 'muted' ? (typeof value === 'boolean' ? value : current.muted) : cleanVolume(value);
      if (next === null || next === current[key]) return false;
      current = { ...current, [key]: next };
      writeStored(storage, current);
      listeners.forEach((fn) => fn(store.get()));
      return true;
    },
    toggleMute() { return store.set('muted', !current.muted); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  return store;
}
