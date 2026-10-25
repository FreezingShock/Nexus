// Zoning: paint zones on grid tiles, buildings grow into painted tiles that sit directly beside a road.
// Owns grid.zone and grid.lot. Reads grid.road (the road system owns it). See docs/GRID.md.
import { GRID_N, BASE, inBounds, rectTiles, tileIndex, tileOf } from '../../world/grid.js';
import { putTrees, takeOnTiles } from '../../world/trees.js';
import {
  ZONE_DEFS, ZONE_COUNT, MAX_LOT_LEVEL, PLACED_LOT_MIN, encodeZones, decodeZones, validZonesString,
  nextRand, lotStats, demandOf, lotIncome, lotParts,
} from '../zones.js';
import { lotDescription, lotTileOf } from '../../world/lots.js';

const AREA = GRID_N * GRID_N;
// Undo for zone paint and erase: old zones go back on their tiles, lots the erase took come back,
// trees that paint cleared come back, and paint's coins are refunded.
function revertZones(ctx, prev, refund = 0, lots = [], trees = []) {
  const { grid, state, refresh, sim, syncDisplay } = ctx;
  for (const [i, z] of prev) grid.zone[i] = z;
  for (const l of lots) { if (!state.lots.some(([j]) => j === l[0])) state.lots.push(l); grid.lot[l[0]] = l[0] + 1; }
  state.trees = putTrees(state.trees, trees);
  if (refund) { state.coins += refund; syncDisplay(); }
  state.zones = encodeZones(grid.zone); state.zoneRev++; sim.zoning.painted = countPaint(grid); refresh();
}
const tileArg = (t) => Array.isArray(t) && t.length === 2 && Number.isInteger(t[0]) && Number.isInteger(t[1]) && inBounds(t[0], t[1]);

export default {
  id: 'zoning',
  state: () => ({ zones: '0'.repeat(AREA), lots: [], gseed: 20241021, zoneRev: 0 }),
  sanitize(raw) {
    const out = { zones: validZonesString(raw.zones) ? raw.zones : '0'.repeat(AREA), lots: [], gseed: Number.isInteger(raw.gseed) ? raw.gseed >>> 0 : 20241021, zoneRev: 0 };
    const seen = new Set();
    if (Array.isArray(raw.lots)) {
      for (const l of raw.lots.slice(0, AREA)) {
        if (!Array.isArray(l) || !Number.isInteger(l[0]) || l[0] < 0 || l[0] >= AREA || seen.has(l[0])) continue;
        seen.add(l[0]);
        out.lots.push([l[0], Math.min(MAX_LOT_LEVEL, Math.max(1, Number.isInteger(l[1]) ? l[1] : 1)), Number.isInteger(l[2]) ? l[2] >>> 0 : 0]);
      }
    }
    return out;
  },

  // Build the grid layers from saved state, dropping anything that no longer fits the ground.
  init(ctx) {
    const { grid, state, sim } = ctx;
    const zoneAt = (i) => grid.zone[i];
    decodeZones(state.zones, grid.zone);
    // Steep ground keeps its zones: the terrain tools may tilt a street of homes, and they ride along (systems/land.js).
    for (let i = 0; i < AREA; i++) if (grid.zone[i] && ((grid.base[i] !== BASE.LAND && grid.base[i] !== BASE.STEEP) || grid.road[i])) grid.zone[i] = 0;
    state.lots = state.lots.filter(([i]) => grid.zone[i]);
    for (const [i] of state.lots) grid.lot[i] = i + 1;
    state.zones = encodeZones(grid.zone);
    sim.zoning = {
      painted: 0, // tiles with zone paint; lets the tick do nothing at all in an unzoned town
      stats: () => lotStats(state.lots, zoneAt),
      demand: () => demandOf(lotStats(state.lots, zoneAt)),
      costOf: (zone, tiles) => (ZONE_DEFS[zone] ? ZONE_DEFS[zone].cost * tiles : 0),
      candidates: () => candidates(grid),
    };
    sim.zoning.painted = countPaint(grid);
    // A grown lot answers to its id (lot<tile>) like a placed building: the inspect card, upgrade and bulldoze read it
    // through sim.building and sim.alive. Other ids fall through to the placement system (or the bare sim).
    if (!sim.lotsHooked) {
      sim.lotsHooked = true;
      const base = { building: sim.building, alive: sim.alive };
      const lotOf = (id) => {
        const i = lotTileOf(id);
        if (i === null || !grid.zone[i]) return null;
        return state.lots.find(([j]) => j === i) || null;
      };
      sim.building = (id) => {
        const l = lotOf(id);
        if (!l) return base.building(id);
        const d = lotDescription(grid.zone[l[0]], l[1], l[2], l[0], (x, z) => grid.roadAt(x, z) !== 0, state.townPaint);
        return d && { ...d, income: ZONE_DEFS[grid.zone[l[0]]].income * l[1] }; // what this lot pays at its level
      };
      sim.alive = (id) => (lotTileOf(id) !== null ? lotOf(id) !== null : base.alive(id));
    }
  },

  rate: ({ grid, state }) => lotIncome(state.lots, (i) => grid.zone[i]),
  partsRate: ({ grid, state }) => lotParts(state.lots, (i) => grid.zone[i]),

  // A road drawn over paint clears the grid but not the saved layer. Rebuild the saved zones and lots before saving.
  beforeSave(ctx) {
    reconcile(ctx);
    ctx.state.zones = encodeZones(ctx.grid.zone);
  },

  commands: {
    // Paint the rectangle between tiles a and b. Costs per painted tile; stops when coins run out.
    paintZone(ctx, { zone, a, b }) {
      const { grid, state, emit, note, refresh, charge } = ctx;
      const def = ZONE_DEFS[zone];
      if (!def || !tileArg(a) || !tileArg(b)) return;
      const todo = [];
      let blocked = 0;
      for (const [gx, gz] of rectTiles(a, b)) {
        const i = tileIndex(gx, gz);
        if (!grid.isOpen(gx, gz)) { blocked++; continue; }
        if (grid.zone[i] !== zone) todo.push(i);
      }
      if (!todo.length) { emit({ type: 'toast', text: blocked ? 'Only open ground can be zoned' : 'Already painted' }); return; }
      const afford = Math.min(todo.length, Math.floor(state.coins / def.cost));
      if (afford < 1) { emit({ type: 'toast', text: 'Not enough coins for a ' + def.name.toLowerCase() + ' tile (' + def.cost + ')' }); return; }
      if (!charge(afford * def.cost)) return;
      let noRoad = 0;
      const prev = [], painted = new Set();
      for (let k = 0; k < afford; k++) {
        const i = todo[k];
        prev.push([i, grid.zone[i]]);
        grid.zone[i] = zone;
        painted.add(i);
        const [gx, gz] = tileOf(i);
        if (!grid.roadBeside(gx, gz)) noRoad++;
      }
      // Trees on painted ground give way; undo puts them back.
      const tk = takeOnTiles(state.trees, painted);
      if (tk.taken.length) state.trees = tk.kept;
      state.zones = encodeZones(grid.zone); state.zoneRev++; ctx.sim.zoning.painted = countPaint(grid); refresh(); note('zone', def.name);
      ctx.sim.pushUndo({ revert: (c) => revertZones(c, prev, afford * def.cost, [], tk.taken) });
      let text = 'Painted ' + afford + ' ' + def.name.toLowerCase() + ' tile' + (afford > 1 ? 's' : '') + ' · ' + afford * def.cost + ' coins';
      if (afford < todo.length) text += ' · coins ran out';
      else if (noRoad) text += ' · ' + noRoad + (noRoad > 1 ? ' tiles stay' : ' tile stays') + ' empty until a road runs beside ' + (noRoad > 1 ? 'them' : 'it');
      if (tk.taken.length) text += ' · ' + tk.taken.length + ' tree' + (tk.taken.length > 1 ? 's' : '') + ' cleared';
      emit({ type: 'zonePainted', zone, n: afford, cost: afford * def.cost, noRoad, text });
    },

    // Erase zone paint (and any building grown on it) in the rectangle. Free.
    clearZone(ctx, { a, b }) {
      const { grid, state, emit, refresh } = ctx;
      if (!tileArg(a) || !tileArg(b)) return;
      let tiles = 0, homes = 0;
      const dead = new Set(), prev = [], lost = [];
      for (const [gx, gz] of rectTiles(a, b)) {
        const i = tileIndex(gx, gz);
        if (!grid.zone[i]) continue;
        tiles++;
        prev.push([i, grid.zone[i]]);
        if (grid.lot[i] === i + 1) { homes++; dead.add(i); grid.lot[i] = 0; const l = state.lots.find(([j]) => j === i); if (l) lost.push(l.slice()); } // a grown lot; placed buildings (>= PLACED_LOT_MIN) stay
        grid.zone[i] = 0;
      }
      if (!tiles) return;
      if (dead.size) state.lots = state.lots.filter(([i]) => !dead.has(i));
      ctx.sim.pushUndo({ revert: (c) => revertZones(c, prev, 0, lost) });
      state.zones = encodeZones(grid.zone); state.zoneRev++; ctx.sim.zoning.painted = countPaint(grid); refresh();
      emit({ type: 'zoneCleared', n: tiles, text: 'Cleared ' + tiles + ' tile' + (tiles > 1 ? 's' : '') + (homes ? ' and ' + homes + ' building' + (homes > 1 ? 's' : '') : '') });
    },
  },

  tick(ctx) {
    const { grid, state, refresh } = ctx;
    if (!ctx.sim.zoning.painted) return;
    reconcile(ctx);
    const cand = candidates(grid);
    const stats = lotStats(state.lots, (i) => grid.zone[i]);
    const dem = demandOf(stats);
    let changed = false;
    for (let z = 1; z <= ZONE_COUNT; z++) {
      const list = cand[z];
      if (!list.length) continue;
      const tries = 1 + Math.floor(list.length / 20);
      for (let k = 0; k < tries && list.length; k++) {
        if (nextRand(state) >= dem[z] * 0.7 * growthMul(ctx)) continue;
        spawn(ctx, list.splice(Math.floor(nextRand(state) * list.length), 1)[0]);
        changed = true;
      }
    }
    // level up: a few random buildings per tick
    const n = state.lots.length;
    for (let k = 0, tries = n ? 1 + Math.floor(n / 15) : 0; k < tries; k++) {
      const lot = state.lots[Math.floor(nextRand(state) * n)];
      if (lot[1] < MAX_LOT_LEVEL && nextRand(state) < 0.25 * dem[grid.zone[lot[0]]]) { lot[1]++; changed = true; }
    }
    if (changed) { state.zoneRev++; refresh(); }
  },

  // Closed-form growth for time away: no tick loop. Fills candidates up to a pace, then spreads level-ups.
  offline(ctx, seconds) {
    const { grid, state, refresh } = ctx;
    if (!ctx.sim.zoning.painted) return;
    reconcile(ctx);
    const cand = candidates(grid);
    const stats = lotStats(state.lots, (i) => grid.zone[i]);
    const dem = demandOf(stats);
    for (let z = 1; z <= ZONE_COUNT; z++) {
      const list = cand[z];
      const n = Math.min(list.length, Math.floor(seconds * dem[z] * 0.35 * (1 + list.length / 20) * growthMul(ctx)));
      for (let k = 0; k < n; k++) spawn(ctx, list.splice(Math.floor(nextRand(state) * list.length), 1)[0]);
    }
    const gain = Math.floor(seconds * 0.01);
    for (const lot of state.lots) lot[1] = Math.min(MAX_LOT_LEVEL, lot[1] + Math.floor(Math.min(gain, MAX_LOT_LEVEL) * nextRand(state) + 0.5));
    state.zoneRev++; refresh();
  },
};

// Drop paint that a road now covers, and buildings whose paint is gone.
function reconcile({ sim, grid, state }) {
  let dirty = false;
  // paint under a road or under a player-placed building is dropped; the building or road stays
  for (let i = 0; i < AREA; i++) if (grid.zone[i] && (grid.road[i] || grid.lot[i] >= PLACED_LOT_MIN)) { grid.zone[i] = 0; dirty = true; }
  if (dirty || state.lots.some(([i]) => !grid.zone[i])) {
    state.lots = state.lots.filter(([i]) => { const keep = grid.zone[i] > 0; if (!keep && grid.lot[i] === i + 1) grid.lot[i] = 0; return keep; });
    state.zones = encodeZones(grid.zone); state.zoneRev++;
    sim.zoning.painted = countPaint(grid);
  }
}
// Happiness from services and parks speeds growth up or down a little (see src/sim/services.js). 1 without them.
const growthMul = ({ sim }) => (sim.services ? sim.services.growth() : 1);
function countPaint(grid) { let n = 0; for (let i = 0; i < AREA; i++) if (grid.zone[i]) n++; return n; }

// Painted, empty tiles with a road directly beside them, per zone. Paint away from a street stays painted and empty;
// lots that already grew keep standing if their street later goes (nothing here demolishes them).
function candidates(grid) {
  const out = [[], [], [], [], []];
  for (let i = 0; i < AREA; i++) {
    const z = grid.zone[i];
    if (!z || grid.lot[i]) continue;
    if (grid.roadBeside(i % GRID_N, (i / GRID_N) | 0)) out[z].unshift(i);
  }
  return out;
}

function spawn({ grid, state }, i) {
  state.lots.push([i, 1, (nextRand(state) * 4294967296) >>> 0]);
  grid.lot[i] = i + 1;
}
