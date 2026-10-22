# Trees

Trees are objects, not scenery. Every tree the town starts with is a record in `state.trees` (saved), and a player can select or bulldoze one.

## The record

`{ id, k, x, z, s, rot, col }`

- `id`: `t` plus a number, unique in the town. Ids are never reused within a town.
- `k`: `'b'` broadleaf or `'p'` conifer. Each kind has its own instanced meshes (`MAX_PER_KIND` = 1000 each).
- `x`, `z`: world position (rounded to 0.01). `s` scale, `rot` turn, `col` colour index (broadleaf: `TREE_COLORS`, conifer: `PINE_COLORS`).

Species names come from `speciesOf()` in `src/world/trees.js`: broadleaf by colour index, conifer as "Pine".

## Where the rules live

- `src/world/trees.js`: pure data. `seedTrees(layout)`, `sanitizeTrees`, `takeOnTiles`, `takeTree`, `putTrees`, `footprintIndexes`.
- `src/sim/systems/trees.js`: saved field, load-time reconcile (`init`), the `removeTree` command (free, undoable) and `sim.tree(id)` for the inspect card.
- `src/render/systems/trees.js`: instanced meshes rebuilt when `state.trees` changes (a new array), puffs for trees that go, and `pick(raycaster)`.

## Rules

- **Seeding.** A new town, a Renewal, a v1 save and a v2 save (which is replaced by the starter town) all start from `seedTrees(getLayout())`. The layout keeps its trees off the starter village's streets and buildings (`starterReserved()` in `src/world/starter.js`), so none are left to clear.
- **Clearing.** A tree gives way when its tile is painted with a zone, covered by a road, or taken by a placed building (every tile of its footprint). Each action takes the trees with it and returns them to its undo step, so Ctrl+Z restores exactly the trees that action took. Zone paint, road strokes and placed buildings do this; a bulldoze of a single tree is its own undo step.
- **Load.** `init` also clears any tree that now stands on a road, paint or lot, so a save never shows a tree inside a building.
- **Nothing else changes trees.** Trees do not block roads or placement, do not earn income and do not tick. Planting is not built yet.

## Save

Version 3 (`SAVE_VERSION`). The v1 → v2 migration seeds `trees`; the v2 → v3 step replaces the town with the starter town, so its trees come from the seed again. A town's trees add about 32 KB to a save.

## Tests

`tests/trees.test.js`: seeding and the migration, clearing and undo for zone paint, roads, a single placement, a dragged row and a bulldoze, the save round trip, sanitizing, and picking in the render system.
