// Paint for buildings: wall schemes (a wall colour with its own trim), trim colours and roof colours. Pure data and rules:
// no DOM, no THREE. Repainting costs coins by footprint. The newer colours need a one-time Parts unlock, then every building
// can wear them. A record keeps its choice as `pal` (scheme key), `trim` (a TRIMS key, or none for the scheme's own trim)
// and `roof` (a ROOFS key, or none for the scheme's own roof). The whole town can be painted at once (state.townPaint).
import { PAL, ROOFS, TRIMS } from './palettes.js';
import { modelById } from './models.js';

// Parts: one-time unlock (0 is open from the start). The first four wall schemes are the district palettes.
export const WALL_PARTS = {
  warm: 0, pastel: 0, slate: 0, green: 0, cream: 0, butter: 0, rose: 0, sage: 0,
  sky: 60, terracotta: 90, ochre: 120, olive: 150, lilac: 180, denim: 240, chalk: 240, mulberry: 300, brick: 300, teal: 360, plum: 450, charcoal: 600,
};
export const TRIM_PARTS = { cream: 0, terracotta: 0, forest: 0, mustard: 0, rose: 60, brown: 90, sky: 90, navy: 120, teal: 180, plum: 240, charcoal: 300 };
export const ROOF_PARTS = { tile: 0, slate: 0, rose: 0, umber: 0, moss: 60, sand: 90, plum: 120, forest: 120, ochre: 180, harbour: 240, navy: 300, copper: 450 };
export const WALL_COST = 90;  // coins per footprint tile
export const TRIM_COST = 40;
export const ROOF_COST = 60;

const KINDS = {
  wall: { parts: WALL_PARTS, table: PAL, cost: WALL_COST, tag: 'w' },
  trim: { parts: TRIM_PARTS, table: TRIMS, cost: TRIM_COST, tag: 't' },
  roof: { parts: ROOF_PARTS, table: ROOFS, cost: ROOF_COST, tag: 'r' },
};
export const KIND_IDS = Object.keys(KINDS);
export const partsOf = (kind) => KINDS[kind].parts;
export const tableOf = (kind) => KINDS[kind].table;
export const unlockId = (kind, key) => KINDS[kind].tag + ':' + key;

export const isKey = (kind, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(KINDS[kind].parts, key) && !!KINDS[kind].table[key];
export const isOpen = (kind, key, unlocks) => KINDS[kind].parts[key] === 0 || unlocks.includes(unlockId(kind, key));
export const costOf = (kind, rec) => KINDS[kind].cost * rec.fw * rec.fd;

// Untrusted unlock list in, known ids that really need Parts out.
export function sanitizeUnlocks(raw) {
  const ok = (id) => typeof id === 'string' && KIND_IDS.some((k) => id.startsWith(KINDS[k].tag + ':') && isKey(k, id.slice(2)) && KINDS[k].parts[id.slice(2)] > 0);
  return [...new Set((Array.isArray(raw) ? raw : []).filter(ok))];
}

// The town's standing choice for grown (zoned) lots: { wall?, trim?, roof? } of valid keys, or null.
export function sanitizeTownPaint(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const k of KIND_IDS) if (isKey(k, raw[k])) out[k] = raw[k];
  return Object.keys(out).length ? out : null;
}

// Placed buildings that have walls to paint (parks are ground and have none).
export const paintableRecord = (rec) => { const d = modelById(rec.model); return !!d && d.floors[1] > 0; };

// What painting the whole town with `change` ({ wall?, trim?, roof? }) would touch and cost: every paintable placed building,
// priced by its footprint, plus every grown lot at one tile each.
export function townPlan(state, change) {
  const kinds = KIND_IDS.filter((k) => isKey(k, change && change[k]));
  let n = 0, cost = 0;
  for (const rec of state.placed) {
    if (!paintableRecord(rec)) continue;
    const mine = kinds.filter((k) => !((k === 'wall' ? rec.pal : rec[k]) === change[k]));
    if (!mine.length) continue;
    n++; for (const k of mine) cost += costOf(k, rec);
  }
  const lots = state.lots ? state.lots.length : 0, tp = state.townPaint || {};
  const lotKinds = kinds.filter((k) => tp[k] !== change[k]);
  if (lotKinds.length && lots) { n += lots; for (const k of lotKinds) cost += KINDS[k].cost * lots; }
  return { kinds, n, cost };
}
