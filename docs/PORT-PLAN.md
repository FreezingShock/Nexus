# Port plan: 3D mockup to the Nexus repo

Source: the approved single-file mockup (`nexus-3d-mockup.html`, Three.js r128 from a CDN, fonts from Google Fonts). Goal: the same look, as a static site with ES modules, no bundler, no network calls after load, and a clean split between simulation, rendering and UI.

## Ground rules (from the project instructions)

- Three.js is the only dependency. It is vendored. No bundler, no framework. Anything new needs approval.
- Fixed 1 Hz simulation tick. The render loop interpolates between the last two sim states. The sim never touches the DOM or Three.js. The UI sends commands.
- Offline catch-up is closed form from `clamp(now - savedAt, 0, 24 h)`. No tick loops.
- Saves are `{ v, savedAt, state }` in localStorage with ordered migrations and file export/import. Every storage call is wrapped in try/catch.
- Budgets: 16.7 ms frame, sim tick under 2 ms, under 100 draw calls, JS under 300 KB gzipped. Phone numbers are only claimed once measured on a phone.

## Layout

```
index.html              markup for the HUD, flyout, inspect card, postcard
css/                    fonts.css (@font-face), ui.css (tokens + paper cards)
vendor/three/           three.module.min.js (r128) + MIT license
vendor/fonts/           Fraunces + Capriola woff2 (latin) + OFL licenses
src/world/              pure data, no DOM, no THREE: seeded rng, noise, terrain height, town layout
src/sim/                state, tick, economy, offline catch-up, save/load/migrate, command handler
src/render/             THREE scene: terrain, town (merged), roads, props, cars, night, selection, dusk plate, camera
src/ui/                 DOM: HUD, inspect card, flyouts, postcard, settings, toasts
src/main.js             wires sim, render, ui; owns the loop
tests/                  node --test for offline, economy, save migration
docs/                   this plan, notes
```

Dependency direction: `world <- sim <- ui`, `world <- render`. `ui` talks to `sim` only through `dispatch(command)` and reads snapshots; `render` reads sim snapshots and never writes. `main.js` is the only file that knows all three.

## Mockup shortcuts and what replaces them

| Mockup shortcut | In the port |
|---|---|
| CDN `three.min.js` global | Vendored `three.module.min.js` (r128, minified from the official module build; about 148 KB gzipped). Pinned to r128 so the toon shading and look stay identical. |
| Google Fonts link | Vendored `woff2` files: Fraunces (variable, latin, all axes so `SOFT` and `WONK` work) and Capriola 400, both SIL OFL, licenses shipped. |
| One `THREE.Group` and 8 to 16 meshes per building, plus one material and one texture per building | Buildings are described as data, then merged into one mesh per material. Facade texture repeat is baked into UVs so one material serves every building of a palette. Edge lines are merged into one `LineSegments`. |
| One group of about 9 meshes per road segment, one material per segment | Roads, sidewalks, dashes and zebras are merged; traffic tint uses vertex colors. |
| 22 cars as groups of meshes plus line segments | Two `InstancedMesh` plus one dynamic line buffer. Cars stay visual only. |
| `Math.random` / module-level `rng` interleaved with rendering | World generation is pure and seeded, in the same call order as the mockup, so the town is identical. |
| Second `WebGLRenderer` for the dusk stamp | Rendered with the main renderer into a small render target and copied to the stamp canvases. One GL context. |
| Postcard snapshot by cropping the live canvas | Rendered into a 4:3 render target from the current view. |
| Mockup view tabs (Town / Roads / Offline return / Building kit) | Dropped from the product UI. The roads flyout stays as a tool. The postcard opens from real offline time; `?away=<seconds>` forces it for testing. The kit view is deferred (dev tool). |
| Fake numbers (1,240 coins, +2,410 on the postcard) | Real state: sim, closed-form offline gain from the actual rate. |
| Real-time shadow map (2048) | Kept for now so the look is unchanged. The style guide wants baked blob shadows and no shadow map; swapping is a visual change and needs a side-by-side review (M3 below). |
| Selection ring left in code but unused | Removed. Back-face silhouette hull stays, sky blue. |

## What the sim owns

`state = { coins, parts, levels{id:level}, removed[], ringRoad, night, speed, paused }`. The town layout is derived from the fixed seed, so a save stores only the changes. Income rate is derived from levels, never stored. `tick()` runs at 1 Hz (game speed 2x/3x runs more ticks per second, not a bigger step). Commands: `upgrade`, `bulldoze`, `buildRoad`, `setNight`, `setSpeed`, `togglePause`, `collectOffline`, `reset`, `import`.

## Milestones

1. **P0 (this PR):** repo structure, vendored libs and fonts, world/sim/render/UI split, scene parity with the mockup (terrain, hills, farmland, roads, town, trees, lamps, cars, turbines), paper UI, inspect/upgrade, roads flyout, bulldoze, day/night, selection outline, offline postcard (closed form), save/load/export/import, README, tests for the pure parts.
2. **P1:** phone measurement (frame time, draw calls, memory) on a real device; fix what misses budget.
3. **P2:** outline post pass and baked contact shadows in place of the shadow map and back-face hulls, reviewed side by side with the mockup.
4. **P3:** grid and placement (64 x 64, 16 x 16 chunks), real zone/build tools, chunked merged geometry.
5. **P4:** zone-flow traffic with BPR, replacing the fake per-segment flow numbers.
6. **P5:** Renewal prestige, Lantern upgrade (extends the offline window), tuning.
7. **P6:** single-file build for double-click play.

## Verification in P0

Run in headless Chromium (software GL): module loading with no console errors, no network requests after load other than same-origin files, `renderer.info` draw calls, JS gzip size, sim tick time, offline math in unit tests. Frame time under software GL says nothing about phones and will not be reported as a phone number.
