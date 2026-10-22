# Farms

Farmland is not part of the starting scenery. The player builds a **Farm** from the Build menu (the Farms tab, the first
piece of production). A farm has no fixed size: you drag out any rectangle, like painting a district, and it fills it.

## Dragging a farm

- Pick Farms, then press on the map and drag. The preview is the real farm, redrawn as the rectangle changes, with a
  tint on every tile (rose where something is in the way or the ground is not flat). The label shows the size, the price
  and what it will earn. A plain click places the smallest farm (2 x 3).
- The tile you press on is always a corner of the farm (`freeRect`), so the edge you began on stays put and the farm grows away
  from it in the drag direction. With no direction yet (a click, or a drag along one axis) it grows away from a road beside
  the start tile, so a farm begun against a street never slides a tile off it.
- Sizes: at least 2 x 3 tiles (a side of 2 and a side of 3), at most 24 a side (`free` on the model, `fitFootprint`).
- The front is fixed and faces the nearest road: of the turns that leave the house enough depth, the one whose front edge
  has a road closest straight out wins (`frontRoadDistance`, within 12 tiles). V turns it by hand and keeps your turn
  until you pick another model. A click shows the smallest farm laid out for each turn (2 wide and 3 deep, swapping sides
  on a quarter turn), so all four turns are available; a dragged rectangle with a side of 2 can only face along its long side.
- Code: `freeLot` in `src/ui/modules/placement.js` (one rectangle, grown to the minimum and clamped to the maximum), the
  preview in `src/render/systems/placement-ghost.js` (tile tints are two instanced meshes, so any size is two draw calls).

## The model

- `farm` in `src/world/models.js`, category `farm`. `free: { min: [2, 3], max: 24 }` is the size rule; `perTile: 0.5` makes
  its yield (`floors`, via `floorsFor`) half the area, uncapped. Income is the usual `income(floors, level)`, so it is
  about 0.45 coins/s a tile at level 1, and a bigger farm earns in proportion. It costs 45 coins a tile (the exponential
  build price applies once per building, so one big farm is cheaper than the same area in many buildings).
- Traffic counts a farm as a workplace, with its crew capped (`src/sim/traffic.js`).

## Flat ground only

`def.flat` makes `checkLot` (`src/world/placement.js`) also ask for level ground: each tile may rise at most `FLAT_TILE`
(0.35) and the whole lot at most `FLAT_SPREAD` (0.6), read from the per-tile heights `grid.tlo` and `grid.thi`. A sloped
spot is refused with the reason `slope` ("A farm needs flat ground"). The western plain (`farmMask`, terrain.js) is flat.

## Look

`farm(k)` in `src/render/models/builders.js`. The front never changes: a hedge with a gate, a farmhouse and a barn in a
yard 2.6 deep. Behind it the fields repeat to fill the lot: beds side by side (about 1.3 wide), grouped in blocks of up to six
with a dirt path between, and blocks no deeper than about seven, so a bigger lot gets more rows and more blocks. Beds are
flat quads merged per colour (wheat, barley, greens from `CROPS`), two triangles each, so a 24 x 24 farm is a few thousand
triangles and about 25 parts. Level details: hay bales (2), a well (3), a silo (4), a weathervane and scarecrows (5).

## Tests

`tests/farmland.test.js`: nothing at spawn, the category and any-size rule, turning for depth, claimed tiles, income by
area, the flat rule, a save and reload of a big farm, undo, and the triangle budget at any size.
