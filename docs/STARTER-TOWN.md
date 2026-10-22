# The starter town

A new town opens on a small village core. Every tile of it is ordinary ground, and every building in it is a placed record, the same kind the player builds. There is no special ground, no hand-made block and nothing that cannot be bulldozed.

## What ships

- **Streets.** A main street (tiles 26 to 38 along z = 32) and a cross street (tiles 32 to 38 along x = 32, from z = 26), meeting at the square. They are entries in `state.roads`, so they draw, refund and undo like any road. They refund nothing, as before.
- **Buildings.** Ten records in `STARTER_LOTS` (`src/world/starter.js`): seven homes (two terraces, four cottages, one mansard block), two shops (a shop row and a corner cafe) and one small green park. Ids run `b1000` to `b1009`. Each has `starter: true`.
- **Trees.** Street trees and a few scattered ones around the village, generated in `src/world/layout.js` and kept off the village's streets and buildings. The middle stays open for growth.
- **Scenery.** Farmland to the west, two wind turbines, and pines out past the village. None of it is part of the town's tiles.

## Rules

- A starter building is a placed record. It is on the grid's `lot` layer, so roads and zone paint leave it alone while it stands. Bulldozing it frees its tiles to build on, zone or road.
- Bulldozing and Ctrl+Z work exactly as for player buildings. Undo puts the record back on its lot, and fails with a toast if something was built there since.
- Starter buildings pay only what their upgrades add above level 1. The village's first income is the base rate, as it was for the old founding town. Player buildings pay their full income.
- Building prices count only the player's own placements. The village does not make the first purchase dearer.
- The starter park costs its small upkeep and covers its neighbours, like any park. The shops lift the homes around them, so the village has some happiness from the start.
- Traffic demand reads placed buildings, so the village has homes, shops and jobs from the first tick.
- Renewal starts the village over (`freshState`), and the layers rebuild from it.
- A save from before version 3 is replaced by the starter town. Settings are kept. See [SAVE.md](SAVE.md).

## Where the code is

- `src/world/starter.js`: the streets, the buildings, the records and the reserved tiles.
- `src/world/layout.js`: scenery only (farms, turbines, trees, pines).
- `src/sim/systems/placement.js`: the records, `starter` flag, the price count and the income rule.
- `src/world/roadnet.js`: `starterRoads()` reads the streets.

## Tests

`tests/starter-town.test.js` covers the layout, editing every starter tile, undo, the price count, traffic, the save reset and its backup, and Renewal.
