# Farms

Farmland is not part of the starting scenery any more. The player builds a **Farm** from the Build menu (the Farms tab,
the first piece of production), and it claims its whole lot with a farmhouse, a barn and crop beds.

## The model

- `farm` in `src/world/models.js`, category `farm` (Build tool). Three set sizes: 2 x 3, 3 x 4 and 4 x 4 tiles.
- Income is the usual `income(floors, level)`. A farm's `floors` count its plots: `minFloors(def, area)` gives 3 plots at
  2 x 3, 6 at 3 x 4 and 7 at 4 x 4, so a bigger farm pays more (2.7 to 6.3 coins/s at level 1). Upgrading works like any building.
- Traffic counts a farm as a workplace (`src/sim/traffic.js`), so workers travel to it.

## Flat ground only

`def.flat` makes `checkLot` (src/world/placement.js) also ask for level ground: each tile may rise at most `FLAT_TILE`
(0.35) and the whole lot at most `FLAT_SPREAD` (0.6), read from the per-tile heights `grid.tlo` and `grid.thi`. A sloped
spot is refused with the reason `slope` ("A farm needs flat ground"). The flat plain in the west (`farmMask` in
terrain.js) is where farms fit best.

## Look

`farm(k)` in `src/render/models/builders.js`: tilled soil under the whole lot, a hedge round it with a gate, a farmhouse
and a barn in the yard at the front, and crop beds edge to edge behind them (wheat, barley and greens from `CROPS` in
palettes.js, a row down each bed). Beds are sized to the lot so there is no bare ground. Level details: hay bales (2),
a well (3), a silo (4), a weathervane and a scarecrow (5). Stays under the 650 triangle cap at every size and level.

## Tests

`tests/farmland.test.js`: nothing at spawn, the category and sizes, claiming tiles, income, the flat rule, builds within budget.
