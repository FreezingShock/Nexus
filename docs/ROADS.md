# Roads

Roads live on the shared tile grid (see GRID.md: 64 x 64 tiles of 3 units, tile `(gx, gz)`).

## Data
- `state.roads[tileIndex] = { t, d?, p }`: type (`two`, `bike`, `one`, `bus`, `free`), direction for one-way (0 east, 1 south, 2 west, 3 north), coins paid (refund and undo use it). Saved. The starter streets are ordinary editable tiles with `p: 0`.
- `state.roadUnlocks`: Parts-gated types bought so far (bus 600, freeway 1,500).
- `grid.road[i]` is rebuilt from state (kind codes in `ROAD_KIND`); the old 255 `ROAD_STATIC` marker is no longer written.
- Tiles connect to every road neighbor; curves, tees and crossings are derived (`shapeOf`), never stored.

## Rules
- Roads may cover zone paint (cleared, `clearZoneTiles` dispatched) and replace other road types (pay the difference). They cannot go on water, steep ground, farmland, grown lots, parks or standing buildings (`roadBlock`).
- Block interiors of the shipped town become buildable for roads once their buildings are bulldozed.

## Commands
`drawRoad { roadType, path }` (ordered 4-connected tiles; one-way follows the path), `bulldozeRoad { tiles }` (half refund), `undoRoad` (session only, 24 deep), `unlockRoad { roadType }`. Event `roadsChanged { kind: draw|erase|undo, tiles, cost }` is the hook for sound and notifications.

## Routes
A road is drawn as a chain of pivots: the committed start, any pivots added while drawing, and the cursor. Each pair of points is one L (a leg, a corner, a leg), or a ruler line with Shift. `routeThrough` builds the tile list, `planStroke` prices it and reports `problems` and `joins`, and `validateRoute` applies the grid rules. The sim's `drawRoad` runs the same planner, so the preview and the commit always agree. One click commits one segment (one undo step).

## Grid rules (`validateRoute`)
Every problem has a reason key in `BLOCK_TEXT`, shown on the reason chip and as the toast.
- `revisit`: the route crosses itself.
- `loop`: a route tile touches the route anywhere but its neighbors, or completes a 2 by 2 block of road.
- `hug`: a new tile touches a street it does not join. Only the route's ends may touch the network, and a tile may touch the road it links to (a T or a crossing).
- `gap`: a straight run sits two tiles from a parallel road, leaving a one-tile sliver. Blocks of three tiles stay lots.
- `zigzag`: two turns with a single tile between them.
- `long`: more than `MAX_STROKE` tiles.
- Ground reasons from `roadBlock` (water, steep, farm, lot, park, building, bounds) are the same codes.

## Tool
`src/ui/modules/road-tool.js`: click to set the start, move, click to commit the L to the cursor. Space adds a pivot at the cursor (or the nearest tile of the route after the last pivot). L flips which leg comes first. Shift makes the legs straight. Esc or right-click steps back one pivot, then drops the start. Ctrl+Z undoes the last committed segment. Keys 1-5 pick a type, the bulldoze tool drags to remove roads. Pointer rules follow GRID.md. Render: `render/systems/roads.js` (chunks, pop ripple, dust, lamps, ghost via `scene.sys('roads').preview`), `render/systems/grid-overlay.js` (`show`, `paint`), `render/road-mesh.js` (tile geometry), `render/cars.js` (cars wander the road graph).
