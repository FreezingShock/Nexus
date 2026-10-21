// Districts: named neighbourhoods painted on the grid. Pure data and rules: no DOM, no THREE.
// A district is a slot (1 to 15) with a name, a flag colour and a flag style. The grid layer `district` holds the
// slot of each tile (0 for none). Saved as one hex digit per tile, like zone paint. See docs/DISTRICTS.md.
import { GRID_N } from './grid.js';
import { makeRng } from './rng.js';

export const MAX_DISTRICTS = 15;
export const NAME_MAX = 24;
const AREA = GRID_N * GRID_N;

// Flag colours: warm and earthy first, sky only as one accent among them.
export const DISTRICT_COLORS = ['#C96F4F', '#8DBEDD', '#A8C179', '#E6BC62', '#E3A08E', '#7FA7A3', '#9C6B86', '#F3E9D2'];
// How the two halves of the cloth are split: 0 halves side by side, 1 halves stacked, 2 a centre band, 3 a small emblem.
export const FLAG_STYLES = 4;

// Generated names: two word lists, all original, in the cozy European town register. Never a real place's name.
const FIRST = ['Linden', 'Marigold', 'Kestrel', 'Willow', 'Honeycomb', 'Lantern', 'Copper', 'Thistle', 'Saffron', 'Juniper',
  'Bramble', 'Pebble', 'Orchard', 'Millwheel', 'Clover', 'Quill', 'Foxglove', 'Teasel', 'Hollyhock', 'Barley', 'Sparrow', 'Candle'];
const SECOND = ['Quarter', 'Row', 'Hill', 'Ward', 'Lane', 'Corner', 'Terrace', 'Green', 'Bank', 'Square', 'Steps', 'Yard'];

export const isSlot = (s) => Number.isInteger(s) && s >= 1 && s <= MAX_DISTRICTS;

// A name for a seed. Deterministic: the same seed always gives the same name.
export function nameFor(seed) {
  const r = makeRng(seed * 7919 + 17);
  return r.pick(FIRST) + ' ' + r.pick(SECOND);
}

// Keeps letters, spaces, apostrophes and hyphens. Collapses spaces, trims, caps the length. '' when nothing is left.
export function cleanName(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[^\p{L}\p{M} '-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
}

// Flag look for a district record: palette index and style are kept in saved state; the colours come from the list above.
export const flagColor = (d) => DISTRICT_COLORS[((d && d.pal) || 0) % DISTRICT_COLORS.length];

// Saved encoding: one hex digit per tile, row by row. Only the slots in `slots` survive a load.
export function encodeDistricts(layer) {
  let s = '';
  for (let i = 0; i < AREA; i++) s += layer[i].toString(16);
  return s;
}
export function decodeDistricts(str, out) {
  for (let i = 0; i < AREA; i++) out[i] = parseInt(str.charAt(i), 16) || 0;
  return out;
}
export const validDistrictString = (s) => typeof s === 'string' && s.length === AREA && /^[0-9a-f]+$/.test(s);

// Tiles of each district as an array of tile indices, and the tile nearest its middle: where the flag stands.
// Water and tiles without a slot are skipped. A district with no tiles has no anchor.
export function districtAnchors(grid) {
  const sums = new Map();
  for (let i = 0; i < AREA; i++) {
    const s = grid.district[i];
    if (!s) continue;
    let g = sums.get(s);
    if (!g) { g = { tiles: [], sx: 0, sz: 0 }; sums.set(s, g); }
    const gx = i % GRID_N, gz = Math.floor(i / GRID_N);
    g.tiles.push(i); g.sx += gx; g.sz += gz;
  }
  const out = new Map();
  for (const [slot, g] of sums) {
    const cx = g.sx / g.tiles.length, cz = g.sz / g.tiles.length;
    let best = -1, bestD = Infinity;
    for (const i of g.tiles) {
      const dx = (i % GRID_N) - cx, dz = Math.floor(i / GRID_N) - cz, d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    out.set(slot, { slot, gx: best % GRID_N, gz: Math.floor(best / GRID_N), count: g.tiles.length });
  }
  return out;
}

// Lots (grown buildings) per district: `lots` is state.lots, each entry starts with its tile index.
export function lotsByDistrict(layer, lots) {
  const out = new Map();
  for (const l of lots) {
    const s = layer[l[0]];
    if (s) out.set(s, (out.get(s) || 0) + 1);
  }
  return out;
}
