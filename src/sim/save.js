// Save envelope { v, savedAt, state }, ordered migrations, one backup slot, quarantine for unreadable saves,
// and file import / export. Every storage call is wrapped: private windows and blocked storage throw.
// The rules and the serialization registry are documented in docs/SAVE.md.
import { freshState } from './state.js';
import { systems } from './systems/index.js';
import { getLayout } from '../world/layout.js';
import { seedTrees } from '../world/trees.js';
import { DEFAULT_TOWN } from './town.js';
import { legacyDone } from './achievements.js';
import { isSeed } from '../world/terrain.js';

export const SAVE_KEY = 'nexus.save';
export const BACKUP_KEY = 'nexus.save.backup';
export const UNREADABLE_PREFIX = 'nexus.save.unreadable.';
export const SAVE_VERSION = 7;
export const MAX_FILE_CHARS = 5 * 1024 * 1024; // a town is a few hundred kilobytes; anything bigger is not one
export const BACKUP_EVERY_MS = 10 * 60 * 1000; // the backup slot is refreshed at most this often while playing

// migrations[i] upgrades a state saved at version i+1 to version i+2. Append only; never edit one that has shipped.
// v2: trees are objects (state.trees). A v1 town gets the trees the generator makes; the trees system then clears
// any that stand on a road, paint or lot, the same way it does for a fresh town.
// v3: the town is the new starter town (world/starter.js). Only the settings carry over. A step marked `resets`
// replaces the town, and unwrap hands the replaced town back so loadGame can keep it in the backup slot.
// v4: the town has a name and a badge (state.town). An older town gets the default name and badge.
const resetToStarter = (s) => ({ ...freshState(), speed: [1, 2, 3].includes(s.speed) ? s.speed : 1 });
resetToStarter.resets = true;
const addTownBadge = (s) => ({ ...s, town: { ...DEFAULT_TOWN, ...(s.town && typeof s.town === 'object' && !Array.isArray(s.town) ? s.town : {}) } });
// v5: the grid grows from 64 to 96 tiles a side, with 16 more tiles on every side. Every tile keeps its place in the
// world, so only the tile keys move: roads, zone paint, district paint, grown lots and placed buildings. The numbers are
// fixed here on purpose, because this step describes version 4, not today's grid. A reset step (version 3) builds its town
// on today's grid, so a town that already has the wider zone paint is left alone.
const OLD_GRID = 64, NEW_GRID = 96, GROW = 16;
const oldTile = (i) => Number.isInteger(i) && i >= 0 && i < OLD_GRID * OLD_GRID;
const moveTile = (i) => (Math.floor(i / OLD_GRID) + GROW) * NEW_GRID + (i % OLD_GRID) + GROW;
// A tile-per-character string (zone paint, district paint) laid out on the wider grid.
function regridText(text, fill) {
  const out = new Array(NEW_GRID * NEW_GRID).fill(fill);
  if (typeof text === 'string') for (let i = 0; i < Math.min(text.length, OLD_GRID * OLD_GRID); i++) out[moveTile(i)] = text[i];
  return out.join('');
}
const regrid = (s) => {
  if (typeof s.zones === 'string' && s.zones.length === NEW_GRID * NEW_GRID) return s;
  const roads = {};
  if (s.roads && typeof s.roads === 'object' && !Array.isArray(s.roads)) {
    for (const [k, r] of Object.entries(s.roads)) if (oldTile(Number(k))) roads[moveTile(Number(k))] = r;
  }
  return {
    ...s,
    roads,
    zones: regridText(s.zones, '0'),
    dmap: regridText(s.dmap, '0'),
    lots: Array.isArray(s.lots) ? s.lots.map((l) => (Array.isArray(l) && oldTile(l[0]) ? [moveTile(l[0]), ...l.slice(1)] : l)) : s.lots,
    placed: Array.isArray(s.placed) ? s.placed.map((r) => (isObj(r) && Number.isInteger(r.gx) && Number.isInteger(r.gz) ? { ...r, gx: r.gx + GROW, gz: r.gz + GROW } : r)) : s.placed,
  };
};
// v6: milestones become stages (state.ach). The flat list of paid milestone ids is turned into the matching stages, marked
// paid so none of them pays twice; stages the town has already outgrown pay out on the first tick after loading.
const addAchievements = (s) => {
  const { milestones, ...rest } = s;
  return { ...rest, ach: { done: legacyDone(milestones), best: {}, counts: { goalsDone: 0, dailies: 0 } } };
};
// v7: population (state.pop). An older town has no head-count yet: -1 lets the population system start it at a share of
// the capacity of its homes.
const addPopulation = (s) => ({ ...s, pop: -1, popHist: [] });
export const migrations = [
  (s) => ({ ...s, trees: seedTrees(getLayout()) }),
  resetToStarter,
  addTownBadge,
  regrid,
  addAchievements,
  addPopulation,
];

export function wrap(state, now) {
  return { v: SAVE_VERSION, savedAt: now, state };
}

const num = (x, d, lo = 0, hi = 1e18) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

// Coerce an untrusted state into the current shape. Each system keeps and validates its own fields.
export function sanitize(s, defs = systems) {
  const f = freshState();
  if (!isObj(s)) return f;
  const levels = {};
  if (isObj(s.levels)) {
    for (const [k, v] of Object.entries(s.levels)) if (/^b\d+$/.test(k) && Number.isInteger(v)) levels[k] = Math.min(99, Math.max(1, v));
  }
  const off = isObj(s.offline) ? s.offline : null;
  const out = {
    coins: num(s.coins, f.coins), parts: num(s.parts, f.parts),
    levels,
    removed: Array.isArray(s.removed) ? s.removed.filter((x) => typeof x === 'string' && /^b\d+$/.test(x)).slice(0, 500) : [],
    terrainSeed: isSeed(s.terrainSeed) ? s.terrainSeed : 0, // a save without one is an old town: it keeps the old land
    speed: [1, 2, 3].includes(s.speed) ? s.speed : 1, paused: false, // night is not saved: it follows the clock (systems/calendar.js)
    offline: off ? { coins: num(off.coins, 0), parts: num(off.parts, 0), awayS: num(off.awayS, 0), fullS: num(off.fullS, 0), easeS: num(off.easeS, 0) } : null,
    log: Array.isArray(s.log) ? s.log.filter((e) => e && typeof e.k === 'string').slice(-8).map((e) => ({ k: e.k.slice(0, 8), n: String(e.n ?? '').slice(0, 40) })) : [],
  };
  for (const d of defs) {
    if (d.state) {
      const defaults = d.state();
      if (d.sanitize) Object.assign(out, defaults); // its sanitize hook replaces whatever it keeps
      else {
        // No sanitize hook: keep a saved value only when its type matches the default. Prefer writing a sanitize hook.
        for (const [k, v] of Object.entries(defaults)) {
          const got = s[k];
          const same = got !== undefined && got !== null && typeof got === typeof v && Array.isArray(got) === Array.isArray(v);
          out[k] = same ? got : v;
        }
      }
    }
    if (d.sanitize) Object.assign(out, d.sanitize(s, f));
  }
  return out;
}

// Returns { ok, state, savedAt, v, retired } or { ok:false, error }. savedAt is null when the save has no usable time.
// retired is { state, savedAt } when a reset step replaced the town, else null. It is the town as it was before the
// reset. That town has the current shape (a reset is the only change), so it can go in the backup slot as this version.
// `version` and `steps` are injectable so tests can exercise migrations without shipping a new version.
export function unwrap(raw, { version = SAVE_VERSION, steps = migrations } = {}) {
  let env;
  try { env = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return { ok: false, error: 'not JSON' }; }
  if (!isObj(env) || !Number.isInteger(env.v) || env.v < 1) return { ok: false, error: 'not a Nexus save' };
  if (env.v > version) return { ok: false, error: 'saved by a newer version' };
  if (!isObj(env.state)) return { ok: false, error: 'no town in this save' };
  try {
    let state = env.state, retired = null;
    for (let v = env.v; v < version; v++) {
      const step = steps[v - 1];
      if (typeof step !== 'function') return { ok: false, error: 'no upgrade from version ' + v };
      const before = state;
      state = step(state);
      if (!isObj(state)) return { ok: false, error: 'an upgrade from version ' + v + ' failed' };
      if (step.resets) retired = before;
    }
    const savedAt = Number.isFinite(env.savedAt) && env.savedAt > 0 ? env.savedAt : null;
    return {
      ok: true, v: env.v, state: sanitize(state), savedAt,
      retired: retired ? { state: retired, savedAt } : null,
    };
  } catch {
    return { ok: false, error: 'could not read this save' };
  }
}

function safeStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}
// Raw text of a key, or null when absent. Throws when storage is blocked; callers catch.
const getRaw = (storage, key) => { const v = storage.getItem(key); return typeof v === 'string' ? v : null; };

// Parses the envelope shape without the full sanitize. Used on hot paths (every autosave).
function readEnvelope(raw) {
  try {
    const env = JSON.parse(raw);
    return isObj(env) && Number.isInteger(env.v) && env.v >= 1 && isObj(env.state) ? env : null;
  } catch { return null; }
}

// Primary slot only. Returns { ok, ... } and never throws.
export function readSave(storage = safeStorage()) {
  try {
    if (!storage) return { ok: false, error: 'storage unavailable' };
    const raw = getRaw(storage, SAVE_KEY);
    return raw === null ? { ok: false, error: 'empty' } : unwrap(raw);
  } catch { return { ok: false, error: 'storage unavailable' }; }
}

// Writes the town to the primary slot. The previous save moves to the backup slot when it is at least
// BACKUP_EVERY_MS old, or always with { forceBackup } (import and restore). A corrupt previous save never
// replaces a good backup. Returns true when the primary write landed.
export function writeSave(state, now, storage = safeStorage(), { forceBackup = false } = {}) {
  try {
    if (!storage) return false;
    const raw = JSON.stringify(wrap(state, now));
    const prev = getRaw(storage, SAVE_KEY);
    if (prev !== null && prev !== raw) {
      const env = readEnvelope(prev);
      if (env && (forceBackup || now - (env.savedAt ?? 0) >= BACKUP_EVERY_MS)) keepBackup(storage, prev);
    }
    storage.setItem(SAVE_KEY, raw);
    return true;
  } catch { return false; }
}
function keepBackup(storage, raw) {
  try { storage.setItem(BACKUP_KEY, raw); } catch { /* the primary write still goes ahead */ }
}

// The backup slot as { savedAt } when it holds a readable save, else null. Used by the settings card.
export function backupInfo(storage = safeStorage()) {
  try {
    if (!storage) return null;
    const raw = getRaw(storage, BACKUP_KEY);
    const env = raw === null ? null : readEnvelope(raw);
    return env ? { savedAt: Number.isFinite(env.savedAt) ? env.savedAt : null } : null;
  } catch { return null; }
}

// Swaps the backup in as the current save, stamped `now` so the restored town is not credited with the time it was away.
// The current save becomes the backup, so restoring is itself undoable. Returns false when there is no backup.
export function restoreBackup(storage = safeStorage(), now = Date.now()) {
  try {
    if (!storage) return false;
    const raw = getRaw(storage, BACKUP_KEY);
    const env = raw === null ? null : readEnvelope(raw);
    if (!env) return false;
    const cur = getRaw(storage, SAVE_KEY);
    if (cur !== null && readEnvelope(cur)) keepBackup(storage, cur);
    storage.setItem(SAVE_KEY, JSON.stringify({ ...env, savedAt: now }));
    return true;
  } catch { return false; }
}

// Start over. The town moves to the backup slot first, so it can still be restored from Settings.
export function clearSave(storage = safeStorage()) {
  try {
    if (!storage) return true;
    const cur = getRaw(storage, SAVE_KEY);
    if (cur !== null && readEnvelope(cur)) keepBackup(storage, cur);
    storage.removeItem(SAVE_KEY);
    return true;
  } catch { return false; }
}

const STORAGE_OFF = 'This browser will not keep saves, so this town lasts only this visit. Export a copy from Settings.';
const UNREADABLE = 'Your saved town could not be read. Its text is kept in this browser, and a new town starts here. Import a save file in Settings to bring a town back.';
const FROM_BACKUP = 'Your latest save could not be read, so your town was restored from its backup.';
const RESET = 'Your village is now the new starter town. Your old town is in the backup slot: restore it from Settings.';

// A save from before a reset: the starter town takes its place. The old town goes to the backup slot first, and the
// new town is written at once, so no later autosave can copy the old save over that backup. The new town's clock starts
// now, so it earns nothing for the time the old town was away.
function startOver(storage, main, now) {
  try {
    keepBackup(storage, JSON.stringify(wrap(main.retired.state, main.retired.savedAt ?? now)));
    storage.setItem(SAVE_KEY, JSON.stringify(wrap(main.state, now)));
  } catch { /* the notice still says what happened; autosave reports if storage is gone */ }
  return { state: main.state, savedAt: now, source: 'save', notice: RESET };
}

// The town for this visit. Never throws. Source is 'save', 'backup' or 'new'; `notice` is text to show, or ''.
export function loadGame(storage = safeStorage(), now = Date.now()) {
  const fresh = (notice) => ({ state: freshState(), savedAt: null, source: 'new', notice });
  let raw;
  try { raw = storage ? getRaw(storage, SAVE_KEY) : null; } catch { return fresh(STORAGE_OFF); }
  if (!storage) return fresh(STORAGE_OFF);
  if (raw === null) return fresh('');
  const main = unwrap(raw);
  if (main.ok && main.retired) return startOver(storage, main, now);
  if (main.ok) return { state: main.state, savedAt: main.savedAt, source: 'save', notice: '' };
  // Keep the unreadable text before anything overwrites it, then fall back to the backup.
  try { storage.setItem(UNREADABLE_PREFIX + now, raw); } catch { /* nothing more we can do; the notice still says so */ }
  let back = null;
  try { const b = getRaw(storage, BACKUP_KEY); back = b === null ? null : unwrap(b); } catch { back = null; }
  if (back && back.ok) return { state: back.state, savedAt: back.savedAt, source: 'backup', notice: FROM_BACKUP };
  return fresh(UNREADABLE);
}

// Export text for a download. Stamped with the time of export.
export function exportText(state, now) {
  return JSON.stringify(wrap(state, now), null, 2);
}

// Validates a file's text before the player is asked to replace the current town. Pure: nothing is written.
export function importText(text) {
  if (typeof text !== 'string' || !text.length) return { ok: false, error: 'the file is empty' };
  if (text.length > MAX_FILE_CHARS) return { ok: false, error: 'the file is too large to be a town' };
  let env;
  try { env = JSON.parse(text); } catch { return { ok: false, error: 'the file is not JSON' }; }
  const r = unwrap(env);
  if (!r.ok) return { ok: false, error: r.error };
  const s = env.state;
  if (!Number.isFinite(s.coins) || !isObj(s.roads)) return { ok: false, error: 'the file does not hold a Nexus town' };
  return { ok: true, state: r.state, savedAt: r.savedAt };
}
