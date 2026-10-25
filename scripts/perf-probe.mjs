// Performance probe, run in Node without a browser: `node scripts/perf-probe.mjs [--big]`.
// Builds the whole render scene the way render/scene.js does (no WebGLRenderer), runs a few frames of every render system,
// then reports an estimate of draw calls and triangles, CPU time per frame and per rebuild, sim tick time, and the
// gzipped size of the JS the site loads. Numbers are from this machine's CPU; GPU time and phone numbers need a real device.
//
// Draw calls are counted the way three.js issues them: one per visible renderable per material group, plus one per shadow
// caster in the sun's shadow pass when shadows are on. "in view" applies the orbit camera's frustum at its starting pose.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

globalThis.NEXUS_TERRAIN_SEED ??= 0;
// Canvas stand-in: the wall and window textures draw into 64 px canvases. Nothing is rasterised here.
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }) };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THREE = await import('../vendor/three/three.module.min.js');
const { createSim } = await import('../src/sim/sim.js');
const { freshState } = await import('../src/sim/state.js');
const { getLayout } = await import('../src/world/layout.js');
const { createCamera } = await import('../src/render/camera.js');
const { createLighting } = await import('../src/render/night.js');
const { buildTerrain } = await import('../src/render/terrain.js');
const { buildStatic } = await import('../src/render/props.js');
const { ensureInstanceColors } = await import('../src/render/geom.js');
const { registryOf } = await import('../src/core/registry.js');
const { renderSystems } = await import('../src/render/systems/index.js');
const { createTown } = await import('../src/render/town.js');
const { createSky } = await import('../src/render/sky.js');
const { atmosphereTargets } = await import('../src/core/calendar.js');
const { applySeason } = await import('../src/render/season.js');

const ms = (x) => x.toFixed(2) + ' ms';
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const time = (fn) => { const t0 = performance.now(); fn(); return performance.now() - t0; };

// ---- scene, as render/scene.js builds it ----
const BIG = process.argv.includes('--big');
const ROAD = 'two';
const layout = getLayout();
const sim = createSim({ state: freshState(), layout, now: () => 1e12 });
if (BIG) growBigTown(sim);

// --big: a grid of streets with every block zoned, grown for a day in closed form, then every lot raised a few levels.
// A stand-in for a late-game town, so rebuild and draw-call numbers show how they scale.
function growBigTown(sim) {
  const st = sim.state;
  st.coins = 1e15; st.parts = 1e9;
  const line = (a, b) => { const p = []; const [x0, z0] = a, [x1, z1] = b; const n = Math.abs(x1 - x0) + Math.abs(z1 - z0); for (let k = 0; k <= n; k++) p.push([x0 + Math.sign(x1 - x0) * k, z0 + Math.sign(z1 - z0) * k]); return p; };
  // One stroke per block side, so a stroke that meets water or the village only loses that side.
  for (let z = 6; z <= 90; z += 6) for (let x = 6; x < 90; x += 6) {
    sim.dispatch({ type: 'drawRoad', roadType: ROAD, path: line([x, z], [x + 6, z]) });
    sim.dispatch({ type: 'drawRoad', roadType: ROAD, path: line([z, x], [z, x + 6]) });
  }
  let k = 0;
  for (let z = 6; z < 90; z += 6) for (let x = 6; x < 90; x += 6) sim.dispatch({ type: 'paintZone', zone: 1 + (k++ % 3), a: [x + 1, z + 1], b: [x + 5, z + 5] });
  sim.catchUp(1e12 - 24 * 3600 * 1000);
  for (let i = 0; i < 3000; i++) sim.tick();
  for (const l of st.lots) l[1] = Math.max(l[1], 1 + (l[0] % 5));
  st.zoneRev++;
}
const scene = new THREE.Scene();
const lighting = createLighting(scene);
const sky = createSky();
const world = new THREE.Group(); scene.add(world);
const camera = createCamera();
camera.resize(1600, 900);
const tBuild = {};
// Who put each top-level object in the scene: anything new under world or scene after a step belongs to that step.
const owner = new Map();
const tagNew = (label) => { for (const root of [world, scene]) for (const c of root.children) if (!owner.has(c) && c !== world) owner.set(c, label); };
tagNew('lights');
tBuild.terrain = time(() => buildTerrain(world)); tagNew('terrain');
tBuild.static = time(() => buildStatic(world, layout)); tagNew('static props');
let byId;
let town;
tBuild.town = time(() => { town = createTown(world, { burst: (...a) => byId?.get('puffs')?.burst(...a) }); }); tagNew('town');
const defs = registryOf('render systems', renderSystems).list();
const mods = [];
for (const d of defs) {
  const t0 = performance.now();
  mods.push(d.create({ THREE, world, layout, grid: sim.grid, camera, scene, town, sys: (id) => byId.get(id) || null }) || {});
  tBuild['sys:' + d.id] = performance.now() - t0;
  tagNew(d.id);
}
byId = new Map(defs.map((d, i) => [d.id, mods[i]]));
ensureInstanceColors(scene);

const perSys = new Map(defs.map((d) => [d.id, []]));
let tFrame = [], tTown = [];
function frame(dt, t) {
  const s = sim.state;
  const targets = atmosphereTargets({ hour: s.hour, season: s.season, weather: s.weatherKind });
  const look = sky.update(dt, targets);
  applySeason(look);
  const f = { dt, t, simDt: dt, state: s, tool: null, sky: look };
  const t0 = performance.now();
  mods.forEach((m, i) => { if (!m.frame) return; const a = performance.now(); m.frame(f); perSys.get(defs[i].id).push(performance.now() - a); tagNew(defs[i].id); });
  lighting.update(dt, look);
  const a = performance.now();
  town.setRemoved(s.removed); town.setState(s); town.update(dt);
  tTown.push(performance.now() - a);
  tagNew('town');
  scene.updateMatrixWorld();
  tFrame.push(performance.now() - t0);
}

// Warm up (first frames build lots, trees, life), then measure.
const tWarm = time(() => { for (let i = 0; i < 5; i++) { sim.advance(1 / 60); frame(1 / 60, i / 60); } });
for (const k of perSys.keys()) perSys.set(k, []);
tFrame = []; tTown = [];
let t = 0;
for (let i = 0; i < 600; i++) { t += 1 / 60; sim.advance(1 / 60); frame(1 / 60, t); }

// ---- draw calls ----
camera.place?.();
const cam = camera.cam;
cam.updateMatrixWorld(); cam.updateProjectionMatrix();
const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
const sphere = new THREE.Sphere();
function inView(o) {
  if (!o.frustumCulled) return true;
  if (o.isInstancedMesh) { if (o.boundingSphere === null) o.computeBoundingSphere(); sphere.copy(o.boundingSphere).applyMatrix4(o.matrixWorld); return frustum.intersectsSphere(sphere); }
  const g = o.geometry; if (!g) return true;
  if (!g.boundingSphere) g.computeBoundingSphere();
  sphere.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
  return frustum.intersectsSphere(sphere);
}
function trisOf(o) {
  const g = o.geometry; if (!g || !o.isMesh) return 0;
  const n = g.index ? g.index.count : g.attributes.position?.count || 0;
  return (n / 3) * (o.isInstancedMesh ? o.count : 1);
}
const rows = [];
function visibleChain(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }
scene.traverse((o) => {
  if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite)) return;
  if (!visibleChain(o)) return;
  if (o.isInstancedMesh && o.count === 0) return;
  const g = o.geometry;
  if (g && g.drawRange.count === 0) return;
  const groups = Array.isArray(o.material) ? Math.max(1, g.groups.length) : 1;
  let top = o; while (top.parent && top.parent !== world && top.parent !== scene) top = top.parent;
  rows.push({ o, top, calls: groups, cast: !!o.castShadow && o.isMesh, inView: inView(o), tris: trisOf(o) });
});
const total = rows.reduce((a, r) => a + r.calls, 0);
const view = rows.filter((r) => r.inView).reduce((a, r) => a + r.calls, 0);
const shadow = rows.filter((r) => r.cast).reduce((a, r) => a + r.calls, 0);
const tris = rows.reduce((a, r) => a + r.tris, 0);

// Group by top-level object name or type, for a rough who-draws-what.
const byTop = new Map();
for (const r of rows) {
  const k = owner.get(r.top) || '?';
  const e = byTop.get(k) || { calls: 0, cast: 0, tris: 0, n: 0 };
  e.calls += r.calls; e.cast += r.cast ? r.calls : 0; e.tris += r.tris; e.n++;
  byTop.set(k, e);
}

// ---- rebuild costs ----
const placed = sim.state.placed || [];
const rebuildTown = [];
for (let i = 0; i < 5; i++) {
  const id = placed[i % placed.length]?.id;
  if (!id) break;
  rebuildTown.push(time(() => { town.setRemoved([id]); }));
  rebuildTown.push(time(() => { town.setRemoved([]); }));
}

// Grown lots: one lot levels up, the frame that folds it back into the merged meshes.
const lotsSys = byId.get('lots');
const rebuildLots = [];
if (sim.state.lots.length) {
  for (let i = 0; i < 8; i++) {
    const l = sim.state.lots[i * 7 % sim.state.lots.length];
    l[1] = l[1] >= 5 ? 1 : l[1] + 1; sim.state.zoneRev++;
    let worst = 0;
    for (let k = 0; k < 90; k++) { t += 1 / 60; const a = performance.now(); lotsSys.frame({ dt: 1 / 60, t, simDt: 1 / 60, state: sim.state, tool: null }); worst = Math.max(worst, performance.now() - a); }
    rebuildLots.push(worst);
  }
}

// ---- sim tick ----
const ticks = [];
for (let i = 0; i < 600; i++) ticks.push(time(() => sim.tick()));

// ---- JS size: everything under src/ the site can load, plus three.js ----
const { execSync } = await import('node:child_process');
const files = execSync('git ls-files "src/*.js"', { cwd: ROOT }).toString().trim().split('\n');
const own = Buffer.concat(files.map((f) => readFileSync(join(ROOT, f))));
const three = readFileSync(join(ROOT, 'vendor/three/three.module.min.js'));
const gz = (b) => gzipSync(b, { level: 9 }).length;
const ownGz = files.reduce((a, f) => a + gz(readFileSync(join(ROOT, f))), 0); // per file, as a server sends them

const out = [];
out.push('# Nexus perf probe (Node, no GPU)');
out.push('');
out.push(`Town: ${BIG ? 'big stand-in' : 'starter'}, ${placed.length} placed buildings, ${(sim.state.lots || []).length} grown lots, ${Object.keys(sim.state.roads || {}).length} road tiles, ${(sim.state.trees || []).length} trees.`);
out.push('');
out.push('## Draw calls (estimate, starting camera)');
out.push(`- main pass, whole scene: ${total}`);
out.push(`- main pass, in view at start: ${view}`);
out.push(`- shadow pass casters: ${shadow} (counts towards renderer.info when shadows are on)`);
out.push(`- total per frame with shadows: about ${view + shadow} (budget 100)`);
out.push(`- triangles (main pass, whole scene): ${Math.round(tris).toLocaleString('en')}`);
out.push('');
out.push('| made by | renderables | calls | shadow casters | triangles |');
out.push('|---|---:|---:|---:|---:|');
for (const [k, e] of [...byTop].sort((a, b) => b[1].calls - a[1].calls)) out.push(`| ${k} | ${e.n} | ${e.calls} | ${e.cast} | ${Math.round(e.tris).toLocaleString('en')} |`);
out.push('');
out.push('## CPU per frame (600 frames at 60 Hz, render systems + town, no GL)');
out.push(`- p50 ${ms(pct(tFrame, 0.5))}, p95 ${ms(pct(tFrame, 0.95))}, max ${ms(Math.max(...tFrame))}`);
for (const [k, a] of [...perSys].filter(([, a]) => a.length).sort((x, y) => pct(y[1], 0.95) - pct(x[1], 0.95)).slice(0, 8)) out.push(`  - ${k}: p50 ${ms(pct(a, 0.5))}, p95 ${ms(pct(a, 0.95))}, max ${ms(Math.max(...a))}`);
out.push(`  - town sync: p50 ${ms(pct(tTown, 0.5))}, max ${ms(Math.max(...tTown))}`);
out.push('');
out.push('## Build and rebuild');
out.push(`- startup: ${Object.entries(tBuild).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${ms(v)}`).join(', ')}; first 5 frames ${ms(tWarm)}`);
out.push(`- town rebuild on one bulldoze / undo: p50 ${ms(pct(rebuildTown, 0.5))}, max ${ms(Math.max(...rebuildTown))}`);
if (rebuildLots.length) out.push(`- grown lots: worst frame after one lot levels up: p50 ${ms(pct(rebuildLots, 0.5))}, max ${ms(Math.max(...rebuildLots))} (${sim.state.lots.length} lots)`);
out.push('');
out.push('## Sim tick (600 ticks)');
out.push(`- p50 ${ms(pct(ticks, 0.5))}, p99 ${ms(pct(ticks, 0.99))}, max ${ms(Math.max(...ticks))} (budget 2 ms)`);
out.push('');
out.push('## JS size');
out.push(`- own code: ${files.length} files, ${(own.length / 1024).toFixed(0)} KB raw, ${(ownGz / 1024).toFixed(0)} KB gzipped per file`);
out.push(`- three.js: ${(three.length / 1024).toFixed(0)} KB raw, ${(gz(three) / 1024).toFixed(0)} KB gzipped`);
out.push(`- total gzipped: ${((ownGz + gz(three)) / 1024).toFixed(0)} KB (budget 300 KB)`);
console.log(out.join('\n'));
