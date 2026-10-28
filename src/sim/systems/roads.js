// Roads on the shared tile grid: routed drawing (see src/world/roadnet.js), bulldozing, undo and the Parts unlocks.
// Saved: state.roads (see src/world/roadnet.js) and state.roadUnlocks. The grid's `road` layer is rebuilt from them.
import { ROAD_TYPES } from '../catalog.js';
import { GRID_N, tileIndex } from '../../world/grid.js';
import { starterProtected } from '../../world/starter.js';
import { putTrees, takeOnTiles } from '../../world/trees.js';
import { MAX_STROKE, ROAD_IDS, ROAD_KIND, BLOCK_TEXT, planStroke, roadBlock, starterRoads } from '../../world/roadnet.js';
import { gradeRoute } from '../../world/grade.js';
import { editable } from '../../world/land.js';
import { terrainSeed } from '../../world/terrain.js';
import { applyMoves, landPrice, restore } from './land.js';
import { encodeZones, ZONE_DEFS } from '../zones.js';
import { strandedAfter } from '../../world/road-zones.js';

const UNDO_DEPTH = 24;
const PROTECTED = starterProtected();   // the bridge and the road into the tunnel: bulldozing refuses them
const typeOf = (id) => ROAD_TYPES.find((r) => r.id === id);
const costOf = (id) => (typeOf(id) ? typeOf(id).cost : 0);
const isTile = (t) => Array.isArray(t) && Number.isInteger(t[0]) && Number.isInteger(t[1]);

const gradeFor = (state, path) => { const key = String(terrainSeed()); return gradeRoute(path, state.roads, (i, j) => !editable(i, j, key)); };

function syncGrid({ grid, state }) {
  grid.road.fill(0);
  for (const [k, r] of Object.entries(state.roads)) grid.road[Number(k)] = ROAD_KIND[r.t];
}

// Writes a planned stroke: charges, records the undo step, moves trees and zone paint out of the way, tells the world.
// `grade` (world/grade.js): the earthworks a climbing road needs, paid with the road and undone with it.
function layRoad(ctx, plan, kind, grade = null) {
  const { state, grid, emit, note, charge, sim, refresh } = ctx;
  if (!plan.tiles.length) return;
  const works = grade ? landPrice(grade.earth) : 0;
  if (!charge(plan.cost + works)) return;
  const land = grade && grade.moves.size ? applyMoves(ctx, grade.moves) : null;
  const next = { ...state.roads }, prev = [], zones = [], lots = [];
  for (const e of plan.tiles) {
    prev.push({ idx: e.idx, old: e.old });
    const rec = { t: e.t, p: (e.old ? e.old.p : 0) + e.price };
    if (e.d !== undefined) rec.d = e.d;
    next[e.idx] = rec;
    grid.road[e.idx] = ROAD_KIND[e.t];
    // Paint under the road goes, and a grown house with it; the undo step keeps both so they come back together.
    if (grid.zone[e.idx]) { zones.push([e.idx, grid.zone[e.idx]]); grid.zone[e.idx] = 0; }
    if (grid.lot[e.idx] === e.idx + 1) { const l = state.lots.find(([j]) => j === e.idx); if (l) lots.push(l.slice()); grid.lot[e.idx] = 0; }
  }
  if (lots.length) state.lots = state.lots.filter(([j]) => !lots.some((l) => l[0] === j));
  if (zones.length) { state.zones = encodeZones(grid.zone); state.zoneRev++; sim.zoning?.recount?.(); refresh(); }
  state.roads = next;
  // Trees on the new road give way; the undo step brings them back.
  const tk = takeOnTiles(state.trees, new Set(plan.tiles.map((e) => e.idx)));
  if (tk.taken.length) state.trees = tk.kept;
  sim.roadUndo.push({ prev, paid: plan.cost + works, trees: tk.taken, land, zones, lots, seq: sim.nextSeq() }); if (sim.roadUndo.length > UNDO_DEPTH) sim.roadUndo.shift();
  note('road');
  emit({ type: 'roadsChanged', kind, tiles: plan.tiles.map((e) => [e.gx, e.gz]), cost: plan.cost + works });
  if (lots.length) emit({ type: 'toast', text: lots.length + (lots.length > 1 ? ' buildings' : ' building') + ' cleared for the road' });
}

export default {
  id: 'roads',
  state: () => ({ roads: starterRoads(), roadUnlocks: [] }),
  sanitize(raw, fresh) {
    const roads = {};
    if (raw.roads && typeof raw.roads === 'object') {
      for (const [k, r] of Object.entries(raw.roads)) {
        const i = Number(k);
        if (!Number.isInteger(i) || i < 0 || i >= GRID_N * GRID_N || !r || !ROAD_IDS.includes(r.t)) continue;
        const rec = { t: r.t, p: Number.isFinite(r.p) ? Math.min(1e7, Math.max(0, r.p)) : 0 };
        if (r.t === 'one') rec.d = Number.isInteger(r.d) && r.d >= 0 && r.d < 4 ? r.d : 0;
        roads[i] = rec;
      }
    } else return { roads: fresh.roads, roadUnlocks: [] };
    const unlocks = Array.isArray(raw.roadUnlocks) ? raw.roadUnlocks.filter((id) => typeOf(id) && typeOf(id).unlockParts) : [];
    // Roads already on the map stay open: a tier added after a save was made never locks that save's streets.
    for (const r of Object.values(roads)) if (typeOf(r.t) && typeOf(r.t).unlockParts) unlocks.push(r.t);
    return { roads, roadUnlocks: [...new Set(unlocks)] };
  },
  init(ctx) {
    ctx.sim.roadUndo = []; syncGrid(ctx);
    // The coins a road along `path` would add for its earthworks, for the road tool's label.
    ctx.sim.roadWorks = (path) => landPrice(gradeFor(ctx.state, path).earth);
  },
  commands: {
    // path: ordered, 4-connected [gx, gz] tiles of one route (pivots joined by L legs). One-way roads follow the drawing direction.
    drawRoad(ctx, { roadType, path }) {
      const { state, grid, layout, emit } = ctx;
      const t = typeOf(roadType);
      if (!t || (t.unlockParts && !state.roadUnlocks.includes(t.id))) return;
      if (!Array.isArray(path) || !path.length || path.length > MAX_STROKE || !path.every(isTile)) return;
      for (let k = 1; k < path.length; k++) if (Math.abs(path[k][0] - path[k - 1][0]) + Math.abs(path[k][1] - path[k - 1][1]) !== 1) return;
      const plan = planStroke({ path, type: t.id, roads: state.roads, blockedBy: (gx, gz) => roadBlock(grid, layout, state, gx, gz), costOf });
      if (plan.problems.length) { emit({ type: 'toast', text: BLOCK_TEXT[plan.problems[0].reason] }); return; }
      layRoad(ctx, plan, 'draw', gradeFor(state, path));
    },

    // Replace mode: retype a run of existing street (paying the difference), or flip a one-way by passing its run the
    // other way round. Only tiles that already hold a road change, so the grid rules have nothing to check; the bridge
    // and the tunnel road keep their type.
    replaceRoad(ctx, { roadType, path }) {
      const { state } = ctx;
      const t = typeOf(roadType);
      if (!t || (t.unlockParts && !state.roadUnlocks.includes(t.id))) return;
      if (!Array.isArray(path) || !path.length || path.length > MAX_STROKE || !path.every(isTile)) return;
      for (let k = 1; k < path.length; k++) if (Math.abs(path[k][0] - path[k - 1][0]) + Math.abs(path[k][1] - path[k - 1][1]) !== 1) return;
      if (!path.every(([gx, gz]) => gx >= 0 && gz >= 0 && gx < GRID_N && gz < GRID_N && state.roads[tileIndex(gx, gz)])) return;
      const plan = planStroke({ path, type: t.id, roads: state.roads, costOf });
      plan.tiles = plan.tiles.filter((e) => !PROTECTED.has(e.idx));
      plan.cost = plan.tiles.reduce((a, e) => a + e.price, 0);
      layRoad(ctx, plan, 'replace');
    },

    // tiles: [gx, gz] list. Half of what each tile cost comes back; the starter streets refund nothing. The bridge and the
    // tunnel road are skipped (PROTECTED), so a sweep across them removes only the rest.
    bulldozeRoad(ctx, { tiles }) {
      const { state, grid, emit, sim, syncDisplay, refresh } = ctx;
      if (!Array.isArray(tiles) || tiles.length > MAX_STROKE * 2 || !tiles.every(isTile)) return;
      const next = { ...state.roads }, prev = [], gone = [];
      let refund = 0;
      for (const [gx, gz] of tiles) {
        const idx = tileIndex(gx, gz), old = next[idx];
        if (gx < 0 || gz < 0 || gx >= GRID_N || gz >= GRID_N || !old || PROTECTED.has(idx)) continue;
        prev.push({ idx, old }); gone.push([gx, gz]);
        refund += Math.floor(old.p / 2);
        delete next[idx]; grid.road[idx] = 0;
      }
      if (!gone.length) return;
      // Empty paint that leaned on these streets has no road beside it any more: it fades, and its paint cost comes back.
      const faded = strandedAfter(grid, prev.map((p) => p.idx)), zones = [];
      for (const i of faded) { zones.push([i, grid.zone[i]]); refund += ZONE_DEFS[grid.zone[i]].cost; grid.zone[i] = 0; }
      if (zones.length) { state.zones = encodeZones(grid.zone); state.zoneRev++; sim.zoning?.recount?.(); refresh(); emit({ type: 'zoneFaded', tiles: faded.map((i) => [i % GRID_N, Math.floor(i / GRID_N)]) }); }
      state.roads = next; state.coins += refund; syncDisplay();
      sim.roadUndo.push({ prev, paid: -refund, zones, seq: sim.nextSeq() }); if (sim.roadUndo.length > UNDO_DEPTH) sim.roadUndo.shift();
      emit({ type: 'roadsChanged', kind: 'erase', tiles: gone, cost: -refund });
    },

    // Takes back the last drawing or bulldozing of this session, with the coins that went with it.
    undoRoad(ctx) {
      const { state, grid, emit, sim, syncDisplay } = ctx;
      const e = sim.roadUndo.pop();
      if (!e) { emit({ type: 'toast', text: 'Nothing to undo' }); return; }
      const next = { ...state.roads }, tiles = [];
      for (const { idx, old } of e.prev) {
        if (old) { next[idx] = old; grid.road[idx] = ROAD_KIND[old.t]; } else { delete next[idx]; grid.road[idx] = 0; }
        tiles.push([idx % GRID_N, Math.floor(idx / GRID_N)]);
      }
      state.roads = next; state.coins = Math.max(0, state.coins + e.paid); syncDisplay();
      state.trees = putTrees(state.trees, e.trees || []);
      if (e.zones && e.zones.length) { for (const [i, z] of e.zones) grid.zone[i] = z; }
      if (e.lots && e.lots.length) for (const l of e.lots) if (!state.lots.some(([j]) => j === l[0])) { state.lots.push(l); grid.lot[l[0]] = l[0] + 1; }
      if ((e.zones && e.zones.length) || (e.lots && e.lots.length)) { state.zones = encodeZones(grid.zone); state.zoneRev++; sim.zoning?.recount?.(); ctx.refresh(); }
      if (e.land) restore(ctx, e.land); // the cut and fill the road made goes back too
      emit({ type: 'roadsChanged', kind: 'undo', tiles, cost: -e.paid });
    },

    unlockRoad({ state, emit, syncDisplay }, { roadType }) {
      const t = typeOf(roadType);
      if (!t || !t.unlockParts || state.roadUnlocks.includes(t.id)) return;
      if (state.parts < t.unlockParts) { emit({ type: 'toast', text: 'Needs ' + t.unlockParts + ' Parts' }); return; }
      state.parts -= t.unlockParts; syncDisplay();
      state.roadUnlocks = [...state.roadUnlocks, t.id];
      emit({ type: 'toast', text: t.name + ' unlocked' });
    },
  },
};
