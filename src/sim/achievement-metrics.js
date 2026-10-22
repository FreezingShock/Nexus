// Readers for the achievement metrics: each takes { sim, state, grid } and returns the value right now.
// Pure reads of the sim, no DOM. The system keeps the best value each one has ever reached, so a reader may go down
// (a street is bulldozed, a Renewal clears the town) without taking a stage away.
import { describe, modelById } from '../world/models.js';
import { seasonLengthS } from '../core/calendar.js';
import { MAX_LEVEL } from './economy.js';
import { DIRECT } from './achievements.js';

const PEOPLE_PER_LOT_LEVEL = 4, PEOPLE_PER_HOME_STOREY = 2;
const MIN_BUILT_FOR_HAPPY = 8; // an empty town has a calm base mood, not a happy one

// Storeys of a placed building never change (upgrades change the level, not the floors), so each is worked out once.
const floorsCache = new WeakMap();
function floorsOf(sim, rec) {
  let m = floorsCache.get(sim);
  if (!m) floorsCache.set(sim, (m = new Map()));
  let f = m.get(rec.id);
  if (f === undefined) { const d = describe(rec, 1); f = d ? d.floors : 0; m.set(rec.id, f); }
  return f;
}

const catOf = (rec) => { const d = modelById(rec.model); return d ? d.cat : null; };
// The starter village is a gift, not an achievement: only buildings the player placed count towards these goals.
// (Its homes still count as neighbours, because people do live there.)
const mine = (state) => state.placed.filter((r) => !r.starter);
const countCat = (state, cat) => { let n = 0; for (const r of mine(state)) if (catOf(r) === cat) n++; return n; };
const kindsOf = (state, cat) => new Set(mine(state).filter((r) => catOf(r) === cat).map((r) => r.model)).size;

export const METRICS = {
  population({ sim, state, grid }) {
    let n = 0;
    for (const [i, level] of state.lots) if (grid.zone[i] === 1) n += PEOPLE_PER_LOT_LEVEL * level;
    for (const r of state.placed) {
      const c = catOf(r);
      if (c === 'home') n += PEOPLE_PER_HOME_STOREY * floorsOf(sim, r);
      else if (c === 'shop') n += floorsOf(sim, r);
    }
    return n;
  },
  happiness({ sim }) {
    const s = sim.services && sim.services.summary();
    return s && s.built >= MIN_BUILT_FOR_HAPPY ? Math.round(s.average * 100) : 0;
  },
  lots: ({ state }) => state.lots.length,
  topLevel({ state }) {
    let n = 0;
    for (const l of state.lots) if (l[1] >= MAX_LEVEL) n++;
    for (const r of mine(state)) if ((state.levels[r.id] ?? 1) >= MAX_LEVEL) n++;
    return n;
  },
  income: ({ sim }) => sim.rate(),
  roadTypes({ state }) {
    const t = new Set();
    for (const r of Object.values(state.roads)) t.add(r.t);
    return t.size;
  },
  zoneKinds({ state, grid }) {
    const k = new Set();
    for (const [i] of state.lots) if (grid.zone[i]) k.add(grid.zone[i]);
    return k.size;
  },
  services: ({ state }) => countCat(state, 'service'),
  serviceKinds: ({ state }) => kindsOf(state, 'service'),
  parks: ({ state }) => countCat(state, 'park'),
  landmarks: ({ state }) => countCat(state, 'landmark'),
  farms: ({ state }) => countCat(state, 'farm'),
  farmland({ state }) {
    let n = 0;
    for (const r of mine(state)) if (catOf(r) === 'farm') n += r.fw * r.fd;
    return n;
  },
  districts: ({ state }) => state.districts.length,
  districtTiles({ state }) {
    const s = state.dmap;
    let n = 0;
    for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) !== 48) n++;
    return n;
  },
  // Seasons are counted from the game clock in closed form, so time away counts the same as time spent watching.
  seasons: ({ sim, state }) => Math.floor(Math.max(0, state.clockS) / seasonLengthS(sim.calendarOptions)),
  snow: ({ state }) => (state.snowYear >= 0 ? 1 : 0),
  streak: ({ state }) => state.goals.streak,
  ...Object.fromEntries(Object.entries(DIRECT).map(([k, fn]) => [k, ({ state }) => fn(state)])),
};

export const readMetric = (name, ctx) => {
  const fn = METRICS[name];
  const v = fn ? fn(ctx) : 0;
  return Number.isFinite(v) ? Math.max(0, v) : 0;
};
