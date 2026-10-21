# The shared tile grid

Roads and zones are two systems on one grid. `src/world/grid.js` is the only definition of it. Both systems use these coordinates and ask these questions; neither invents its own.

## Coordinates

- 64 x 64 tiles, `TILE = 3` world units. Tile `(gx, gz)` has its center at `((gx - 32) * 3, (gz - 32) * 3)`, so the town's existing street lines (0, +-12, +-24) pass through tile centers.
- `tileCenter(gx, gz)`, `worldToTile(x, z)`, `snapToTile(x, z)`, `inBounds(gx, gz)`, `tileIndex(gx, gz)` (= `gz * 64 + gx`), `rectTiles(a, b)` (inclusive rectangle, clipped).
- `scene.ground(clientX, clientY)` returns the world point `{ x, z }` under the cursor. Feed it to `worldToTile`.

## Layers (typed arrays on `sim.grid`, also `ctx.grid` in a sim system)

| Layer | Owner | Values |
| --- | --- | --- |
| `base` | the world, read only | `BASE.LAND`, `WATER`, `STEEP`, `FARM`, `TOWN` |
| `road` | the road system | `0` none, `ROAD_STATIC` (255, the streets that ship with the town), anything else is a road kind the road system defines |
| `zone` | zoning | `0` none, `1..4` a zone id |
| `lot` | zoning | `0` none, else the grown lot number on that tile |

Each system writes only its own layer and keeps its own saved fields in `state`. It rebuilds its layer from state in an `init(ctx)` hook, which `createSim` calls once. Derived layers are never saved.

## Rules between the systems

- Zone paint needs open ground: `grid.isOpen(gx, gz)` (land, no road, no grown lot). Painting is always allowed there; buildings only grow when a road is within 2 tiles.
- A road may take a tile that has zone paint on it (the paint clears, nothing is charged for it), but never a grown lot. The road system should send `{ type: 'zoneCleared', tiles }` by calling `ctx.sim.dispatch({ type: 'clearZoneTiles', tiles: [[gx, gz], ...] })` for those tiles, or simply write `grid.zone[i] = 0` and let zoning reconcile (it does so each tick).
- `grid.canRoad(gx, gz)` is the default road test (land, no grown lot). The road system may widen it (bridges over water).
- Zones do not own roads. Roads do not own zones. If you need something from the other system, read its layer.

## Pointer tools

Drawing tools attach capture-phase pointer listeners to the stage element (`scene.canvas.parentElement`) while their tool is active, call `stopPropagation()` on the events they claim, and use button 0 only. Right and middle drag still pan, the wheel still zooms.

## Zoning (what is built on the grid)

- Sim: `src/sim/systems/zoning.js` (commands `paintZone {zone, a, b}` and `clearZone {a, b}`, tiles are `[gx, gz]`), pure rules in `src/sim/zones.js`. Zone paint is saved as a 4096-character string, grown buildings as `[tile, level, seed]`. `sim.zoning` exposes `demand()`, `stats()`, `costOf()`.
- Buildings grow only on painted tiles with a road within 2 tiles (`grid.road` non-zero, any value). Demand never drops below 0.15, so growth only slows.
- Render: `scene.sys('tileview')` draws the dashed grid on open ground (`showGrid(true)`; roads can reuse it), zone paint and the drag preview from one 64x64 data texture. `src/render/systems/lots.js` draws grown buildings.
