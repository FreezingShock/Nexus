// The building kit preview: every model at every size and level on a tile grid, with triangle and draw call counts.
// Open /kit.html on the dev server. Same renderer, lights, materials and merging as the town, so what you see here is what the game draws.
import * as THREE from '../../vendor/three/three.module.min.js';
import { createCamera } from '../render/camera.js';
import { createLighting } from '../render/night.js';
import { toon } from '../render/materials.js';
import { Batch, disposeAll } from '../render/geom.js';
import { makeParts, worldMatrix, addToBatch } from '../render/buildings.js';
import { trianglesOf } from '../render/models/builders.js';
import { CATEGORIES, LANG, canonicalDims, describe, footprintsOf, modelsIn } from '../world/models.js';
import { TILE } from '../world/grid.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);
const canvas = renderer.domElement;
const scene = new THREE.Scene();
const lighting = createLighting(scene);
const camera = createCamera();
camera.view.half = 34; camera.view.tzoom = camera.view.zoom = 1.25; camera.view.az = camera.view.taz = 0; // front-on, so each model sits in a row
const world = new THREE.Group(); scene.add(world);

// a calm ground: sage field, one pale plate per lot, tile lines on top
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), toon(0x8FA56B));
ground.receiveShadow = true; ground.position.y = -0.02; world.add(ground);

const ui = { model: '', cat: 'home', level: 1, all: false, rot: 0, seedBump: 0, night: false, pal: '' };
let built = [], plates = [], stats = [], night = false;
const nameLabels = [];

// Rows of lots, front-on: each model's sizes (or its five levels) side by side, a wider gap between models.
// A model that would run past ROW_W starts a new row, and rows are spaced so the tallest tower clears the one behind it.
const ROW_W = 62, ROW_Z = 19;
function layout() {
  const cells = [], defs = modelsIn(ui.cat).filter((m) => !ui.model || m.id === ui.model);
  let x = 0, row = 0;
  defs.forEach((def) => {
    const sizes = footprintsOf(def), cols = ui.all ? [1, 2, 3, 4, 5] : sizes.map((_, i) => i + 1);
    const group = cols.map((c, i) => {
      const size = ui.all ? sizes[0] : sizes[i], [cw, cd] = canonicalDims(def, size);
      return { def, size, fw: ui.rot % 2 ? cd : cw, fd: ui.rot % 2 ? cw : cd, level: ui.all ? c : ui.level, col: i };
    });
    const width = group.reduce((a, g) => a + g.fw * TILE + TILE, 0);
    if (x > 0 && x + width > ROW_W) { x = 0; row++; }
    for (const g of group) { cells.push({ ...g, x: x + g.fw * TILE / 2, z: row * ROW_Z + g.fd * TILE / 2, row }); x += g.fw * TILE + TILE; }
    x += TILE;
  });
  // center each row on x = 0 and the whole sheet on z = 0
  const rows = Math.max(...cells.map((c) => c.row)) + 1;
  for (let r = 0; r < rows; r++) {
    const rc = cells.filter((c) => c.row === r), w = Math.max(...rc.map((c) => c.x + c.fw * TILE / 2)) - TILE;
    for (const c of rc) { c.x -= w / 2; c.z -= (rows - 1) * ROW_Z / 2 + 3; }
  }
  return cells;
}

function rebuild() {
  disposeAll(built, world);
  for (const p of plates) { world.remove(p); p.geometry.dispose(); }
  plates = []; stats = [];
  const batch = new Batch();
  const cells = layout();
  const plateMat = toon(0xEAE1D5);
  for (const c of cells) {
    const rec = { id: 'kit-' + c.def.id + '-' + c.size.join('x') + '-' + ui.seedBump, model: c.def.id, gx: 0, gz: 0, fw: c.fw, fd: c.fd, rot: ui.rot, pal: ui.pal || undefined };
    const d = describe(rec, c.level);
    d.x = c.x; d.z = c.z; d.y = 0.1;
    const parts = makeParts(d);
    addToBatch(batch, parts, worldMatrix(d), false);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(c.fw * TILE - 0.1, 0.1, c.fd * TILE - 0.1), plateMat);
    plate.position.set(c.x, 0.03, c.z); plate.receiveShadow = true; world.add(plate); plates.push(plate);
    stats.push({ c, d, tris: Math.round(trianglesOf(parts)), parts: parts.length });
  }
  built = batch.build(world);
  applyNight();
  drawStats(); drawLabels(cells);
}

function applyNight() {
  for (const m of built) if (m.isMesh && m.userData.day.userData.night) m.material = night ? m.userData.day.userData.night : m.userData.day;
}

function drawStats() {
  const rows = stats.map((s) => `<tr><td>${s.c.def.name}</td><td>${s.c.size[0]}×${s.c.size[1]}${ui.all ? ' L' + s.c.level : ''}</td><td>${s.d.floors} fl</td><td>${s.tris}</td></tr>`).join('');
  const total = stats.reduce((a, s) => a + s.tris, 0), max = Math.max(...stats.map((s) => s.tris));
  const open = $('stats').querySelector('details')?.open ? ' open' : '';
  $('stats').innerHTML = `<details${open}><summary class="h-disp">Triangles: ${stats.length} buildings, largest ${max}</summary><table><tr><th>Model</th><th>Size</th><th>Storeys</th><th>Tris</th></tr>${rows}<tr class="sum"><td colspan="3">All together</td><td>${total}</td></tr></table></details>
  <p class="sub" id="calls" style="margin:8px 0 0"></p>`;
}

const labelEls = [];
function drawLabels(cells) {
  const host = $('labels'); host.innerHTML = ''; labelEls.length = 0;
  const seen = new Set();
  for (const c of cells) {
    const el = document.createElement('span');
    el.textContent = ui.all ? 'L' + c.level : c.size[0] + ' × ' + c.size[1];
    el.className = 'sm'; host.appendChild(el);
    labelEls.push({ el, x: c.x, z: c.z + c.fd * TILE / 2 + 0.9 });
    if (!seen.has(c.def.id)) {
      seen.add(c.def.id);
      const n = document.createElement('span'); n.textContent = c.def.name; host.appendChild(n);
      labelEls.push({ el: n, x: c.x - c.fw * TILE / 2 + 1, z: c.z - c.fd * TILE / 2 + 6.4, left: true });
    }
  }
}

// ---- controls ----
function btn(host, label, active, on) {
  const b = document.createElement('button'); b.className = 'tog'; b.textContent = label; b.setAttribute('aria-pressed', String(active)); b.onclick = on; host.appendChild(b);
}
function controls() {
  const cats = $('cats'); cats.innerHTML = '';
  for (const c of CATEGORIES) btn(cats, c.name, c.id === ui.cat, () => { ui.cat = c.id; ui.model = ''; controls(); rebuild(); });
  const sel = $('model'); sel.innerHTML = '<option value="">All ' + CATEGORIES.find((c) => c.id === ui.cat).name.toLowerCase() + '</option>' + modelsIn(ui.cat).map((m) => `<option value="${m.id}">${m.name}</option>`).join(''); sel.value = ui.model;
  const lv = $('levels'); lv.innerHTML = '';
  for (let i = 1; i <= LANG.MAX_LEVEL; i++) btn(lv, 'L' + i, !ui.all && i === ui.level, () => { ui.level = i; ui.all = false; controls(); rebuild(); });
  $('mode').setAttribute('aria-pressed', String(ui.all));
}
$('mode').onclick = () => { ui.all = !ui.all; controls(); rebuild(); };
$('turn').onclick = () => { ui.rot = (ui.rot + 1) % 4; rebuild(); };
$('reroll').onclick = () => { ui.seedBump++; rebuild(); };
$('night').onclick = () => { ui.night = !ui.night; $('night').setAttribute('aria-pressed', String(ui.night)); };
$('model').onchange = (e) => { ui.model = e.target.value; rebuild(); };
$('pal').onchange = (e) => { ui.pal = e.target.value; rebuild(); };

// ---- camera ----
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); canvas.classList.add('drag'); });
canvas.addEventListener('pointermove', (e) => { if (!drag) return; camera.pan(e.clientX - drag.x, e.clientY - drag.y, canvas.clientHeight); drag.x = e.clientX; drag.y = e.clientY; });
canvas.addEventListener('pointerup', () => { drag = null; canvas.classList.remove('drag'); });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); camera.zoomBy(e.deltaY < 0 ? 1.12 : 0.89); }, { passive: false });
addEventListener('keydown', (e) => { const k = e.key.toLowerCase(); if (k === 'q') camera.rotate(-1); else if (k === 'e') camera.rotate(1); });
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false); canvas.style.width = '100%'; canvas.style.height = '100%'; camera.resize(w, h);
}
new ResizeObserver(resize).observe(stage);

const v = new THREE.Vector3();
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  camera.step(dt, !!drag);
  const blend = lighting.update(dt, ui.night ? 1 : 0), on = blend > 0.5;
  if (on !== night) { night = on; applyNight(); }
  renderer.render(scene, camera.cam);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  for (const l of labelEls) {
    v.set(l.x, 0.2, l.z).project(camera.cam);
    l.el.style.left = ((v.x + 1) / 2 * w + (l.left ? -40 : 0)) + 'px'; l.el.style.top = ((1 - v.y) / 2 * h) + 'px';
  }
  const c = $('calls'); if (c) c.textContent = renderer.info.render.calls + ' draw calls · ' + Math.round(renderer.info.render.triangles) + ' triangles drawn (incl. shadow pass)';
  requestAnimationFrame(frame);
}

controls(); resize(); camera.place(); rebuild();
requestAnimationFrame(frame);
window.__kit = { ui, rebuild, controls, stats: () => stats, renderer, camera };
