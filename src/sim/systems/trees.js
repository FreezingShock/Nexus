// Trees as objects. The town's trees are saved in state.trees. The player can bulldoze one (free, with undo).
// Zoning, roads and placed buildings take the trees on their tiles (see world/trees.js and their own systems).
// Undo: removing a tree pushes a step onto sim.undoStack. Owns no grid layer.
import { seedTrees, sanitizeTrees, speciesOf, takeOnTiles, takeTree, putTrees } from '../../world/trees.js';

export default {
  id: 'trees',
  order: 2, // after zoning and placement, so the grid layers the trees must clear are already filled
  state: () => ({ trees: null }), // null: seed the town's trees from the layout on init
  sanitize(raw) {
    return { trees: sanitizeTrees(raw.trees) };
  },

  // Seeds the trees if there are none, then clears any that now stand on a road, paint or lot. Runs at load and after Renewal.
  init(ctx) {
    const { state, grid, layout, sim } = ctx;
    if (!state.trees) state.trees = seedTrees(layout);
    const cover = new Set();
    for (let i = 0; i < grid.road.length; i++) if (grid.road[i] || grid.zone[i] || grid.lot[i]) cover.add(i);
    const tk = takeOnTiles(state.trees, cover);
    if (tk.taken.length) state.trees = tk.kept;
    sim.tree = (id) => state.trees.find((t) => t.id === id) || null;
  },

  commands: {
    // One tree, bulldozed. Free. Ctrl+Z puts it back where it stood.
    removeTree(ctx, { id }) {
      const { state, emit, sim } = ctx;
      if (typeof id !== 'string') return;
      const tk = takeTree(state.trees, id);
      if (!tk.taken.length) return;
      const [t] = tk.taken;
      state.trees = tk.kept;
      sim.pushUndo({ revert: (c) => { c.state.trees = putTrees(c.state.trees, [t]); } });
      emit({ type: 'toast', text: speciesOf(t) + ' tree cleared · Ctrl+Z brings it back' });
    },
  },
};
