// Building thumbnails for the build menus. Each model is drawn once, off screen, with the town's kit and warm light,
// then composed on a cream paper ground with a sage ground disc and a thin ink outline, and kept as a PNG data URL.
// Menus read the cache, so there is no per-frame cost and no new dependency. Without a document or WebGL this
// returns null and the menu shows a plain plate.
import * as THREE from '../../vendor/three/three.module.min.js';
import { ISO, orbitPose } from './camera-math.js';
import { addToBatch, makeParts, worldMatrix } from './buildings.js';
import { Batch, disposeAll } from './geom.js';
import { toon } from './materials.js';
import { mergeDecor } from './decor-geom.js';
import { canonicalDims, describe, modelById, footprintsOf } from '../world/models.js';
import { TILE } from '../world/grid.js';

const W = 192, H = 144;          // drawn size in pixels; the cards show it at about 96 by 72
const PAPER = '#F6EEDB', GROUND = '#CFDBA9', INK = '#2B2620', OUTLINE = 2.5;
const cache = new Map();
let renderer = null, broken = false, scratch = null, mask = null;

function rendererOf() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.setClearColor(0x000000, 0);
  }
  return renderer;
}

// A 2D canvas for the composition. Created on first use; `make` is the document's canvas factory.
function canvasOf(slot, make) {
  if (!slot) { slot = make(); slot.width = W; slot.height = H; }
  return slot;
}

// Frames the world group from the town's iso angle and composes the thumbnail: paper ground, a sage disc, an ink outline
// around the silhouette, and the picture on top. Returns a PNG data URL.
function snap(scene, world, minHalf = 4) {
  const r = rendererOf();
  const box = new THREE.Box3().setFromObject(world);
  const c = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  const half = Math.max(radius * 1.02, minHalf), aspect = W / H;
  const cam = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 1, 600);
  const p = orbitPose(c.x, c.z, ISO.az, ISO.elev, 200);
  cam.position.set(p.x, p.y + c.y, p.z);
  cam.lookAt(c);
  r.render(scene, cam);

  const picture = r.domElement;
  scratch = canvasOf(scratch, () => document.createElement('canvas'));
  mask = canvasOf(mask, () => document.createElement('canvas'));
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const g = out.getContext('2d');
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  g.fillStyle = GROUND; g.beginPath(); g.ellipse(W / 2, H * 0.82, W * 0.44, H * 0.1, 0, 0, Math.PI * 2); g.fill();
  // silhouette in ink, pushed out in eight directions, then the picture on top: a hand-cut outline
  const m = mask.getContext('2d');
  m.clearRect(0, 0, W, H); m.drawImage(picture, 0, 0, W, H);
  m.globalCompositeOperation = 'source-in'; m.fillStyle = INK; m.fillRect(0, 0, W, H); m.globalCompositeOperation = 'source-over';
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
    g.drawImage(mask, dx * OUTLINE, dy * OUTLINE, W, H);
  }
  g.drawImage(picture, 0, 0, W, H);
  return out.toDataURL('image/png');
}

// One model at one footprint and level. The model is drawn on a transparent WebGL canvas, then composed:
// paper ground, a sage disc under it, an ink outline around the silhouette, and the picture on top.
function draw(def, fw, fd, level, paint = null) {
  const r = rendererOf();
  const d = describe({ id: 'thumb-' + def.id, model: def.id, gx: 0, gz: 0, fw, fd, rot: 0, ...(paint ? { pal: paint.wall, trim: paint.trim, roof: paint.roof } : {}) }, level);
  d.x = 0; d.z = 0; d.y = 0.1;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xFFF3DC, 0x8A8F62, 0.75));
  const sun = new THREE.DirectionalLight(0xFFE3B8, 0.95); sun.position.set(-40, 70, 30); scene.add(sun);
  const world = new THREE.Group(); scene.add(world);
  const batch = new Batch();
  addToBatch(batch, makeParts(d), worldMatrix(d), false);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(fw * TILE - 0.1, 0.1, fd * TILE - 0.1), toon(0xEAE1D5));
  plate.position.set(0, 0.03, 0); world.add(plate);
  const built = batch.build(world);

  const url = snap(scene, world);
  disposeAll(built, world);
  plate.geometry.dispose();
  return url;
}

// The thumbnail of a model's largest drawn footprint (the one that shows the most building), as a PNG data URL,
// or null when there is no document, no WebGL or no such model. Cached per model, footprint and level.
// `paint` ({ wall?, trim?, roof? } keys) dresses the model in those colours, for the town-wide Paint preview.
export function thumbFor(modelId, level = 1, paint = null) {
  if (typeof document === 'undefined' || broken) return null;
  const def = modelById(modelId);
  if (!def) return null;
  const sizes = footprintsOf(def), [cw, cd] = canonicalDims(def, sizes[sizes.length - 1]);
  const key = `${modelId}|${cw}x${cd}|${level}` + (paint ? `|${paint.wall || ''}|${paint.trim || ''}|${paint.roof || ''}` : '');
  if (cache.has(key)) return cache.get(key);
  let url = null;
  try {
    url = draw(def, cw, cd, level, paint);
  } catch (err) {
    if (!renderer) broken = true; // no WebGL here: stop trying for the rest of the session
    url = null;
  }
  cache.set(key, url);
  return url;
}

// The thumbnail of one decoration kind, standing on a cream plate, or null without a document or WebGL.
const decorCache = new Map();
export function decorThumb(k) {
  if (typeof document === 'undefined' || broken) return null;
  if (decorCache.has(k)) return decorCache.get(k);
  let url = null;
  try {
    rendererOf();
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xFFF3DC, 0x8A8F62, 0.75));
    const sun = new THREE.DirectionalLight(0xFFE3B8, 0.95); sun.position.set(-40, 70, 30); scene.add(sun);
    const world = new THREE.Group(); scene.add(world);
    const geo = mergeDecor([{ k, gx: 0, gz: 0, rot: 0 }], 1, null, true);
    const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true }));
    const plate = new THREE.Mesh(new THREE.BoxGeometry(TILE - 0.1, 0.1, TILE - 0.1), toon(0xEAE1D5));
    plate.position.set(0, -0.05, 0);
    world.add(plate, mesh);
    url = snap(scene, world, 2.2);
    geo.dispose(); mesh.material.dispose(); plate.geometry.dispose();
  } catch (err) {
    if (!renderer) broken = true;
    url = null;
  }
  decorCache.set(k, url);
  return url;
}
