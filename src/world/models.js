// Building models as plain data: what exists, what sizes it fits, how a record becomes a drawable description.
// Pure: no DOM, no THREE. The render side (src/render/models) turns a description into geometry.
// The design language that goes with this lives in docs/BUILDINGS.md.
import { makeRng } from './rng.js';
import { TILE, GRID_HALF } from './grid.js';
import { heightAt } from './terrain.js';
import { BALANCE } from '../sim/balance.js';
import { PAL, ROOFS, TRIMS } from './palettes.js';

export const LANG = {
  FLOOR_H: 1.1,     // one storey, world units
  PLINTH: 0.25,     // stone base every building stands on
  MARGIN: 0.4,      // gap between a footprint's edge and the walls, so streets and neighbours breathe
  BAY: 1.5,         // window rhythm: one bay per 1.5 units of wall
  MAX_LEVEL: 5,
};

// Categories shown in the placement flyout. `tool` is the toolbar button that lists them.
export const CATEGORIES = [
  { id: 'home', name: 'Homes', tool: 'build' },
  { id: 'shop', name: 'Shops', tool: 'build' },
  { id: 'work', name: 'Workplaces', tool: 'build' },
  { id: 'farm', name: 'Farms', tool: 'build' },
  { id: 'landmark', name: 'Landmarks', tool: 'build' },
  { id: 'service', name: 'Services', tool: 'services' },
  { id: 'park', name: 'Parks', tool: 'parks' },
];

// foot: footprints the model was drawn for, in tiles [across, deep]. A model can be turned, so [1, 2] also means 2 x 1.
// tile: 'row' means the model repeats as side-by-side units along its long side (terraces, shop rows), so any 1 x n works.
// floors: [min, max] storeys on a 1 x 1 lot; `grow` adds storeys per extra tile of area.
// cost: coins for a 1 x 1 lot, multiplied by the lot's area.
// styles: optional, window styles the seed picks from (the same four wall textures, so no new materials).
export const MODELS = [
  { id: 'cottage',      name: 'Cottage',        cat: 'home',     sub: 'Hipped roof, window boxes',        foot: [[1, 1]],                 floors: [1, 2], grow: 0.5,  cost: 90,   style: 'shutter' },
  { id: 'terrace',      name: 'Terrace house',  cat: 'home',     sub: 'A row of narrow gables',           foot: [[1, 1], [1, 2]], tile: 'row', floors: [2, 3], grow: 0.4, cost: 120, style: 'sash' },
  { id: 'mansard',      name: 'Mansard block',  cat: 'home',     sub: 'Dormers and a slate crown',        foot: [[1, 1], [1, 2], [2, 2]], floors: [4, 6], grow: 0.8,  cost: 340,  style: 'arched' },
  { id: 'tower',        name: 'Tower block',    cat: 'home',     sub: 'Tall, with a rooftop garden',      foot: [[1, 1], [1, 2], [2, 2]], floors: [7, 9], grow: 1.2,  cost: 1200, style: 'ribbon' },
  { id: 'townhouse',    name: 'Townhouse',      cat: 'home',     sub: 'Stepped gable, tall and narrow',   foot: [[1, 1], [1, 2]],         floors: [3, 4], grow: 0.4,  cost: 220,  style: 'shutter', styles: ['shutter', 'sash', 'arched'] },
  { id: 'manor',        name: 'Manor house',    cat: 'home',     sub: 'Columns, corner turrets, a hip roof', foot: [[2, 2], [2, 3]],      floors: [3, 3], grow: 0.4,  cost: 700,  style: 'arched' },
  { id: 'apartments',   name: 'Garden flats',   cat: 'home',     sub: 'Stair core, balconies, roof planters', foot: [[2, 2], [2, 3]],     floors: [4, 5], grow: 0.5,  cost: 520,  style: 'ribbon' },
  { id: 'shop-row',     name: 'Shop row',       cat: 'shop',     sub: 'Awnings and planters',             foot: [[1, 1], [1, 2]], tile: 'row', floors: [2, 3], grow: 0.3, cost: 200, style: 'sash' },
  { id: 'bakery',       name: 'Bakery',         cat: 'shop',     sub: 'Warm oven chimney, a loaf sign',   foot: [[1, 1]],                 floors: [2, 2], grow: 0,    cost: 220,  style: 'sash', styles: ['sash', 'arched'] },
  { id: 'cafe',         name: 'Corner cafe',    cat: 'shop',     sub: 'Terrace tables and string lights', foot: [[1, 1]],                 floors: [2, 3], grow: 0,    cost: 260,  style: 'arched' },
  { id: 'department',   name: 'Department store', cat: 'shop',   sub: 'Arcade awnings, a glass dome',     foot: [[2, 2], [2, 3]],         floors: [3, 4], grow: 0.3,  cost: 900,  style: 'arched' },
  { id: 'market',       name: 'Market hall',    cat: 'shop',     sub: 'Open arches, a lantern roof',      foot: [[2, 2], [1, 2]],         floors: [1, 1], grow: 0,    cost: 520,  style: 'arched' },
  // A farm is production, not housing: a farmhouse, a barn and fields that fill every tile it claims. It is the one model
  // with no fixed sizes: `free` lets the player drag any lot from min (across x deep, in the model's own frame, so the
  // house always has room) up to max tiles a side, and the fields behind the fixed front repeat to fill it.
  // `perTile` makes its `floors` (the yield the income and upgrade curves read) grow with the area, uncapped. `flat` means level ground.
  { id: 'farm',         name: 'Farm',           cat: 'farm',     sub: 'A farmhouse, a barn and fields of crops', foot: [[2, 3]], floors: [1, 1], grow: 0, perTile: 0.5, cost: 45, style: 'sash', flat: true, free: { min: [2, 3], max: 24 } },
  { id: 'office',       name: 'Office block',   cat: 'work',     sub: 'Ribbon windows, stepped crown',    foot: [[1, 1], [1, 2], [2, 2]], floors: [4, 6], grow: 1,    cost: 560,  style: 'ribbon' },
  { id: 'workshop',     name: 'Workshop',       cat: 'work',     sub: 'Sawtooth roof and a chimney',      foot: [[1, 2], [2, 2]],         floors: [1, 2], grow: 0.3,  cost: 300,  style: 'sash' },
  { id: 'warehouse',    name: 'Warehouse',      cat: 'work',     sub: 'Big doors, plenty of room',        foot: [[1, 2], [2, 2]],         floors: [1, 2], grow: 0,    cost: 240,  style: 'ribbon' },
  { id: 'clinic',       name: 'Clinic',         cat: 'service',  sub: 'A calm place with a green cross',  foot: [[1, 1], [1, 2]],         floors: [2, 3], grow: 0.4,  cost: 400,  style: 'sash' },
  { id: 'school',       name: 'School',         cat: 'service',  sub: 'Bell tower and a flag',            foot: [[1, 2], [2, 2]],         floors: [2, 3], grow: 0.2,  cost: 520,  style: 'arched' },
  { id: 'fire-station', name: 'Fire station',   cat: 'service',  sub: 'Wide doors, a hose tower',         foot: [[1, 2], [2, 2]],         floors: [2, 2], grow: 0,    cost: 480,  style: 'arched' },
  { id: 'police',       name: 'Police station', cat: 'service',  sub: 'A steady blue lamp',               foot: [[1, 1], [1, 2]],         floors: [2, 3], grow: 0.3,  cost: 480,  style: 'sash' },
  { id: 'town-hall',    name: 'Town hall',      cat: 'landmark', sub: 'Clock tower over the square',      foot: [[2, 1], [2, 2]],         floors: [3, 3], grow: 0,    cost: 1800, style: 'arched' },
  { id: 'church',       name: 'Church',         cat: 'landmark', sub: 'A spire you can see from afar',    foot: [[1, 2], [2, 2]],         floors: [2, 2], grow: 0,    cost: 1500, style: 'arched' },
  // Parks have no storeys (floors 0): they are ground, not buildings. Their upgrade is refused in the upgrades system.
  { id: 'green',        name: 'Green',          cat: 'park',     sub: 'Lawn and trees',                   foot: [[1, 1], [2, 2]],         floors: [0, 0], grow: 0,    cost: 60,   style: 'sash' },
  { id: 'plaza',        name: 'Plaza',          cat: 'park',     sub: 'Paving, lamps and a fountain',     foot: [[1, 1], [2, 2]],         floors: [0, 0], grow: 0,    cost: 90,   style: 'sash' },
  { id: 'playground',   name: 'Playground',     cat: 'park',     sub: 'Swings and a little slide',        foot: [[1, 1], [1, 2]],         floors: [0, 0], grow: 0,    cost: 140,  style: 'sash' },
  { id: 'pond',         name: 'Pond',           cat: 'park',     sub: 'Water, reeds and a bench',         foot: [[2, 2]],                 floors: [0, 0], grow: 0,    cost: 180,  style: 'sash' },
];

// Prices are scaled once here, from BALANCE.priceMult (see balance.js).
for (const m of MODELS) m.cost = Math.round(m.cost * BALANCE.priceMult);

const byId = new Map(MODELS.map((m) => [m.id, m]));
export const modelById = (id) => byId.get(id) || null;
export const modelsIn = (cat) => MODELS.filter((m) => m.cat === cat);

// ---- footprints ----

// The sizes a model offers in the picker, as [across, deep] with across <= deep, plus 1 x 3 and 1 x 4 for row models.
export function footprintsOf(def) {
  const out = def.foot.map(([a, b]) => [Math.min(a, b), Math.max(a, b)]);
  if (def.tile === 'row') for (const n of [3, 4]) out.push([1, n]);
  return out;
}

// A picker size [a, b] (a <= b) as the [across, deep] dimensions the model is drawn in. Row models run their units
// across the front, so their long side goes across; every other model keeps its long side deep.
export const canonicalDims = (def, size) => (def.tile === 'row' ? [size[1], size[0]] : [size[0], size[1]]);

// Fits a model onto a requested lot of fw x fd tiles. The model may be turned, so only the shape matters.
// Returns { fw, fd, exact } where fw x fd is the footprint it will actually occupy (never larger than the lot,
// same orientation as the request), or null when the model does not fit at all.
//   exact: the lot is a size the model was drawn for (or a row of units)
//   otherwise: the largest drawn size that fits inside the lot; the caller centers it or leaves the rest open
export function fitFootprint(def, fw, fd) {
  if (def.free) { // any lot with a side of at least min[0], the other at least min[1], neither past max
    const [lo, hi] = [Math.min(fw, fd), Math.max(fw, fd)];
    return lo >= def.free.min[0] && hi >= def.free.min[1] && hi <= def.free.max ? { fw, fd, exact: true } : null;
  }
  const want = [fw, fd];
  const sizes = footprintsOf(def);
  const has = (a, b) => sizes.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  if (has(fw, fd)) return { fw, fd, exact: true };
  let best = null;
  for (const [x, y] of sizes) {
    for (const [a, b] of x === y ? [[x, y]] : [[x, y], [y, x]]) {
      if (a <= want[0] && b <= want[1] && (!best || a * b > best.fw * best.fd)) best = { fw: a, fd: b, exact: false };
    }
  }
  return best;
}

// Picks a model of a category for a lot, for growth and for hand placement with "any". Deterministic in `seed`.
// Prefers models drawn for exactly that size, then the ones that fit with the least waste.
export function pickModelForLot(cat, fw, fd, seed = 0) {
  const fits = modelsIn(cat).map((def) => ({ def, fit: fitFootprint(def, fw, fd) })).filter((x) => x.fit);
  if (!fits.length) return null;
  const score = (x) => (x.fit.exact ? 1000 : 0) + x.fit.fw * x.fit.fd;
  const top = Math.max(...fits.map(score));
  const best = fits.filter((x) => score(x) === top);
  return { def: best[(seed >>> 0) % best.length].def, fit: best[(seed >>> 0) % best.length].fit };
}

export const areaCost = (def, fw, fd) => Math.round(def.cost * fw * fd);
// Storeys (a farm's yield) a model reaches at its lowest roll on a lot of `area` tiles. The menus show it as the starting income.
export const floorsFor = (def, area, roll = 0) => (def.perTile ? Math.max(1, Math.round(area * def.perTile)) : Math.min(12, def.floors[0] + roll + Math.min(6, Math.floor(def.grow * (area - 1) + 0.0001))));

// ---- seeds and traits ----

// FNV-1a: a stable seed for a string id, so a saved building always rebuilds to the same shape.
export function seedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Twelve fixed rolls per building. Every builder reads the same slots, and the level never changes them,
// so upgrading adds details to the same building instead of re-rolling it.
export function traitsOf(seed) {
  const r = makeRng(seed | 0), t = [];
  for (let i = 0; i < 12; i++) t.push(r());
  return t;
}

const PAL_KEYS = ['warm', 'pastel', 'slate', 'green'];

// ---- descriptions ----

// A placed building record is { id, model, gx, gz, fw, fd, rot, seed, pal?, floors? }.
//   gx, gz: the lowest tile; fw x fd: tiles occupied on the grid (after turning)
//   rot:    quarter turns (0..3); the front faces +z at rot 0
// describe() turns it into everything the renderer needs. It is a pure function of the record and the level.
// Where a lot of fw x fd tiles centred on (x, z) stands: y, its level pad (on the highest corner, so a building on a slope
// never sinks), and lo, the lowest ground round its edge. Where y is well above lo the lot is a hillside terrace and a stone
// retaining wall runs down to the ground (render/systems/terraces.js); the kit's own foundation covers gentle slopes.
export function standOn(x, z, fw, fd) {
  let y = 0.1, lo = Infinity;
  const hx = fw * TILE / 2, hz = fd * TILE / 2;
  for (const [ox, oz] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) y = Math.max(y, heightAt(x + ox * hx, z + oz * hz) + 0.05);
  for (const [ox, oz] of [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]) lo = Math.min(lo, Math.max(0, heightAt(x + ox * hx, z + oz * hz)));
  return { y, lo };
}

export function describe(rec, level = 1) {
  const def = byId.get(rec.model);
  if (!def) return null;
  const seed = rec.seed ?? seedOf(rec.id), t = traitsOf(seed);
  const rot = ((rec.rot ?? 0) % 4 + 4) % 4;
  const cw = rot % 2 ? rec.fd : rec.fw, cd = rot % 2 ? rec.fw : rec.fd; // footprint in the model's own frame
  const area = rec.fw * rec.fd;
  const [lo, hi] = def.floors;
  const floors = rec.floors ?? floorsFor(def, area, Math.floor(t[0] * (hi - lo + 1)));
  const x = (rec.gx + (rec.fw - 1) / 2 - GRID_HALF) * TILE, z = (rec.gz + (rec.fd - 1) / 2 - GRID_HALF) * TILE;
  const { y } = standOn(x, z, rec.fw, rec.fd);
  return {
    id: rec.id, model: def.id, name: def.name, cat: def.cat,
    style: def.styles ? def.styles[Math.floor(t[2] * def.styles.length)] : def.style,   // a few models wear one of several window styles, picked by the seed
    seed, t, level, rot, floors, fw: rec.fw, fd: rec.fd, cw, cd,
    w: cw * TILE - LANG.MARGIN, d: cd * TILE - LANG.MARGIN,
    x, y, z,
    rotY: rot * Math.PI / 2,
    pal: PAL[rec.pal] ? rec.pal : PAL_KEYS[Math.floor(t[1] * 4)],
    roof: ROOFS[rec.roof] ? rec.roof : null,
    trim: TRIMS[rec.trim] ? rec.trim : null,
  };
}
