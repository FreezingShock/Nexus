// Player-placed buildings: put any model from the catalog on open ground, at any size it fits.
// A placed building is a small record in state.placed; its look, floors and income come from the model and its id,
// so the save stays tiny and a reload rebuilds exactly the same houses.
// Placed ids look like "b1001" so the generic level and removed fields of the save accept them.
import { areaCost, describe } from '../../world/models.js';
import { LOT_BASE, MAX_PLACED, checkLot, lotTiles, planPlacement, problemText } from '../../world/placement.js';
import { buildCost, income, levelOf } from '../economy.js';
import { tileIndex, GRID_N } from '../../world/grid.js';

const ID = /^b(\d+)$/;
const FIRST = 1000;

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

export default {
  id: 'placement',
  state: () => ({ placed: [], nextPlaced: FIRST }),

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
      out.push({ id: r.id, model: r.model, gx: plan.gx, gz: plan.gz, fw: plan.fw, fd: plan.fd, rot: plan.rot, pal: plan.pal });
      next = Math.max(next, Number(m[1]) + 1);
    }
    const n = Number.isInteger(raw.nextPlaced) ? raw.nextPlaced : FIRST;
    return { placed: out, nextPlaced: Math.min(FIRST + 20000, Math.max(next, n)) };
  },

  // Teach the sim about placed buildings: the inspect card, upgrade and bulldoze commands look them up by id.
  init(ctx) {
    const { sim, state } = ctx;
    // Runs again after a Renewal: wrap only once, and start the bulldoze memory fresh.
    if (sim.placementHooked) { sim.goneRecords = new Map(); sync(ctx); return; }
    sim.placementHooked = true;
    const base = { building: sim.building, alive: sim.alive };
    // Each placed building costs more than the last: base x growth^placed (see balance.js).
    sim.placeCost = (def, fw, fd) => buildCost(areaCost(def, fw, fd), state.placed.length);
    const rec = (id) => state.placed.find((r) => r.id === id) || (sim.goneRecords && sim.goneRecords.get(id));
    const cache = new Map();
    const desc = (r) => { let d = cache.get(r.id); if (!d) { d = describe(r, 1); cache.set(r.id, d); } return d; };
    sim.building = (id) => { const r = rec(id); return r ? desc(r) : base.building(id); };
    sim.alive = (id) => (rec(id) ? !state.removed.includes(id) : base.alive(id));
    sim.placedRecords = () => state.placed;
    sync(ctx);
  },

  commands: {
    place(ctx, cmd) {
      const { state, grid, emit, note, refresh, charge } = ctx;
      const plan = planPlacement(cmd);
      if (plan.error) return;
      if (state.placed.length >= MAX_PLACED) return emit({ type: 'toast', text: 'The town has all the buildings it can hold for now' });
      const lot = checkLot(grid, plan.gx, plan.gz, plan.fw, plan.fd);
      if (!lot.ok) return emit({ type: 'toast', text: problemText(lot.problem) });
      if (!charge(buildCost(areaCost(plan.def, plan.fw, plan.fd), state.placed.length))) return;
      const id = 'b' + state.nextPlaced++;
      state.placed.push({ id, model: plan.def.id, gx: plan.gx, gz: plan.gz, fw: plan.fw, fd: plan.fd, rot: plan.rot, pal: plan.pal });
      sync(ctx); refresh(); note('place', plan.def.name);
      emit({ type: 'placed', id, text: plan.def.name + (lot.road ? ' is open' : ' placed. A road nearby will bring visitors') });
    },
  },

  // Placed buildings pay full income at their level; the founding town's income is already in the base rate.
  rate(ctx) {
    sync(ctx);
    let r = 0;
    for (const rec of ctx.state.placed) {
      const d = describe(rec, 1);
      r += income(d.floors, levelOf(ctx.state, { id: rec.id, level: 1 }));
    }
    return r;
  },
};

