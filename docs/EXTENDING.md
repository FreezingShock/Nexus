# Extension points

New features are new files. Create the file, then run `npm run registry` to regenerate the three `index.js` lists (they are generated, never hand-edited). A test fails if an index is out of date. Every `.js` file directly in a registry folder (except `index.js`) must have a default export; put helpers in a subfolder or elsewhere. Modules run in order of an optional numeric `order` field (default 0), then by file name.

## Sim systems: `src/sim/systems/<name>.js`

A system is a plain object. Every field except `id` is optional:

- `id`: unique string
- `state()`: default fields to add to a fresh state, for example `{ districts: [] }`
- `sanitize(raw, fresh)`: the fields to keep from an untrusted saved state (clamp and validate)
- `commands`: `{ commandName(ctx, cmd) }`, called by `sim.dispatch({ type: 'commandName', ... })`
- `rate(ctx)`: extra coins per second, added to the building income
- `tick(ctx)`: runs once per 1 Hz tick, after income is added

`ctx = { sim, state, layout, emit, note, refresh, charge(cost), syncDisplay() }`. Systems never touch the DOM or Three.js. Other hooks used by existing systems (`init`, `offline`) are described in docs/GRID.md once that lands.

## Render systems: `src/render/systems/<name>.js`

`{ id, create(ctx) }` where `ctx = { THREE, world, layout, camera, scene }`. `create` returns an object whose optional hooks `scene.js` calls:

- `frame(f)`: every frame, `f = { dt, t, simDt, state, tool }` (`simDt` is wall dt scaled by game speed, 0 when paused)
- `setNight(on)`: when the day/night blend crosses halfway

Render systems read sim state and never write it. Keep draw calls low: instance or merge geometry.

## UI modules: `src/ui/modules/<name>.js`

`{ id, create(ctx) }` where `ctx = { sim, send, scene, toast }`. `create` returns an object whose optional hooks `ui.js` calls:

- `frame(dt, t, alpha)`: every frame
- `onEvent(e)`: every sim event (`{ type, id?, text? }`)
- `onKey(e)`: keydown outside inputs; return true to claim the key
- `onTool(tool, was)`: the active tool changed (null when none); `ctx.tool()` returns the current one

Modules read sim snapshots and send commands; they never mutate `sim.state`. Add markup to `index.html` only inside your own container and styles to your own css file.
