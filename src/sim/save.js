// Versioned save envelope { v, savedAt, state } with ordered migrations.
import { freshState } from './state.js';
import { systems } from './systems/index.js';

export const SAVE_KEY = 'nexus.save';
export const SAVE_VERSION = 1;

// migrations[i] upgrades a state saved at version i+1 to version i+2.
export const migrations = [];

export function wrap(state, now) {
  return { v: SAVE_VERSION, savedAt: now, state };
}

const num = (x, d, lo = 0, hi = 1e18) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);

// Coerce an untrusted state into the current shape.
export function sanitize(s) {
  const f = freshState();
  if (!s || typeof s !== 'object') return f;
  const levels = {};
  if (s.levels && typeof s.levels === 'object') {
    for (const [k, v] of Object.entries(s.levels)) if (/^b\d+$/.test(k) && Number.isInteger(v)) levels[k] = Math.min(99, Math.max(1, v));
  }
  const off = s.offline && typeof s.offline === 'object' ? s.offline : null;
  const out = {
    coins: num(s.coins, f.coins), parts: num(s.parts, f.parts),
    levels,
    removed: Array.isArray(s.removed) ? s.removed.filter((x) => typeof x === 'string' && /^b\d+$/.test(x)).slice(0, 500) : [],
    night: s.night ? 1 : 0, speed: [1, 2, 3].includes(s.speed) ? s.speed : 1, paused: false,
    offline: off ? { coins: num(off.coins, 0), parts: num(off.parts, 0), awayS: num(off.awayS, 0), fullS: num(off.fullS, 0), easeS: num(off.easeS, 0) } : null,
    log: Array.isArray(s.log) ? s.log.filter((e) => e && typeof e.k === 'string').slice(-8).map((e) => ({ k: e.k.slice(0, 8), n: String(e.n ?? '').slice(0, 40) })) : [],
  };
  // each system keeps and validates its own saved fields; missing ones fall back to fresh defaults
  for (const d of systems) {
    if (d.state) Object.assign(out, d.state());
    if (d.sanitize) Object.assign(out, d.sanitize(s, f));
  }
  return out;
}

// Returns { ok, state, savedAt } or { ok:false, error }.
export function unwrap(raw) {
  let env;
  try { env = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return { ok: false, error: 'not JSON' }; }
  if (!env || typeof env !== 'object' || !Number.isInteger(env.v) || env.v < 1) return { ok: false, error: 'not a Nexus save' };
  if (env.v > SAVE_VERSION) return { ok: false, error: 'saved by a newer version' };
  let state = env.state;
  for (let v = env.v; v < SAVE_VERSION; v++) state = migrations[v - 1](state);
  return { ok: true, state: sanitize(state), savedAt: Number.isFinite(env.savedAt) ? env.savedAt : 0 };
}

// Every storage call is wrapped: private windows and blocked storage throw.
export function readSave(storage = safeStorage()) {
  try {
    const raw = storage && storage.getItem(SAVE_KEY);
    return raw ? unwrap(raw) : { ok: false, error: 'empty' };
  } catch { return { ok: false, error: 'storage unavailable' }; }
}
export function writeSave(state, now, storage = safeStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(SAVE_KEY, JSON.stringify(wrap(state, now)));
    return true;
  } catch { return false; }
}
export function clearSave(storage = safeStorage()) {
  try { storage && storage.removeItem(SAVE_KEY); return true; } catch { return false; }
}
function safeStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}
