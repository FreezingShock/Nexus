# Nexus

A cozy, offline city builder with idle progression. Static site: Three.js (vendored, r128), plain ES modules, no bundler, no network calls after load.

## Run locally

Browsers block ES module imports from `file://`, so serve the folder:

```
python3 -m http.server 8000     # or: npm start
```

Then open http://localhost:8000/. Any static server works.

Test URLs: `?away=24000` forces an offline return of that many seconds; `?debug` exposes `window.__nexus` (sim, scene, ui).

## Controls

Drag to pan, scroll to zoom, Q / E to rotate, click a building to inspect or upgrade it. Tools: R roads, Z zones, B buildings, S services, P parks, T traffic, X bulldoze. The moon button toggles night. The menu button has export, import and start over.

## Layout

```
index.html, css/        markup and paper-card UI
vendor/                 three.module.min.js (MIT), Fraunces and Capriola woff2 (SIL OFL), licenses
src/world/              pure data: seeded rng, terrain height, town layout
src/sim/                1 Hz sim, economy, closed-form offline, versioned saves, commands
src/render/             Three.js scene (merged geometry, instanced props)
src/ui/                 DOM: HUD, panels, postcard
src/main.js             wiring and the frame loop
tests/                  npm test (node --test, no dependencies)
docs/PORT-PLAN.md       port plan and milestones
```

The sim never touches the DOM or Three.js; the UI sends commands; render reads sim snapshots.

## Vendored files

`vendor/three/three.module.min.js` is the official three r128 `build/three.module.js` minified with terser (about 148 KB gzipped). Fonts are the latin subsets from Fontsource (Fraunces variable with all axes, Capriola 400).
