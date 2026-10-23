# The starter town

A new town opens on a small village core. Every tile of it is ordinary ground, and every building in it is a placed record, the same kind the player builds. There is no special ground, no hand-made block and nothing that cannot be bulldozed.

## What ships

- **Streets.** A T. The bar runs north to south through the village (x = 32, z 26 to 38). The stem runs east from its middle (z = 32, x 33 to 55), over the river on the bridge, to the tunnel gate at x = 55. They are entries in `state.roads`, so they draw, refund and undo like any road. They refund nothing, as before.
- **Buildings.** Twelve records in `STARTER_LOTS` (`src/world/starter.js`): nine homes (three terraces, five cottages, one mansard block), two shops (a shop row and a corner cafe) and one small green park. They sit along the bar and the stem, a tile off the kerb here and there, so the village reads as scattered. Ids run `b1000` to `b1011`. Each has `starter: true`.
- **Bridge and tunnel.** The stem crosses the river on the bridge (world x 46 to 68) and ends at the tunnel gate, a dead end at the foot of a mountain east of the river. The mountain is terrain (`heightAt` in `src/world/terrain.js`), with a stone arch and a dark mouth where the road goes in (`buildStatic` in `src/render/props.js`). The ground is level up to the gate.
- **Traffic at the gate.** Some new cars and townsfolk come out of the tunnel at the gate and head into town. Some cars leave town along the stem and drive into the tunnel, where they are removed. Nothing counts them yet: population will come through here later. See `src/render/vehicle-agents.js` and `src/render/townsfolk.js`.
- **Trees.** Street trees and a few scattered ones around the village, generated in `src/world/layout.js` and kept off the village's streets and buildings. The middle stays open for growth.
- **Scenery.** Two wind turbines, and pines out past the village. None of it is part of the town's tiles.

## Rules

- A starter building is a placed record. It is on the grid's `lot` layer, so roads and zone paint leave it alone while it stands. Bulldozing it frees its tiles to build on, zone or road.
- The bridge and the stem's last tiles into the tunnel (`starterProtected()`, tiles 47 to 55 along z = 32) cannot be bulldozed. The rest of the village can, like any road.
- Bulldozing and Ctrl+Z work exactly as for player buildings. Undo puts the record back on its lot, and fails with a toast if something was built there since.
- Starter buildings pay only what their upgrades add above level 1. The village's first income is the base rate, as it was for the old founding town. Player buildings pay their full income.
- Building prices count only the player's own placements. The village does not make the first purchase dearer.
- The starter park costs its small upkeep and covers its neighbours, like any park. The shops lift the homes around them, so the village has some happiness from the start.
- Traffic demand reads placed buildings, so the village has homes, shops and jobs from the first tick.
- Renewal starts the village over (`freshState`), and the layers rebuild from it.
- A save from before version 3 is replaced by the starter town. Settings are kept. See [SAVE.md](SAVE.md).

## Where the code is

- `src/world/starter.js`: the streets, the buildings, the records and the reserved tiles.
- `src/world/layout.js`: scenery only (turbines, trees, pines).
- `src/sim/systems/placement.js`: the records, `starter` flag, the price count and the income rule.
- `src/world/roadnet.js`: `starterRoads()` reads the streets.

## Tests

`tests/starter-town.test.js` covers the layout, editing every starter tile, undo, the price count, traffic, the save reset and its backup, and Renewal. `tests/tunnel.test.js` covers the T, the protected tiles, the level gate, the mountain, and cars and townsfolk at the gate. `tests/models.test.js` checks that every building part stays within its footprint, so a stray vertex cannot stretch the merged meshes across the map.
