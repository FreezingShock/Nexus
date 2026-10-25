// The town's buildings: merged meshes rebuilt from data, picking proxies, selection outline, upgrade pop, night windows.
// Buildings come from state.placed: the starter town and whatever the player has placed. Their look follows
// their level (state.levels), so an upgrade rebuilds the building with its new details.
import * as THREE from '../../vendor/three/three.module.min.js';
import { makeParts, worldMatrix, addToBatch } from './buildings.js';
import { describe } from '../world/models.js';
import { Batch, disposeAll } from './geom.js';
import { lineMat } from './materials.js';
import { nightWall } from './models/materials.js';

const HULL = new THREE.MeshBasicMaterial({ color: 0x6DB6EC, side: THREE.BackSide });
const proxyMat = new THREE.MeshBasicMaterial();

// One call: merge a list of { parts, world } into meshes under `parent`.
export function mergeBuildings(parent, items, night) {
  const batch = new Batch();
  for (const it of items) addToBatch(batch, it.parts, it.world, night);
  return batch.build(parent);
}

// A click target for the whole building (tower and roof included), a box around its parts.
export function proxyFor(parts, world) {
  const bb = new THREE.Box3(), tmp = new THREE.Box3();
  for (const p of parts) { p.geo.computeBoundingBox(); tmp.copy(p.geo.boundingBox).applyMatrix4(p.local); bb.union(tmp); }
  const size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z).translate(c.x, c.y, c.z), proxyMat);
  proxy.matrixAutoUpdate = false;
  proxy.matrix.copy(world); proxy.matrixWorld.copy(world);
  return proxy;
}

// The selection outline: a back-face copy of every part, grown a little, so the silhouette follows the camera.
// Shared with grown lots (render/systems/lots.js), which draw their own outline in their own group.
const HULL_GROW = 0.14;
export function addHull(group, parts) {
  const sz = new THREE.Vector3(), c = new THREE.Vector3(), t = HULL_GROW;
  for (const p of parts) {
    p.geo.computeBoundingBox();
    const bb = p.geo.boundingBox; bb.getSize(sz); bb.getCenter(c);
    const sx = (sz.x + 2 * t) / Math.max(sz.x, 0.05), sy = (sz.y + 2 * t) / Math.max(sz.y, 0.05), sz2 = (sz.z + 2 * t) / Math.max(sz.z, 0.05);
    const adj = new THREE.Matrix4().compose(new THREE.Vector3(c.x * (1 - sx), c.y * (1 - sy), c.z * (1 - sz2)), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz2));
    const h = new THREE.Mesh(p.geo, HULL);
    h.matrixAutoUpdate = false;
    h.matrix.multiplyMatrices(p.local, adj);
    group.add(h);
  }
}
export function placeHull(group, b, sx, sy, sz) {
  group.position.set(b.x, b.y ?? 0.1, b.z); group.rotation.set(0, b.rotY, 0); group.scale.set(sx, sy, sz);
}

// hooks.burst(x, z, radius, count): a dust puff when a building levels up (the puffs system).
export function createTown(root, hooks = {}) {
  const group = new THREE.Group(); root.add(group);
  const selGroup = new THREE.Group(); root.add(selGroup);
  const entries = new Map();
  let built = [], removed = new Set(), night = false, popping = null, selected = null;
  let placedSig = '', wantPop = new Set(), wantSettle = new Set();
  let lifeRev = 0, lifeList = [], lifeSeen = -1; // for render/systems/life-*.js: what is standing, and a counter that moves when it changes

  // desc -> entry. `base` is the level the building starts at before any upgrade.
  function addEntry(desc, base) {
    const world = worldMatrix(desc), parts = makeParts(desc);
    entries.set(desc.id, { b: desc, desc, base, level: desc.level, parts, world, proxy: proxyFor(parts, world) });
  }
  function regenerate(e, level) {
    e.level = level;
    e.desc = e.b = { ...e.desc, level };
    e.parts = makeParts(e.desc); e.baked = null;
    e.proxy.geometry.dispose();
    e.proxy = proxyFor(e.parts, e.world);
  }

  function applyNight() {
    for (const m of built) if (m.isMesh && nightWall(m.userData.day)) m.material = night ? nightWall(m.userData.day) : m.userData.day;
  }
  function rebuild(excludeId) {
    lifeRev++;
    disposeAll(built, group);
    // Each building is baked into world-space arrays once (and again only when its parts change), so a rebuild is a copy.
    const batch = new Batch();
    for (const e of entries.values()) {
      if (removed.has(e.b.id) || e.b.id === excludeId) continue;
      if (!e.baked) { const one = new Batch(); addToBatch(one, e.parts, e.world, false); e.baked = one.bake(); }
      batch.addBaked(e.baked);
    }
    built = batch.build(group);
    applyNight();
  }

  function clearHull() { selGroup.clear(); } // hull meshes share the parts' geometry: nothing to dispose
  function setHull(id) {
    clearHull(); selected = id;
    if (!id || !entries.has(id)) { selected = null; return; }
    const e = entries.get(id);
    placeSel(e.b, 1, 1, 1);
    addHull(selGroup, e.parts);
  }
  function placeSel(b, sx, sy, sz) { placeHull(selGroup, b, sx, sy, sz); }

  function endPop() {
    if (!popping) return;
    root.remove(popping.group);
    for (const o of popping.group.children) if (o.isLineSegments) o.geometry.dispose();
    popping = null;
    rebuild();
    if (selected) placeSel(entries.get(selected).b, 1, 1, 1);
  }
  // Upgrade pop: the building leaves the merged mesh for half a second and squashes as its own group.
  function startPop(id) {
    endPop();
    const e = entries.get(id); if (!e) return;
    rebuild(id);
    const g = new THREE.Group();
    g.position.set(e.b.x, e.b.y ?? 0.1, e.b.z); g.rotation.y = e.b.rotY;
    for (const p of e.parts) {
      const mat = p.body ? [p.facadeMat, p.facadeMat, p.mat, p.mat, p.facadeMat, p.facadeMat].map((m) => (night && nightWall(m) ? nightWall(m) : m)) : p.mat;
      const m = new THREE.Mesh(p.geo, mat);
      m.matrixAutoUpdate = false; m.matrix.copy(p.local); m.castShadow = m.receiveShadow = true;
      g.add(m);
      if (p.edge) { const l = new THREE.LineSegments(new THREE.EdgesGeometry(p.geo, 30), lineMat); l.matrixAutoUpdate = false; l.matrix.copy(p.local); g.add(l); }
    }
    root.add(g);
    popping = { id, group: g, t: 0 };
    if (hooks.burst) hooks.burst(e.b.x, e.b.z, 3.4, 16);
  }

  rebuild();

  return {
    setRemoved(ids) {
      const next = new Set(ids);
      if (next.size === removed.size && [...next].every((i) => removed.has(i))) return;
      removed = next; endPop(); rebuild();
      if (selected && removed.has(selected)) setHull(null);
    },
    // Syncs placed buildings and levels from the sim snapshot. Cheap when nothing changed.
    setState(s) {
      let dirty = false;
      const placed = s.placed || [], sig = placed.map((r) => r.id).join(',');
      if (sig !== placedSig) {
        placedSig = sig;
        const keep = new Set(placed.map((r) => r.id));
        for (const [id, e] of entries) if (!keep.has(id)) { e.proxy.geometry.dispose(); entries.delete(id); if (selected === id) setHull(null); }
        for (const r of placed) if (!entries.has(r.id)) { const d = describe(r, 1); if (d) addEntry(d, 1); }
        dirty = true;
      }
      // A repaint changes a record's palette or roof in place: describe it again and rebuild that building.
      for (const r of placed) {
        const e = entries.get(r.id);
        if (!e) continue;
        const sig = (r.pal || '') + '|' + (r.roof || '') + '|' + (r.trim || '');
        if (e.paint === undefined) e.paint = sig; // first sight: already drawn with this paint
        if (e.paint === sig) continue;
        e.paint = sig;
        const d = describe(r, e.level);
        if (!d) continue;
        e.desc = e.b = d;
        e.parts = makeParts(d); e.baked = null;
        e.proxy.geometry.dispose();
        e.proxy = proxyFor(e.parts, e.world);
        if (selected === r.id) setHull(r.id);
        if (hooks.burst) hooks.burst(d.x, d.z, 2.4, 10);
        dirty = true;
      }
      let popId = null;
      for (const id of wantSettle) if (entries.has(id)) { wantSettle.delete(id); if (!removed.has(id)) popId = id; } // a freshly placed building settles with the upgrade squash
      for (const e of entries.values()) {
        const lv = (s.levels && s.levels[e.b.id]) ?? e.base;
        if (lv === e.level) continue;
        regenerate(e, lv);
        if (selected === e.b.id) setHull(e.b.id);
        if (wantPop.delete(e.b.id) && !removed.has(e.b.id)) popId = e.b.id; else dirty = true;
      }
      if (popId) startPop(popId); else if (dirty) { endPop(); rebuild(); }
    },
    setNight(on) { if (on === night) return; night = on; applyNight(); },
    select: setHull,
    pop(id) { wantPop.add(id); setTimeout(() => wantPop.delete(id), 1500); },
    // Asks for the squash on a building that may not be drawn yet (a placement event arrives before the next frame's setState).
    settle(id) { wantSettle.add(id); setTimeout(() => wantSettle.delete(id), 1500); },
    update(dt) {
      if (!popping) return;
      popping.t += dt;
      const k = popping.t / 0.5;
      if (k >= 1) { endPop(); return; }
      const s = Math.sin(k * Math.PI), sx = 1 + 0.12 * s, sy = 1 + 0.18 * s;
      popping.group.scale.set(sx, sy, sx);
      if (selected === popping.id) placeSel(entries.get(selected).b, sx, sy, sx);
    },
    // Nearest alive building under the ray as { id, d }, or null. d is the distance, so trees can be compared with it.
    probe(raycaster) {
      const list = [];
      for (const e of entries.values()) if (!removed.has(e.b.id)) list.push(e.proxy);
      const hit = raycaster.intersectObjects(list, false)[0];
      if (!hit) return null;
      for (const e of entries.values()) if (e.proxy === hit.object) return { id: e.b.id, d: hit.distance };
      return null;
    },
    pick(raycaster) { const h = this.probe(raycaster); return h ? h.id : null; },
    hideSelection(v) { selGroup.visible = !v; },
    // The placed buildings now standing ({ b, parts, world } each; parts.sites says where life can happen) and a counter
    // that changes whenever the set or a building's look does. The list is rebuilt only when the counter moved.
    lifeRev: () => lifeRev,
    lifeEntries() {
      if (lifeSeen !== lifeRev) { lifeSeen = lifeRev; lifeList = [...entries.values()].filter((e) => !removed.has(e.b.id)); }
      return lifeList;
    },
  };
}
