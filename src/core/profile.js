// The mayor's profile: a name, a picture, a rank and personal bests that outlast any one town. Pure rules plus a small
// per-browser store (like the sound and calendar settings), so Start over and Renewal keep it. Every storage call is
// wrapped. No DOM, no network: tested in node.

export const PROFILE_KEY = 'nexus.profile.v1';
const VERSION = 1;
export const NAME_MAX = 24;

// The picture: initials in a coloured circle (the default), or one of the drawn emblems (src/ui/title-icons.js).
export const EMBLEMS = ['initials', 'hat', 'tulip', 'lantern', 'bicycle', 'teapot', 'key', 'sheep', 'oak'];
export const COLORS = ['#B8472E', '#5F7A3E', '#C08A2E', '#35566A', '#97553E', '#7A5C86', '#3E7A72', '#C96F4F'];

// The rank ladder, earned with milestone stages (src/sim/achievements.js). The best ever is kept, so a new town or a
// Renewal never takes a rank away.
export const RANKS = [
  { name: 'Newcomer', stages: 0 },
  { name: 'Village Clerk', stages: 3 },
  { name: 'Town Crier', stages: 10 },
  { name: 'Alderman', stages: 22 },
  { name: 'Deputy Mayor', stages: 38 },
  { name: 'Mayor', stages: 58 },
  { name: 'Lord Mayor', stages: 82 },
  { name: 'Grand Burgomaster', stages: 110 },
];

export function rankFor(stages) {
  const s = Math.max(0, Number.isFinite(stages) ? stages : 0);
  let i = 0;
  while (i + 1 < RANKS.length && s >= RANKS[i + 1].stages) i++;
  const next = RANKS[i + 1] || null;
  const frac = next ? (s - RANKS[i].stages) / (next.stages - RANKS[i].stages) : 1;
  return { index: i, rank: RANKS[i], next, frac: Math.max(0, Math.min(1, frac)), toNext: next ? next.stages - s : 0 };
}

// Up to two letters from the name, or a little house-mark when there is no name yet.
export function initials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const letters = words.length === 1 ? [...words[0]].slice(0, 2) : [[...words[0]][0], [...words[words.length - 1]][0]];
  return letters.join('').toUpperCase();
}

export const cleanName = (name) => String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);

const count = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const today = (now) => new Date(now).toISOString().slice(0, 10);

export function sanitizeProfile(raw, now = Date.now()) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    name: cleanName(r.name),
    emblem: EMBLEMS.includes(r.emblem) ? r.emblem : 'initials',
    color: COLORS.includes(r.color) ? r.color : COLORS[0],
    since: typeof r.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.since) ? r.since : today(now),
    playMs: count(r.playMs),
    popRecord: count(r.popRecord),
    bestStages: count(r.bestStages),
    towns: count(r.towns),
  };
}

export function createProfileStore({ storage = null, now = () => Date.now() } = {}) {
  let current = read();
  const listeners = new Set();
  function read() {
    let raw = null;
    try { raw = JSON.parse((storage && storage.getItem(PROFILE_KEY)) || 'null'); } catch { raw = null; }
    return sanitizeProfile(raw && raw.v === VERSION ? raw : null, now());
  }
  function write() {
    try { if (storage) storage.setItem(PROFILE_KEY, JSON.stringify({ v: VERSION, ...current })); } catch { /* kept for this visit */ }
    listeners.forEach((fn) => fn(store.get()));
  }
  const store = {
    get: () => ({ ...current }),
    set(key, value) {
      if (!['name', 'emblem', 'color'].includes(key)) return false;
      const next = sanitizeProfile({ ...current, [key]: value }, now());
      if (next[key] === current[key]) return false;
      current = next; write(); return true;
    },
    // Called while the town is open: time played, and the bests seen so far. Only ever adds.
    addPlay(ms) { if (ms > 0 && ms < 10 * 60 * 1000) { current = { ...current, playMs: current.playMs + Math.round(ms) }; write(); } },
    note({ pop, stages } = {}) {
      const next = { ...current, popRecord: Math.max(current.popRecord, count(pop)), bestStages: Math.max(current.bestStages, count(stages)) };
      if (next.popRecord !== current.popRecord || next.bestStages !== current.bestStages) { current = next; write(); }
    },
    // The first town counts once a profile exists; Start over adds one more.
    firstTown() { if (current.towns === 0) { current = { ...current, towns: 1 }; write(); } },
    newTown() { current = { ...current, towns: current.towns + 1 }; write(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  return store;
}

// "3 h 20 min", "45 min", "under a minute".
export function playTime(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'under a minute';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min';
}
