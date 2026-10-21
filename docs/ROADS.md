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

## Tool
`src/ui/modules/road-tool.js`: drag = pencil (dragging back erases the tail), click then click = elbow line that chains, Shift = ruler, Esc stops, Ctrl+Z undoes, keys 1-5 pick a type, the bulldoze tool drags to remove roads. Pointer rules follow GRID.md. Render: `render/systems/roads.js` (chunks, pop ripple, dust, lamps, ghost via `scene.sys('roads').preview`), `render/systems/grid-overlay.js` (`show`, `paint`), `render/road-mesh.js` (tile geometry), `render/cars.js` (cars wander the road graph).
