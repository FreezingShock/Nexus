// Bulldoze box: one command clears the buildings, roads, zone paint and trees in a rectangle of tiles. The pieces are the
// ordinary commands, so their rules (the protected bridge, half refunds, trees) stay in one place; their undo steps are
// folded into a single step here, so one Ctrl+Z brings the whole box back.
import { inBounds } from '../../world/grid.js';
import { scanArea } from '../../world/bulldoze-area.js';
import { starterProtected } from '../../world/starter.js';
import { putTrees, takeTree } from '../../world/trees.js';

const PROTECTED = starterProtected();
const tileArg = (t) => Array.isArray(t) && t.length === 2 && inBounds(t[0], t[1]);
const CHUNK = 200; // road tiles per bulldozeRoad (the command refuses more than twice a stroke)

export default {
  id: 'bulldoze-area',
  order: 5, // after zoning, roads, placement and trees, whose commands it calls
  commands: {
    bulldozeArea(ctx, { a, b }) {
      const { sim, state, grid, emit } = ctx;
      if (!tileArg(a) || !tileArg(b)) return;
      const scan = scanArea(state, grid, a, b, PROTECTED);
      if (scan.empty) return emit({ type: 'toast', text: 'Nothing to clear there' });
      const preU = sim.undoStack.length, preR = sim.roadUndo.length, group = -sim.nextSeq();
      sim.hush = true; // one summary toast, not one per piece
      try {
        for (const id of scan.buildings) sim.dispatch({ type: 'bulldoze', id, group });
        if (scan.zones) sim.dispatch({ type: 'clearZone', a, b }); // paint and the grown buildings on it
        for (let k = 0; k < scan.roads.length; k += CHUNK) sim.dispatch({ type: 'bulldozeRoad', tiles: scan.roads.slice(k, k + CHUNK) });
        const taken = [];
        for (const id of scan.trees) { const tk = takeTree(state.trees, id); if (tk.taken.length) { state.trees = tk.kept; taken.push(...tk.taken); } }
        if (taken.length) sim.pushUndo({ revert: (c) => { c.state.trees = putTrees(c.state.trees, taken); } });
      } finally { sim.hush = false; }
      const steps = sim.undoStack.splice(preU), roadSteps = sim.roadUndo.splice(preR);
      if (!steps.length && !roadSteps.length) return emit({ type: 'toast', text: 'Nothing to clear there' });
      const base = Math.min(...[...steps, ...roadSteps].map((e) => e.seq || 0));
      sim.pushUndo({
        revert(c) {
          const s = c.sim;
          s.undoStack.push(...steps); s.roadUndo.push(...roadSteps);
          const top = (st) => (st.length ? st[st.length - 1].seq || 0 : 0);
          s.hush = true;
          try { for (let n = steps.length + roadSteps.length; n > 0 && Math.max(top(s.undoStack), top(s.roadUndo)) >= base; n--) s.dispatch({ type: 'undo' }); } finally { s.hush = false; }
        },
      });
      const parts = [];
      const nb = scan.count, nr = scan.roads.length, nt = scan.trees.length;
      if (nb) parts.push(nb + (nb === 1 ? ' building' : ' buildings'));
      if (nr) parts.push(nr + (nr === 1 ? ' road' : ' roads'));
      if (nt) parts.push(nt + (nt === 1 ? ' tree' : ' trees'));
      if (!parts.length) parts.push(scan.zones + ' zoned tiles');
      emit({ type: 'toast', text: 'Cleared ' + parts.join(', ') + (scan.refund ? ' · ₵ ' + scan.refund + ' back' : '') + ' · Ctrl+Z brings it back' });
      emit({ type: 'areaCleared', n: nb + nr + nt });
    },
  },
};
