# Nexus

A cozy, offline city builder with idle progression. Static site: Three.js (vendored, r128), plain ES modules, no bundler, no network calls after load.

## Run locally

Browsers block ES module imports from `file://`, so serve the folder:

```
python3 -m http.server 8000     # or: npm start
```

Then open http://localhost:8000/. Any static server works.

Test URLs: `?away=24000` forces an offline return of that many seconds; `?debug` exposes `window.__nexus` (sim, scene, ui).

## Seeing the latest work (`integration`)

Finished pull requests are merged automatically into the `integration` branch once tests pass. To view it, run the refresh script. It pulls `integration` and restarts the server on http://localhost:8000.

```
powershell -ExecutionPolicy Bypass -File scripts\refresh.ps1      # Windows (PowerShell)
scripts/refresh.sh                                               # macOS, Linux, Git Bash
```

Options: `-Branch main` (or `scripts/refresh.sh main`) to view another branch, `-Port 8001` (or a second argument) for another port, `-NoServer` (or `NO_SERVER=1`) to pull only. The script refuses to run if the folder has uncommitted changes. If the page looks stale, hard refresh with Ctrl+F5. How parallel work flows is in [CONTRIBUTING.md](CONTRIBUTING.md).

## Controls

Drag to pan, scroll to zoom, WASD to move the camera, Q / E or the arrow keys to turn and tilt, Shift-drag to turn and tilt with the mouse. Press F for free fly (WASD to move, drag or arrows to look, Q / E for height, F to come back) and H to go home to the classic view. Click a building to inspect or upgrade it. Tools: R roads, Z zones, B buildings, C services, P parks, T traffic, X bulldoze. The moon button toggles night. The menu button has export, import and start over.

## Layout

```
index.html, css/        markup and paper-card UI
vendor/                 three.module.min.js (MIT), Fraunces and Capriola woff2 (SIL OFL), licenses
src/world/              pure data: seeded rng, terrain height, town layout
src/core/               tiny registry used by the three extension points below
src/sim/                1 Hz sim, economy, closed-form offline, versioned saves
src/sim/systems/        one file per sim feature (commands, state, rate, tick), generated list in index.js (npm run registry)
src/render/             Three.js scene (merged geometry, instanced props)
src/render/systems/     one file per visual feature, generated list in index.js (npm run registry)
src/ui/                 DOM: HUD, panels, postcard
src/ui/modules/         one file per panel or widget, generated list in index.js (npm run registry)
src/main.js             wiring and the frame loop
tests/                  npm test (node --test, no dependencies)
docs/PORT-PLAN.md       port plan and milestones
```

The sim never touches the DOM or Three.js; the UI sends commands; render reads sim snapshots.

## Vendored files

`vendor/three/three.module.min.js` is the official three r128 `build/three.module.js` minified with terser (about 148 KB gzipped). Fonts are the latin subsets from Fontsource (Fraunces variable with all axes, Capriola 400).
