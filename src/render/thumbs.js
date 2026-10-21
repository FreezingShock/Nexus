// Building thumbnails for the build menus. Each model is drawn once, off screen, with the same kit, lights and
// toon materials as the town, then kept as a PNG data URL. Menus read the cache, so there is no per-frame cost and
// no new dependency. Without a document or WebGL this returns null and the menu shows a plain plate.
import * as THREE from '../../vendor/three/three.module.min.js';
import { ISO, orbitPose } from './camera-math.js';
import { addToBatch, makeParts, worldMatrix } from './buildings.js';
import { Batch, disposeAll } from './geom.js';
import { toon } from './materials.js';
import { canonicalDims, describe, modelById, footprintsOf } from '../world/models.js';
import { TILE } from '../world/grid.js';

const W = 176, H = 132, SCALE = 2; // css pixels, drawn at 2x so the card stays sharp
const cache = new Map();
let renderer = null, broken = false;

function rendererOf() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(SCALE);
    renderer.setSize(W, H, false);
    renderer.setClearColor(0x000000, 0);
  }
  return renderer;
}

// One model at one footprint and level, drawn on a cream plate and framed to fit. Returns a PNG data URL.
function draw(def, fw, fd, level) {
  const r = rendererOf();
  const d = describe({ id: 'thumb-' + def.id, model: def.id, gx: 0, gz: 0, fw, fd, rot: 0 }, level);
  d.x = 0; d.z = 0; d.y = 0.1;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xFFF3DC, 0x8A8F62, 1.0));
  const sun = new THREE.DirectionalLight(0xFFE3B8, 0.9); sun.position.set(-40, 70, 30); scene.add(sun);
  const world = new THREE.Group(); scene.add(world);
  const batch = new Batch();
  addToBatch(batch, makeParts(d), worldMatrix(d), false);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(fw * TILE - 0.1, 0.1, fd * TILE - 0.1), toon(0xEAE1D5));
  plate.position.set(0, 0.03, 0); world.add(plate);
  const built = batch.build(world);

  const box = new THREE.Box3().setFromObject(world);
  const c = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  const half = Math.max(radius * 1.08, 4), aspect = W / H;
  const cam = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 1, 600);
  const p = orbitPose(c.x, c.z, ISO.az, ISO.elev, 200);
  cam.position.set(p.x, p.y + c.y, p.z);
  cam.lookAt(c);
  r.render(scene, cam);
  const url = r.domElement.toDataURL('image/png');
  disposeAll(built, world);
  plate.geometry.dispose();
  return url;
}

// The thumbnail of a model's largest drawn footprint (the one that shows the most building), as a PNG data URL,
// or null when there is no document, no WebGL or no such model. Cached per model, footprint and level.
export function thumbFor(modelId, level = 1) {
  if (typeof document === 'undefined' || broken) return null;
  const def = modelById(modelId);
  if (!def) return null;
  const sizes = footprintsOf(def), [cw, cd] = canonicalDims(def, sizes[sizes.length - 1]);
  const key = `${modelId}|${cw}x${cd}|${level}`;
  if (cache.has(key)) return cache.get(key);
  let url = null;
  try {
    url = draw(def, cw, cd, level);
  } catch (err) {
    if (!renderer) broken = true; // no WebGL here: stop trying for the rest of the session
    url = null;
  }
  cache.set(key, url);
  return url;
}
