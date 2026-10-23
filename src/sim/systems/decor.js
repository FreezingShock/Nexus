// Decorations: benches, lamps, hedges, flower beds, a fountain and more, placed on open land tiles. Looks only, no income.
// Coins buy each piece (the price creeps up with every piece owned); the rarer kinds need a one-time Parts unlock first.
// A piece goes quietly, with a full refund, if a road, zone or building is later put on its tile.
// Undo: placing and clearing push onto sim.undoStack. Rules and prices live in src/world/decor.js.
import { GRID_N } from '../../world/grid.js';
import {
  MAX_DECOR, MAX_DRAG, decorById, decorCost, decorRefund, isOpen, problemAt, problemText, sanitizeDecor, sanitizeUnlocks, takenSet,
} from '../../world/decor.js';

// Drops pieces whose tile is no longer open. Returns the coins to give back (full base price).
function prune({ state, grid }) {
  const kept = [];
  let back = 0;
  for (const d of state.decor) {
    if (problemAt(grid, d.gx, d.gz, null)) back += decorById(d.k).cost;
    else kept.push(d);
  }
  if (kept.length !== state.decor.length) { state.decor = kept; state.coins += back; return back; }
  return 0;
}

export default {
  id: 'decor',
  order: 3, // after zoning, roads and placement, so their grid layers are filled when we check the tiles
  state: () => ({ decor: [], nextDecor: 1, decorUnlocks: [] }),
  sanitize(raw) {
    const decor = sanitizeDecor(raw.decor);
    const next = decor.reduce((n, d) => Math.max(n, Number(d.id.slice(1)) + 1), 1);
    return { decor, nextDecor: Math.max(next, Number.isInteger(raw.nextDecor) ? Math.min(raw.nextDecor, 1e6) : 1), decorUnlocks: sanitizeUnlocks(raw.decorUnlocks) };
  },

  init(ctx) {
    prune(ctx);
    const { sim, state } = ctx;
    // The price of the next piece of a kind, as the sim will charge it.
    sim.decorCost = (k) => { const def = decorById(k); return def ? decorCost(def, state.decor.length) : 0; };
    sim.decorAt = (gx, gz) => state.decor.find((d) => d.gx === gx && d.gz === gz) || null;
  },

  tick(ctx) {
    if (!ctx.state.decor.length) return;
    const back = prune(ctx);
    if (back) { ctx.syncDisplay(); ctx.emit({ type: 'toast', text: 'A decoration made way · ' + back + ' coins back' }); }
  },

  commands: {
    // items: [{ k, gx, gz, rot }]. A drag dresses many tiles; tiles that cannot take one are skipped and the rest still go
    // in. Coins running out part way through stops the row there and keeps what it did.
    placeDecor(ctx, cmd) {
      const { state, grid, emit, note, charge, sim, syncDisplay } = ctx;
      const items = Array.isArray(cmd.items) ? cmd.items.slice(0, MAX_DRAG) : [];
      const taken = takenSet(state.decor);
      const ids = [];
      let paid = 0, problem = null, short = false;
      for (const it of items) {
        const def = it && decorById(it.k);
        if (!def || !isOpen(def, state.decorUnlocks)) continue;
        if (state.decor.length >= MAX_DECOR) { problem = 'full'; break; }
        const bad = problemAt(grid, it.gx, it.gz, taken);
        if (bad) { problem = problem || bad; continue; }
        const cost = decorCost(def, state.decor.length);
        if (state.coins < cost) { short = true; break; }
        state.coins -= cost; paid += cost;
        const id = 'd' + state.nextDecor++;
        state.decor.push({ id, k: def.id, gx: it.gx, gz: it.gz, rot: Number.isInteger(it.rot) ? ((it.rot % 4) + 4) % 4 : 0 });
        taken.add(it.gz * GRID_N + it.gx);
        ids.push(id);
      }
      if (!ids.length) {
        if (short) charge(Infinity); // toasts "Not enough coins yet", takes nothing
        else if (problem === 'full') emit({ type: 'toast', text: 'The town has all the decorations it can hold' });
        else if (problem) emit({ type: 'toast', text: problemText(problem) });
        return;
      }
      state.decor = state.decor.slice(); // a new array tells the renderer to rebuild
      syncDisplay();
      const def = decorById(items[0].k);
      sim.pushUndo({ revert: (c) => takeBack(c, ids, paid) });
      note('decor', def.name);
      emit({ type: 'decorPlaced', ids, k: def.id, text: ids.length > 1 ? ids.length + ' ' + def.name.toLowerCase() + 's placed' : def.name + ' placed' });
      if (short) emit({ type: 'toast', text: 'Coins ran out part way' });
    },

    // Clears the pieces on the given tiles: [[gx, gz], ...]. Half of the base price comes back.
    clearDecor(ctx, cmd) {
      const { state, emit, syncDisplay, sim } = ctx;
      const tiles = Array.isArray(cmd.tiles) ? cmd.tiles.slice(0, MAX_DRAG * 4) : [];
      const want = new Set(tiles.map((t) => Array.isArray(t) ? t[1] * GRID_N + t[0] : -1));
      const gone = state.decor.filter((d) => want.has(d.gz * GRID_N + d.gx));
      if (!gone.length) return;
      const back = gone.reduce((n, d) => n + decorRefund(decorById(d.k)), 0);
      state.decor = state.decor.filter((d) => !want.has(d.gz * GRID_N + d.gx));
      state.coins += back; syncDisplay();
      sim.pushUndo({ revert: (c) => putBack(c, gone, back) });
      emit({ type: 'decorCleared', n: gone.length, text: gone.length + (gone.length > 1 ? ' decorations' : ' decoration') + ' cleared · Ctrl+Z brings ' + (gone.length > 1 ? 'them' : 'it') + ' back' });
    },

    // Opens a rare kind for good by spending its Parts once.
    unlockDecor({ state, emit, syncDisplay }, { k }) {
      const def = decorById(k);
      if (!def || !def.parts || state.decorUnlocks.includes(def.id)) return;
      if (state.parts < def.parts) { emit({ type: 'toast', text: 'Needs ' + def.parts + ' Parts' }); return; }
      state.parts -= def.parts; syncDisplay();
      state.decorUnlocks = [...state.decorUnlocks, def.id];
      emit({ type: 'toast', text: def.name + ' unlocked' });
    },
  },
};

// Undo of a placement: the pieces leave and the coins come back.
function takeBack({ state, syncDisplay }, ids, paid) {
  const gone = new Set(ids);
  state.decor = state.decor.filter((d) => !gone.has(d.id));
  state.coins += paid; syncDisplay();
}
// Undo of a clear: the pieces return where their tile is still open, and the refund is taken again.
function putBack({ state, grid, syncDisplay }, pieces, back) {
  const taken = takenSet(state.decor);
  let put = 0;
  const next = state.decor.slice();
  for (const d of pieces) {
    if (problemAt(grid, d.gx, d.gz, taken)) continue;
    next.push(d); taken.add(d.gz * GRID_N + d.gx); put++;
  }
  state.decor = next;
  state.coins = Math.max(0, state.coins - Math.floor(back * put / pieces.length)); syncDisplay();
}
