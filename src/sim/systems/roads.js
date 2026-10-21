// Roads on the shared tile grid: the pencil stroke, bulldozing, undo and the Parts unlocks.
// Saved: state.roads (see src/world/roadnet.js) and state.roadUnlocks. The grid's `road` layer is rebuilt from them.
import { ROAD_TYPES } from '../catalog.js';
import { GRID_N, tileIndex } from '../../world/grid.js';
import { putTrees, takeOnTiles } from '../../world/trees.js';
import { MAX_STROKE, ROAD_IDS, ROAD_KIND, BLOCK_TEXT, planStroke, roadBlock, starterRoads } from '../../world/roadnet.js';

const UNDO_DEPTH = 24;
const typeOf = (id) => ROAD_TYPES.find((r) => r.id === id);
const costOf = (id) => (typeOf(id) ? typeOf(id).cost : 0);
const isTile = (t) => Array.isArray(t) && Number.isInteger(t[0]) && Number.isInteger(t[1]);

function syncGrid({ grid, state }) {
  grid.road.fill(0);
  for (const [k, r] of Object.entries(state.roads)) grid.road[Number(k)] = ROAD_KIND[r.t];
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
  init(ctx) { ctx.sim.roadUndo = []; syncGrid(ctx); },
  commands: {
    // path: ordered, 4-connected [gx, gz] tiles drawn with the pencil. One-way roads follow the drawing direction.
    drawRoad(ctx, { roadType, path }) {
      const { state, grid, layout, emit, note, charge, sim } = ctx;
      const t = typeOf(roadType);
      if (!t || (t.unlockParts && !state.roadUnlocks.includes(t.id))) return;
      if (!Array.isArray(path) || !path.length || path.length > MAX_STROKE || !path.every(isTile)) return;
      for (let k = 1; k < path.length; k++) if (Math.abs(path[k][0] - path[k - 1][0]) + Math.abs(path[k][1] - path[k - 1][1]) !== 1) return;
      const plan = planStroke({ path, type: t.id, roads: state.roads, canRoad: (gx, gz) => !roadBlock(grid, layout, state, gx, gz), costOf });
      if (plan.blocked.length) { emit({ type: 'toast', text: BLOCK_TEXT[roadBlock(grid, layout, state, plan.blocked[0][0], plan.blocked[0][1])] }); return; }
      if (!plan.tiles.length) return;
      if (!charge(plan.cost)) return;
      const next = { ...state.roads }, prev = [], cleared = [];
      for (const e of plan.tiles) {
        prev.push({ idx: e.idx, old: e.old });
        const rec = { t: e.t, p: (e.old ? e.old.p : 0) + e.price };
        if (e.d !== undefined) rec.d = e.d;
        next[e.idx] = rec;
        grid.road[e.idx] = ROAD_KIND[e.t];
        if (grid.zone[e.idx]) { grid.zone[e.idx] = 0; cleared.push([e.gx, e.gz]); }
      }
      state.roads = next;
      // Trees on the new road give way; the undo step brings them back.
      const tk = takeOnTiles(state.trees, new Set(plan.tiles.map((e) => e.idx)));
      if (tk.taken.length) state.trees = tk.kept;
      sim.roadUndo.push({ prev, paid: plan.cost, trees: tk.taken, seq: sim.nextSeq() }); if (sim.roadUndo.length > UNDO_DEPTH) sim.roadUndo.shift();
      note('road');
      emit({ type: 'roadsChanged', kind: 'draw', tiles: plan.tiles.map((e) => [e.gx, e.gz]), cost: plan.cost });
      if (cleared.length) sim.dispatch({ type: 'clearZoneTiles', tiles: cleared });
    },

    // tiles: [gx, gz] list. Half of what each tile cost comes back; the starter streets refund nothing.
    bulldozeRoad(ctx, { tiles }) {
      const { state, grid, emit, sim, syncDisplay } = ctx;
      if (!Array.isArray(tiles) || tiles.length > MAX_STROKE * 2 || !tiles.every(isTile)) return;
      const next = { ...state.roads }, prev = [], gone = [];
      let refund = 0;
      for (const [gx, gz] of tiles) {
        const idx = tileIndex(gx, gz), old = next[idx];
        if (gx < 0 || gz < 0 || gx >= GRID_N || gz >= GRID_N || !old) continue;
        prev.push({ idx, old }); gone.push([gx, gz]);
        refund += Math.floor(old.p / 2);
        delete next[idx]; grid.road[idx] = 0;
      }
      if (!gone.length) return;
      state.roads = next; state.coins += refund; syncDisplay();
      sim.roadUndo.push({ prev, paid: -refund, seq: sim.nextSeq() }); if (sim.roadUndo.length > UNDO_DEPTH) sim.roadUndo.shift();
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
