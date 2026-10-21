// Districts: name a neighbourhood, paint its tiles, and it gets a flag and a name over the town. Free to use.
// Owns grid.district and the saved fields `districts`, `dmap`, `dseed`, `drev`. Rules and encoding: src/world/districts.js.
import { GRID_N, BASE, inBounds, rectTiles, tileIndex } from '../../world/grid.js';
import {
  MAX_DISTRICTS, FLAG_STYLES, DISTRICT_COLORS, isSlot, nameFor, cleanName, encodeDistricts, decodeDistricts, validDistrictString,
} from '../../world/districts.js';

const AREA = GRID_N * GRID_N;
const tileArg = (t) => Array.isArray(t) && t.length === 2 && Number.isInteger(t[0]) && Number.isInteger(t[1]) && inBounds(t[0], t[1]);
const clampInt = (v, lo, hi, d) => (Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : d);
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

// Undo for district paint and erase: the old slot goes back on each tile. Free, so no coins move.
function revertDistricts({ grid, state }, prev) {
  for (const [i, slot] of prev) grid.district[i] = slot;
  state.dmap = encodeDistricts(grid.district); state.drev++;
}

export default {
  id: 'districts',
  state: () => ({ districts: [], dmap: '0'.repeat(AREA), dseed: 1, drev: 0 }),
  sanitize(raw) {
    const districts = [];
    const seen = new Set();
    if (Array.isArray(raw.districts)) {
      for (const d of raw.districts.slice(0, MAX_DISTRICTS)) {
        if (!isObj(d) || !isSlot(d.slot) || seen.has(d.slot)) continue;
        seen.add(d.slot);
        const name = cleanName(d.name) || nameFor(d.slot);
        districts.push({ slot: d.slot, name, pal: clampInt(d.pal, 0, DISTRICT_COLORS.length - 1, 0), style: clampInt(d.style, 0, FLAG_STYLES - 1, 0) });
      }
    }
    // Tiles that name a district that no longer exists are cleared on load.
    let dmap = validDistrictString(raw.dmap) ? raw.dmap : '0'.repeat(AREA);
    if (dmap !== '0'.repeat(AREA)) dmap = [...dmap].map((c) => (seen.has(parseInt(c, 16)) ? c : '0')).join('');
    return {
      districts, dmap,
      dseed: clampInt(raw.dseed, 1, 1e9, 1),
      drev: 0,
    };
  },

  // Rebuild the layer from saved state. Safe to run again after a Renewal: the layer is cleared first.
  init({ grid, state }) {
    grid.district.fill(0);
    decodeDistricts(state.dmap, grid.district);
    const known = new Set(state.districts.map((d) => d.slot));
    for (let i = 0; i < AREA; i++) {
      const s = grid.district[i];
      if (s && (!known.has(s) || grid.base[i] === BASE.WATER)) grid.district[i] = 0;
    }
    state.dmap = encodeDistricts(grid.district);
  },

  beforeSave(ctx) {
    ctx.state.dmap = encodeDistricts(ctx.grid.district);
  },

  commands: {
    // A new district takes the first free slot and a generated name. Nothing to pay.
    newDistrict(ctx) {
      const { state, emit } = ctx;
      if (state.districts.length >= MAX_DISTRICTS) { emit({ type: 'toast', text: 'All ' + MAX_DISTRICTS + ' districts have names already' }); return; }
      const used = new Set(state.districts.map((d) => d.slot));
      let slot = 1;
      while (used.has(slot)) slot++;
      const seed = state.dseed++;
      const name = freshName(state, seed);
      state.districts.push({ slot, name, pal: seed % DISTRICT_COLORS.length, style: (seed * 3) % FLAG_STYLES });
      state.drev++;
      emit({ type: 'toast', text: name + ' is named. Drag on the map to paint it.' });
    },

    // Paint the rectangle between tiles a and b with a district slot. Water is never painted.
    paintDistrict(ctx, { slot, a, b }) {
      const { state, grid, emit } = ctx;
      if (!isSlot(slot) || !tileArg(a) || !tileArg(b) || !state.districts.some((d) => d.slot === slot)) return;
      let changed = 0, water = 0;
      const prev = [];
      for (const [gx, gz] of rectTiles(a, b)) {
        const i = tileIndex(gx, gz);
        if (grid.base[i] === BASE.WATER) { water++; continue; }
        if (grid.district[i] !== slot) { prev.push([i, grid.district[i]]); grid.district[i] = slot; changed++; }
      }
      if (!changed) { if (water) emit({ type: 'toast', text: 'Rivers and ponds keep their own names' }); return; }
      state.dmap = encodeDistricts(grid.district); state.drev++;
      ctx.sim.pushUndo({ revert: (c) => revertDistricts(c, prev) });
    },

    // Clear the district on every tile of the rectangle. Free.
    eraseDistrict(ctx, { a, b }) {
      const { state, grid } = ctx;
      if (!tileArg(a) || !tileArg(b)) return;
      let changed = 0;
      const prev = [];
      for (const [gx, gz] of rectTiles(a, b)) {
        const i = tileIndex(gx, gz);
        if (grid.district[i]) { prev.push([i, grid.district[i]]); grid.district[i] = 0; changed++; }
      }
      if (!changed) return;
      state.dmap = encodeDistricts(grid.district); state.drev++;
      ctx.sim.pushUndo({ revert: (c) => revertDistricts(c, prev) });
    },

    // A typed name is cleaned; an empty one gets a generated name instead.
    renameDistrict(ctx, { slot, name }) {
      const { state } = ctx;
      const d = state.districts.find((x) => x.slot === slot);
      if (!d) return;
      d.name = cleanName(name) || freshName(state, state.dseed++);
      state.drev++;
    },

    // Same slot, new generated name. The flag stays.
    shuffleDistrictName(ctx, { slot }) {
      const { state } = ctx;
      const d = state.districts.find((x) => x.slot === slot);
      if (!d) return;
      d.name = freshName(state, state.dseed++);
      state.drev++;
    },

    // Removes the district and clears its tiles. Its name is gone with it.
    deleteDistrict(ctx, { slot }) {
      const { state, grid, emit } = ctx;
      const at = state.districts.findIndex((x) => x.slot === slot);
      if (at < 0) return;
      const [gone] = state.districts.splice(at, 1);
      for (let i = 0; i < AREA; i++) if (grid.district[i] === slot) grid.district[i] = 0;
      state.dmap = encodeDistricts(grid.district); state.drev++;
      emit({ type: 'toast', text: gone.name + ' has been folded into the town' });
    },
  },
};

// A name no other district uses. Tries a few seeds, then adds a numeral.
function freshName(state, seed) {
  const taken = new Set(state.districts.map((d) => d.name));
  for (let k = 0; k < 12; k++) {
    const n = nameFor(seed + k * 101);
    if (!taken.has(n)) return n;
  }
  return nameFor(seed) + ' ' + (state.districts.length + 1);
}
