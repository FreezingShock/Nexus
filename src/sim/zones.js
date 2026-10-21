// Zone data and the pure rules around it: costs, saved encoding, demand, income. No DOM, no THREE.
import { GRID_N } from '../world/grid.js';

export const ZONE_COUNT = 4;
export const MAX_LOT_LEVEL = 3;
export const ROAD_REACH = 2; // buildings only grow when a road is within this many tiles

// paint = the tint on the map; coins = cost per tile; income = coins per second per building level
export const ZONE_DEFS = [
  null,
  { id: 1, key: 'res', name: 'Residential', paint: '#8FCB9B', swatch: '#BFD8C4', cost: 5,  income: 0.40, sub: 'Homes and terraces grow here' },
  { id: 2, key: 'com', name: 'Commercial',  paint: '#EE9F8D', swatch: '#E9C1B8', cost: 8,  income: 0.70, sub: 'Shop rows with awnings' },
  { id: 3, key: 'ind', name: 'Industrial',  paint: '#E2C07C', swatch: '#E7D8BF', cost: 6,  income: 0.55, sub: 'Workshops and yards' },
  { id: 4, key: 'civ', name: 'Civic',       paint: '#8DBEDD', swatch: '#DCE8EC', cost: 12, income: 0.10, sub: 'Halls and squares' },
];

const AREA = GRID_N * GRID_N;

export const encodeZones = (zone) => {
  let s = '';
  for (let i = 0; i < AREA; i += 512) s += String.fromCharCode.apply(null, Array.from(zone.subarray(i, i + 512), (v) => 48 + v));
  return s;
};
export const validZonesString = (s) => typeof s === 'string' && s.length === AREA && /^[0-4]+$/.test(s);
export function decodeZones(str, out) {
  for (let i = 0; i < AREA; i++) out[i] = str.charCodeAt(i) - 48;
  return out;
}

// Resumable random stream kept in saved state, so growth is the same after a reload.
export function nextRand(state) {
  state.gseed = (state.gseed + 0x6D2B79F5) >>> 0;
  let t = state.gseed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// lots: [[tileIndex, level, seed], ...] with the zone of each taken from `zones` (string or Uint8Array)
export function lotStats(lots, zoneAt) {
  const s = { pop: 0, com: 0, ind: 0, civ: 0, count: lots.length, byZone: [0, 0, 0, 0, 0] };
  for (const [i, level] of lots) {
    const z = zoneAt(i);
    s.byZone[z]++;
    if (z === 1) s.pop += 4 * level; else if (z === 2) s.com += 3 * level; else if (z === 3) s.ind += 4 * level; else if (z === 4) s.civ += level;
  }
  return s;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Demand per zone in [0.15, 1]. Never zero: growth only slows down, it never stops.
export function demandOf(s) {
  const jobs = s.com + s.ind;
  return [
    0,
    clamp(0.5 + 0.5 * (jobs + 6 - s.pop) / (jobs + s.pop + 12), 0.15, 1),
    clamp(0.5 + 0.5 * (s.pop * 0.6 + 3 - s.com) / (s.pop * 0.6 + s.com + 6), 0.15, 1),
    clamp(0.5 + 0.5 * (s.pop * 0.4 + 3 - s.ind) / (s.pop * 0.4 + s.ind + 6), 0.15, 1),
    clamp(s.pop / 80, 0.2, 0.8),
  ];
}

export function lotIncome(lots, zoneAt) {
  let r = 0;
  for (const [i, level] of lots) { const d = ZONE_DEFS[zoneAt(i)]; if (d) r += d.income * level; }
  return r;
}
