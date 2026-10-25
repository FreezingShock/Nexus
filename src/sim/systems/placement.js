// Buildings: put any model from the catalog on open ground, at any size it fits. The starter town is made of the same
// records (world/starter.js, flagged `starter`), so a starter house is bulldozed, rebuilt and undone like any other.
// A placed building is a small record in state.placed; its look, floors and income come from the model and its id,
// so the save stays tiny and a reload rebuilds exactly the same houses.
// Ids look like "b1001" so the generic level and removed fields of the save accept them.
// Undo: placing (one lot or a dragged row) and bulldozing a building push onto sim.undoStack, next to the road undo.
// The `undo` command takes back whichever of the two was done last.
import { isKey } from '../../world/paint.js';
import { areaCost, describe, modelById, seedOf } from '../../world/models.js';
import { terrainRev } from '../../world/terrain.js';
import { LOT_BASE, MAX_PLACED, MAX_ROW, checkLot, lotTiles, planPlacement, problemText } from '../../world/placement.js';
import { buildCost, income, levelOf } from '../economy.js';
import { tileIndex, tileOf, GRID_N } from '../../world/grid.js';
import { lotTileOf } from '../../world/lots.js';
import { footprintIndexes, putTrees, takeOnTiles } from '../../world/trees.js';
import { STARTER_COUNT, STARTER_FIRST, starterPlaced } from '../../world/starter.js';

const ID = /^b(\d+)$/;
const FIRST = STARTER_FIRST;
const UNDO_DEPTH = 40;

// Building cost grows with the player's own placements. The starter town does not count towards the price.
const playerCount = (state) => state.placed.reduce((n, r) => n + (r.starter ? 0 : 1), 0);

// Stamps every alive placed building into the grid's lot layer, and frees the tiles of removed ones.
function sync({ sim, state, grid }) {
  const gone = new Set(state.removed);
  // bulldoze still wants the name of what it just removed, so pruned records stay findable by id
  sim.goneRecords = sim.goneRecords || new Map();
  for (const r of state.placed) if (gone.has(r.id)) sim.goneRecords.set(r.id, r);
  state.placed = state.placed.filter((r) => !gone.has(r.id));
  for (let i = 0; i < grid.lot.length; i++) if (grid.lot[i] >= LOT_BASE) grid.lot[i] = 0;
  for (const r of state.placed) for (const [x, z] of lotTiles(r.gx, r.gz, r.fw, r.fd)) grid.lot[tileIndex(x, z)] = LOT_BASE + (Number(r.id.slice(1)) - FIRST);
}

const top = (stack) => (stack.length ? stack[stack.length - 1] : null);
// The last undo step: one entry, or every entry that shares its group (one drag that bulldozed a street).
function popStep(stack) {
  const out = [stack.pop()];
  if (out[0].group != null) while (stack.length && stack[stack.length - 1].group === out[0].group) out.push(stack.pop());
  return out;
}

export default {
  id: 'placement',
  state: () => ({ placed: starterPlaced(), nextPlaced: FIRST + STARTER_COUNT }),

  // Untrusted save in, only well-formed records out. Overlaps and impossible sizes are dropped.
  sanitize(raw) {
    const out = [], used = new Set();
    let next = FIRST;
    for (const r of Array.isArray(raw.placed) ? raw.placed : []) {
      if (out.length >= MAX_PLACED || !r || typeof r.id !== 'string') continue;
      const m = ID.exec(r.id);
      if (!m || Number(m[1]) < FIRST || Number(m[1]) > FIRST + 20000) continue;
      const plan = planPlacement(r);
      if (plan.error || plan.fw !== r.fw || plan.fd !== r.fd) continue;
      const tiles = lotTiles(plan.gx, plan.gz, plan.fw, plan.fd);
      if (tiles.some(([x, z]) => x < 0 || z < 0 || x >= GRID_N || z >= GRID_N || used.has(z * GRID_N + x))) continue;
      tiles.forEach(([x, z]) => used.add(z * GRID_N + x));
      out.push({ id: r.id, model: r.model, gx: plan.gx, gz: plan.gz, fw: plan.fw, fd: plan.fd, rot: plan.rot, pal: isKey('wall', r.pal) ? r.pal : plan.pal, ...(isKey('roof', r.roof) ? { roof: r.roof } : {}), ...(isKey('trim', r.trim) ? { trim: r.trim } : {}), seed: Number.isInteger(r.seed) ? r.seed >>> 0 : seedOf(r.id), starter: r.starter === true });
      next = Math.max(next, Number(m[1]) + 1);
    }
    const n = Number.isInteger(raw.nextPlaced) ? raw.nextPlaced : FIRST;
    return { placed: out, nextPlaced: Math.min(FIRST + 20000, Math.max(next, n)) };
  },

  // Teach the sim about placed buildings: the inspect card, upgrade and bulldoze commands look them up by id.
  init(ctx) {
    const { sim, state } = ctx;
    // Undo steps are numbered across the road and placement stacks, so the newest one is known.
    sim.seqCount = sim.seqCount || 0;
    sim.nextSeq = () => ++sim.seqCount;
    sim.undoStack = [];
    sim.pushUndo = (e) => { sim.undoStack.push({ ...e, seq: sim.nextSeq() }); if (sim.undoStack.length > UNDO_DEPTH) sim.undoStack.shift(); };
    // Runs again after a Renewal: wrap only once, and start the bulldoze memory fresh.
    if (sim.placementHooked) { sim.goneRecords = new Map(); sync(ctx); return; }
    sim.placementHooked = true;
    const base = { building: sim.building, alive: sim.alive };
    // Each placed building costs more than the last: base x growth^placed (see balance.js).
    sim.placeCost = (def, fw, fd) => buildCost(areaCost(def, fw, fd), playerCount(state));
    sim.ownedCount = () => playerCount(state); // what the next price is based on (the placement picker shows it)
    const rec = (id) => state.placed.find((r) => r.id === id) || (sim.goneRecords && sim.goneRecords.get(id));
    // Keyed by the record itself: a Renewal starts ids over at b1001, and a cache by id would show the old building.
    const descs = new WeakMap();
    const desc = (r) => { let d = descs.get(r); if (!d || d.rev !== terrainRev() || d.pal !== r.pal || d.roof !== (r.roof || null) || d.trim !== (r.trim || null)) { d = describe(r, 1); if (d) { d.rev = terrainRev(); descs.set(r, d); } } return d; }; // a repaint changes pal or roof in place
    sim.building = (id) => { const r = rec(id); return r ? desc(r) : base.building(id); };
    sim.alive = (id) => (rec(id) ? !state.removed.includes(id) : base.alive(id));
    sim.placedRecords = () => state.placed;
    sync(ctx);
  },

  commands: {
    // One lot, clicked. Same rules as a row: see placeMany.
    place(ctx, cmd) {
      const { state, grid, emit, note, refresh, charge, sim } = ctx;
      const plan = planPlacement(cmd);
      if (plan.error) return;
      if (state.placed.length >= MAX_PLACED) return emit({ type: 'toast', text: 'The town has all the buildings it can hold for now' });
      const lot = checkLot(grid, plan.gx, plan.gz, plan.fw, plan.fd, plan.def);
      if (!lot.ok) return emit({ type: 'toast', text: problemText(lot.problem) });
      const cost = buildCost(areaCost(plan.def, plan.fw, plan.fd), playerCount(state));
      if (!charge(cost)) return;
      const id = 'b' + state.nextPlaced++;
      state.placed.push({ id, model: plan.def.id, gx: plan.gx, gz: plan.gz, fw: plan.fw, fd: plan.fd, rot: plan.rot, pal: plan.pal, seed: seedOf(id), starter: false });
      const tk = takeOnTiles(state.trees, footprintIndexes(plan.gx, plan.gz, plan.fw, plan.fd));
      if (tk.taken.length) state.trees = tk.kept;
      sim.pushUndo({ kind: 'place', ids: [id], paid: cost, trees: tk.taken });
      sync(ctx); refresh(); note('place', plan.def.name);
      emit({ type: 'placed', id, text: plan.def.name + (lot.road ? ' is open' : ' placed. A road nearby will bring visitors') });
    },

    // A dragged row: items are lots in order, each { model, gx, gz, fw, fd, rot }. Lots that cannot be built are
    // skipped and the rest still go up. Coins run out part way through: the row stops there and keeps what it built.
    placeMany(ctx, cmd) {
      const { state, grid, emit, note, refresh, sim, syncDisplay } = ctx;
      const items = Array.isArray(cmd.items) ? cmd.items.slice(0, MAX_ROW) : [];
      const ids = [], trees = [];
      let paid = 0, skipped = 0, short = false, full = false, def = null;
      for (const it of items) {
        const plan = planPlacement(it);
        if (plan.error) { skipped++; continue; }
        if (state.placed.length >= MAX_PLACED) { full = true; break; }
        if (!checkLot(grid, plan.gx, plan.gz, plan.fw, plan.fd, plan.def).ok) { skipped++; continue; }
        const cost = buildCost(areaCost(plan.def, plan.fw, plan.fd), playerCount(state));
        if (state.coins < cost) { short = true; break; }
        const id = 'b' + state.nextPlaced++;
        state.coins -= cost; paid += cost;
        state.placed.push({ id, model: plan.def.id, gx: plan.gx, gz: plan.gz, fw: plan.fw, fd: plan.fd, rot: plan.rot, pal: plan.pal, seed: seedOf(id), starter: false });
        const tk = takeOnTiles(state.trees, footprintIndexes(plan.gx, plan.gz, plan.fw, plan.fd));
        if (tk.taken.length) { state.trees = tk.kept; trees.push(...tk.taken); }
        ids.push(id); def = def || plan.def;
        sync(ctx); // the next lot in the row sees this one as built
      }
      if (!ids.length) {
        if (full) emit({ type: 'toast', text: 'The town has all the buildings it can hold for now' });
        else if (short) emit({ type: 'toast', text: 'Not enough coins yet' });
        else emit({ type: 'toast', text: 'Nothing fits along that line' });
        return;
      }
      syncDisplay();
      sim.pushUndo({ kind: 'place', ids, paid, trees });
      refresh(); note('place', def.name);
      const what = ids.length === 1 ? def.name + ' placed' : ids.length + ' ' + def.name.toLowerCase() + 's placed';
      const extra = [skipped && skipped + (skipped === 1 ? ' spot was' : ' spots were') + ' blocked', short && 'out of coins', full && 'the town is full'].filter(Boolean);
      emit({ type: 'placed', id: ids[0], text: what + (extra.length ? ' · ' + extra.join(' · ') : '') });
    },

    // Takes back the last thing done: a road stroke, a placement or a bulldoze, whichever came last.
    undo(ctx) {
      const { sim, emit } = ctx;
      const p = top(sim.undoStack), r = top(sim.roadUndo);
      if (!p && !r) return emit({ type: 'toast', text: 'Nothing to undo' });
      if (r && (!p || (r.seq || 0) > p.seq)) return sim.dispatch({ type: 'undoRoad' });
      undoPlacement(ctx, popStep(sim.undoStack));
    },

    // Bulldozing a building. A group ties together the buildings of one sweep, so one undo brings them all back.
    bulldoze(ctx, { id, group }) {
      const { sim, state, emit, note, refresh } = ctx;
      if (!sim.alive(id)) return;
      // A grown building is not a placed record: its tile's zone goes, which takes the building with it. Undo brings both back.
      const tile = lotTileOf(id);
      if (tile !== null) return sim.dispatch({ type: 'clearZone', a: tileOf(tile), b: tileOf(tile) });
      const rec = state.placed.find((r) => r.id === id) || null;
      state.removed.push(id);
      sim.pushUndo({ kind: 'doze', id, rec, group: Number.isInteger(group) ? group : null });
      refresh(); note('doze', sim.building(id).name);
      emit({ type: 'bulldozed', id, text: sim.building(id).name + ' removed' });
    },
  },

  // Player buildings pay their full income at their level. Starter buildings pay only what their levels add above
  // the first level: the village's first income is already in the base rate, as it always was.
  rate(ctx) {
    sync(ctx);
    let r = 0;
    for (const rec of ctx.state.placed) {
      const d = describe(rec, 1);
      const lv = levelOf(ctx.state, { id: rec.id, level: 1 });
      r += rec.starter ? income(d.floors, lv) - income(d.floors, 1) : income(d.floors, lv);
    }
    return r;
  },
};

// Reverses one undo step (a list of entries, newest last). Placements leave and their coins come back;
// bulldozed buildings return to their lots unless something has been built there since.
function undoPlacement(ctx, entries) {
  const { state, grid, emit, refresh, syncDisplay, sim } = ctx;
  for (const e of entries.reverse()) {
    if (e.revert) { e.revert(ctx); continue; } // zone paint, erase and district paint undo themselves
    if (e.kind === 'place') {
      const gone = new Set(e.ids);
      state.placed = state.placed.filter((r) => !gone.has(r.id));
      state.coins += e.paid;
      state.trees = putTrees(state.trees, e.trees || []);
    } else if (e.kind === 'doze') {
      state.removed = state.removed.filter((id) => id !== e.id);
      if (e.rec) {
        const lot = checkLot(grid, e.rec.gx, e.rec.gz, e.rec.fw, e.rec.fd, modelById(e.rec.model));
        if (!lot.ok) { emit({ type: 'toast', text: 'Something is built on that spot now' }); continue; }
        state.placed.push(e.rec);
      }
      if (sim.building(e.id)) emit({ type: 'toast', text: sim.building(e.id).name + ' is back' });
    }
  }
  syncDisplay();
  sync(ctx);
  refresh();
}
