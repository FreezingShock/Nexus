// The render side. Reads sim snapshots, never writes them. Owns the renderer, scene and camera.
import * as THREE from '../../vendor/three/three.module.min.js';
import { createCamera } from './camera.js';
import { createLighting } from './night.js';
import { buildTerrain, buildFarms } from './terrain.js';
import { buildStatic, buildTrees } from './props.js';
import { registryOf } from '../core/registry.js';
import { renderSystems } from './systems/index.js';
import { createTown } from './town.js';
import { createDusk } from './dusk.js';

const SNAP_W = 480, SNAP_H = 360;

export function createScene({ stage, layout, grid, onPick }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();
  const lighting = createLighting(scene);
  const world = new THREE.Group(); scene.add(world);
  const camera = createCamera();

  buildTerrain(world);
  buildFarms(world, layout.farms);
  buildStatic(world, layout);
  buildTrees(world, layout);
  const town = createTown(world, layout);
  const sysDefs = registryOf('render systems', renderSystems).list();
  const mods = sysDefs.map((d) => d.create({ THREE, world, layout, grid, camera, scene }) || {});
  const byId = new Map(sysDefs.map((d, i) => [d.id, mods[i]]));
  let dusk = null, nightOn = false, drag = null;

  function resize() {
    const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    canvas.style.width = '100%'; canvas.style.height = '100%';
    camera.resize(w, h);
  }
  new ResizeObserver(resize).observe(stage);

  // pointer: drag to pan, click to pick, wheel to zoom
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 5) { canvas.classList.add('drag'); camera.pan(dx, dy, canvas.clientHeight); }
  });
  canvas.addEventListener('pointerup', (e) => {
    const was = drag; drag = null; canvas.classList.remove('drag');
    if (!was || was.moved > 5) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera.cam);
    onPick(town.pick(ray));
  });
  canvas.addEventListener('pointercancel', () => { drag = null; canvas.classList.remove('drag'); });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); camera.zoomBy(e.deltaY < 0 ? 1.12 : 0.89); }, { passive: false });

  resize(); camera.place();

  let snapTarget = null;
  return {
    canvas, renderer, camera,
    // Per-frame. `simDt` is wall dt scaled by game speed (0 when paused).
    frame(dt, t, simDt, s, tool) {
      camera.step(dt, drag && drag.moved > 5);
      const f = { dt, t, simDt, state: s, tool };
      for (const m of mods) if (m.frame) m.frame(f);
      const blend = lighting.update(dt, s.night);
      const on = blend > 0.5;
      if (on !== nightOn) { nightOn = on; town.setNight(on); for (const m of mods) if (m.setNight) m.setNight(on); }
      town.setRemoved(s.removed);
      town.update(dt);
      renderer.render(scene, camera.cam);
    },
    // The object a render system returned from create(), for UI modules that drive it (e.g. zoning's brush).
    sys: (id) => byId.get(id) || null,
    // World point under a screen position on the ground plane (y = 0), or null. Shared by every drawing tool.
    ground(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera.cam);
      const o = ray.ray.origin, d = ray.ray.direction;
      if (Math.abs(d.y) < 1e-6) return null;
      const k = -o.y / d.y;
      return { x: o.x + d.x * k, z: o.z + d.z * k };
    },
    select: (id) => town.select(id),
    pop: (id) => town.pop(id),
    rotate: (d) => camera.rotate(d),
    focus: (x, z) => camera.focus(x, z),
    snap: (night) => lighting.snap(night),

    // Renders the town to a 4:3 target and copies it into `dest` (the postcard photo).
    snapshot(dest) {
      if (!snapTarget) snapTarget = new THREE.WebGLRenderTarget(SNAP_W, SNAP_H);
      const v = camera.view, half = v.half / v.zoom * 0.6;
      const c = camera.cam.clone();
      c.left = -half * 4 / 3; c.right = half * 4 / 3; c.top = half; c.bottom = -half; c.zoom = 1; c.updateProjectionMatrix();
      town.hideSelection(true);
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(snapTarget); renderer.render(scene, c);
      const buf = new Uint8Array(SNAP_W * SNAP_H * 4);
      renderer.readRenderTargetPixels(snapTarget, 0, 0, SNAP_W, SNAP_H, buf);
      renderer.setRenderTarget(prev); town.hideSelection(false);
      const tmp = document.createElement('canvas'); tmp.width = SNAP_W; tmp.height = SNAP_H;
      tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buf), SNAP_W, SNAP_H), 0, 0);
      const x = dest.getContext('2d'); x.save(); x.translate(0, dest.height); x.scale(1, -1); x.drawImage(tmp, 0, 0, dest.width, dest.height); x.restore();
    },
    renderDusk(t, canvases) { if (!dusk) dusk = createDusk(renderer); dusk.render(t, canvases); },
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
  };
}
