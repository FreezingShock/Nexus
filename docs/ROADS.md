# Roads

Roads live on the shared tile grid (see GRID.md: 96 x 96 tiles of 3 units, tile `(gx, gz)`).

## Data
- `state.roads[tileIndex] = { t, d?, p }`: type (`two`, `bike`, `one`, `bus`, `free`), direction for one-way (0 east, 1 south, 2 west, 3 north), coins paid (refund and undo use it). Saved. The starter streets are ordinary editable tiles with `p: 0`.
- `state.roadUnlocks`: Parts-gated types bought so far (bus 600, freeway 1,500).
- `grid.road[i]` is rebuilt from state (kind codes in `ROAD_KIND`). The starter streets are plain entries in `state.roads` (see [STARTER-TOWN.md](STARTER-TOWN.md)).
- Tiles connect to every road neighbor; curves, tees and crossings are derived (`shapeOf`), never stored.

## Rules
- Roads may cover zone paint (cleared, `clearZoneTiles` dispatched) and replace other road types (pay the difference). They cannot go on water, steep ground, farmland, grown lots, parks or standing buildings (`roadBlock`).
- Starter buildings stand on the grid's lot layer like player buildings, so a road can go on their ground once they are bulldozed.

## Commands
`drawRoad { roadType, path }` (ordered 4-connected tiles; one-way follows the path), `bulldozeRoad { tiles }` (half refund), `undoRoad` (session only, 24 deep), `unlockRoad { roadType }`. Event `roadsChanged { kind: draw|erase|undo, tiles, cost }` is the hook for sound and notifications.

## Routes
A road is drawn as a chain of pivots: the committed start, any pivots added while drawing, and the cursor. Each pair of points is one L (a leg, a corner, a leg), or a ruler line with Shift. `chooseRoute` picks each L's bend by scoring both shapes: grid problems first, then riding along existing roads (costly), then new tiles (cheap). L (`flip`) inverts every pick. `routeThrough` builds the tile list for a fixed shape, `planStroke` prices it and reports `problems` and `joins`, and `validateRoute` applies the grid rules. The sim's `drawRoad` runs the same planner, so the preview and the commit always agree. One click commits one segment (one undo step) and lets go of the start, so the next click begins a new road.

## Grid rules (`validateRoute`)
Every problem has a reason key in `BLOCK_TEXT`, shown on the reason chip and as the toast.
- `revisit`: the route crosses itself.
- `loop`: a route tile touches the route anywhere but its neighbors, or completes a 2 by 2 block of road.
- `hug`: a new tile touches a street it does not join. Only the route's ends may touch the network, and a tile may touch the road it links to (a T or a crossing).
- `zigzag`: two turns with a single tile between them.
- `long`: more than `MAX_STROKE` tiles.
- Ground reasons from `roadBlock` (water, steep, farm, lot, park, building, bounds) are the same codes.

## Tool
`src/ui/modules/road-tool.js`: click to set the start, move, click to commit the L to the cursor; the tool then has nothing selected until the next click. Pressing, dragging and letting go on another tile lays the road in one go. Keep drawing (the menu button or Tab, remembered in `nexus.roadKeep`) starts the next road from the end of the last. With no start set, dead ends (`roadEnds`) glow as places to carry on from. Space adds a pivot at the cursor (or the nearest tile of the route after the last pivot). L flips which leg comes first. Shift makes the legs straight. Esc or right-click steps back one pivot, then drops the start. Ctrl+Z drops a waiting start first, then undoes the last committed segment. Keys 1-5 pick a type, the bulldoze tool drags to remove roads. Pointer rules follow GRID.md. Render: `render/systems/roads.js` (chunks, pop ripple, dust, lamps, ghost via `scene.sys('roads').preview`), `render/systems/grid-overlay.js` (`show`, `paint`), `render/road-mesh.js` (tile geometry), `render/cars.js` (cars wander the road graph).
