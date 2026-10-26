// Decorations: small things to dress the town with. Pure data and rules: no DOM, no THREE.
// A decoration is a record { id, k, gx, gz, rot } in state.decor. It sits on one open land tile and is only for looks.
// Prices are in coins per piece; `parts` is a one-time Parts unlock for the rarer kinds (Parts are spent once, then Coins buy each copy).
import { BASE, GRID_N } from './grid.js';

export const MAX_DECOR = 400;
export const MAX_DRAG = 60; // tiles one drag can dress at once
export const REFUND = 0.5;  // share of the base price handed back when a piece is cleared

// cost: coins for the first piece. parts: one-time Parts to unlock the kind (0 is open from the start).
// The numbers sit next to the 3x economy of BALANCE.priceMult: a bench is a cottage's worth of nothing, a gazebo a real project.
// Groups in the Decor menu, the way the Buildings menu groups its models.
export const DECOR_CATS = [
  { id: 'greenery', name: 'Greenery' },
  { id: 'street', name: 'Street' },
  { id: 'plaza', name: 'Plaza' },
  { id: 'landmark', name: 'Landmark' },
  { id: 'festive', name: 'Festive' },
];

export const DECOR = [
  { id: 'hedge', cat: 'greenery',     name: 'Hedge',        sub: 'A clipped green wall, lovely in rows', cost: 45,    parts: 0 },
  { id: 'bench', cat: 'street',     name: 'Bench',        sub: 'A place to sit and watch the street', cost: 60,    parts: 0 },
  { id: 'flowers', cat: 'greenery',   name: 'Flower bed',   sub: 'Tulips, daisies and a little soil',    cost: 90,    parts: 0 },
  { id: 'lamp', cat: 'street',      name: 'Street lamp',  sub: 'A warm lantern on a green post',       cost: 120,   parts: 0 },
  { id: 'topiary', cat: 'greenery',   name: 'Topiary',      sub: 'A tidy cloud of leaves in a pot',      cost: 240,   parts: 60 },
  { id: 'stall', cat: 'plaza',     name: 'Market stall', sub: 'A striped awning and a few crates',    cost: 420,   parts: 120 },
  { id: 'fountain', cat: 'plaza',  name: 'Fountain',     sub: 'Stone basin, tinkling water',          cost: 900,   parts: 240 },
  { id: 'statue', cat: 'landmark',    name: 'Statue',       sub: 'Somebody important, in bronze green',  cost: 1500,  parts: 450 },
  { id: 'gazebo', cat: 'landmark',    name: 'Gazebo',       sub: 'Six posts and a terracotta roof',      cost: 3600,  parts: 900 },
  // Festive extras (core/events.js): on sale only while their season is on, and yours for good once placed.
  { id: 'xmastree', cat: 'festive', event: 'christmas', name: 'Town Christmas tree', sub: 'A tall fir with a gold star and baubles', cost: 1200, parts: 0 },
  { id: 'gingerbread', cat: 'festive', event: 'christmas', name: 'Gingerbread stall', sub: 'Iced biscuits and hot cocoa', cost: 600, parts: 0 },
  { id: 'pumpkins', cat: 'festive', event: 'halloween', name: 'Pumpkin patch', sub: 'Big, small and a bit lumpy', cost: 300, parts: 0 },
  { id: 'scarecrow', cat: 'festive', event: 'halloween', name: 'Scarecrow', sub: 'Straw hat, patched coat, friendly face', cost: 240, parts: 0 },
  { id: 'bandstand', cat: 'festive', event: 'july4', name: 'Bandstand', sub: 'Bunting round a little round stage', cost: 900, parts: 0 },
  { id: 'picnic', cat: 'festive', event: 'july4', name: 'Picnic table', sub: 'A checked cloth and a pie', cost: 150, parts: 0 },
  // Keepsakes: a gift for playing on the real holiday (core/keepsakes.js). Once yours, on sale all year.
  { id: 'snowglobe', cat: 'festive', keepsake: 'christmas', name: 'Snow globe', sub: 'A keepsake from a real December', cost: 400, parts: 0 },
  { id: 'lanternpost', cat: 'festive', keepsake: 'halloween', name: "Jack-o'-lantern post", sub: 'A keepsake from a real October', cost: 300, parts: 0 },
  { id: 'summerbell', cat: 'festive', keepsake: 'july4', name: 'Summer bell', sub: 'A keepsake from a real Fourth of July week', cost: 400, parts: 0 },
].map((d) => Object.freeze(d));

const byId = new Map(DECOR.map((d) => [d.id, d]));
export const decorIn = (cat) => DECOR.filter((d) => d.cat === cat);
export const decorById = (id) => byId.get(id) || null;

// Each piece already placed makes the next a little dearer: +1% of the base price per piece, so a big garden is a real sink.
export const GROWTH = 0.01;
export const decorCost = (def, owned) => Math.round(def.cost * (1 + GROWTH * Math.max(0, owned | 0)));
export const decorRefund = (def) => Math.floor(def.cost * REFUND);
export const isOpen = (def, unlocks) => !def.parts || unlocks.includes(def.id);

// Whether a piece is on sale right now: Parts unlocks as above, a festive extra only in its season, a keepsake only once
// it is the town's. state needs decorUnlocks, event and keepsakes. Returns null when it is, or why not (a short line).
const SEASON_MONTH = { christmas: 'December', halloween: 'October', july4: 'July' };
export function offSale(def, state) {
  if (def.event && state.event !== def.event) return 'Back in ' + SEASON_MONTH[def.event];
  if (def.keepsake && !(state.keepsakes || []).includes(def.id)) return 'A keepsake: play in a real ' + (def.keepsake === 'july4' ? 'Fourth of July week' : SEASON_MONTH[def.keepsake]) + ' to keep it';
  return null;
}

// Why a tile cannot take a decoration, or null when it can. `taken` is a Set of tile indexes that already hold one.
export function problemAt(grid, gx, gz, taken) {
  if (!Number.isInteger(gx) || !Number.isInteger(gz) || gx < 0 || gz < 0 || gx >= GRID_N || gz >= GRID_N) return 'edge';
  if (grid.baseAt(gx, gz) !== BASE.LAND) return 'ground';
  if (grid.roadAt(gx, gz)) return 'road';
  if (grid.zoneAt(gx, gz) || grid.lotAt(gx, gz)) return 'built';
  if (taken && taken.has(gz * GRID_N + gx)) return 'decor';
  return null;
}
const TEXT = {
  edge: 'That is off the map',
  ground: 'Only open land takes decorations',
  road: 'Roads stay clear',
  built: 'That tile is zoned or built on',
  decor: 'Something is already there',
};
export const problemText = (p) => TEXT[p] || '';

export const takenSet = (list) => new Set(list.map((d) => d.gz * GRID_N + d.gx));

// Untrusted list in, well-formed list out: known kinds, in range, one per tile, at most MAX_DECOR. Ids are d1, d2, ...
export function sanitizeDecor(raw) {
  const out = [], used = new Set();
  let next = 1;
  for (const r of Array.isArray(raw) ? raw : []) {
    if (out.length >= MAX_DECOR || !r || !byId.has(r.k)) continue;
    const { gx, gz } = r;
    if (!Number.isInteger(gx) || !Number.isInteger(gz) || gx < 0 || gz < 0 || gx >= GRID_N || gz >= GRID_N) continue;
    const i = gz * GRID_N + gx;
    if (used.has(i)) continue;
    used.add(i);
    const m = /^d(\d+)$/.exec(String(r.id));
    const id = m ? 'd' + Number(m[1]) : 'd' + next;
    next = Math.max(next, Number(id.slice(1)) + 1);
    out.push({ id, k: r.k, gx, gz, rot: Number.isInteger(r.rot) ? ((r.rot % 4) + 4) % 4 : 0 });
  }
  return out;
}
export const sanitizeUnlocks = (raw) => (Array.isArray(raw) ? [...new Set(raw.filter((k) => byId.has(k) && byId.get(k).parts))] : []);
