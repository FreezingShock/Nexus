// The town's buildings: merged meshes rebuilt from data, picking proxies, selection outline, upgrade pop, night windows.
import * as THREE from '../../vendor/three/three.module.min.js';
import { makeParts, worldMatrix, addToBatch } from './buildings.js';
import { Batch, disposeAll } from './geom.js';
import { lineMat } from './materials.js';

const HULL = new THREE.MeshBasicMaterial({ color: 0x6DB6EC, side: THREE.BackSide });
const proxyMat = new THREE.MeshBasicMaterial();

// One call: merge a list of { parts, world } into meshes under `parent`.
export function mergeBuildings(parent, items, night) {
  const batch = new Batch();
  for (const it of items) addToBatch(batch, it.parts, it.world, night);
  return batch.build(parent);
}

export function createTown(root, layout) {
  const group = new THREE.Group(); root.add(group);
  const selGroup = new THREE.Group(); root.add(selGroup);
  const entries = new Map();
  let built = [], removed = new Set(), night = false, popping = null, selected = null;

  for (const b of layout.buildings) {
    const parts = makeParts(b), world = worldMatrix(b);
    const bodyPart = parts.find((p) => p.body);
    const proxy = new THREE.Mesh(bodyPart.geo, proxyMat);
    proxy.matrixAutoUpdate = false;
    proxy.matrix.multiplyMatrices(world, bodyPart.local);
    proxy.matrixWorld.copy(proxy.matrix);
    entries.set(b.id, { b, parts, world, proxy });
  }

  function applyNight() {
    for (const m of built) if (m.isMesh && m.userData.day.userData.night) m.material = night ? m.userData.day.userData.night : m.userData.day;
  }
  function rebuild(excludeId) {
    disposeAll(built, group);
    const items = [];
    for (const e of entries.values()) if (!removed.has(e.b.id) && e.b.id !== excludeId) items.push(e);
    built = mergeBuildings(group, items, false);
    applyNight();
  }

  function clearHull() { selGroup.clear(); } // hull meshes share the parts' geometry: nothing to dispose
  // Back-face copy of every part, grown a little: the silhouette outline follows the camera.
  function setHull(id) {
    clearHull(); selected = id;
    if (!id || !entries.has(id)) { selected = null; return; }
    const e = entries.get(id), sz = new THREE.Vector3(), c = new THREE.Vector3(), t = 0.14;
    placeSel(e.b, 1, 1, 1);
    for (const p of e.parts) {
      p.geo.computeBoundingBox();
      const bb = p.geo.boundingBox; bb.getSize(sz); bb.getCenter(c);
      const sx = (sz.x + 2 * t) / Math.max(sz.x, 0.05), sy = (sz.y + 2 * t) / Math.max(sz.y, 0.05), sz2 = (sz.z + 2 * t) / Math.max(sz.z, 0.05);
      const adj = new THREE.Matrix4().compose(new THREE.Vector3(c.x * (1 - sx), c.y * (1 - sy), c.z * (1 - sz2)), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz2));
      const h = new THREE.Mesh(p.geo, HULL);
      h.matrixAutoUpdate = false;
      h.matrix.multiplyMatrices(p.local, adj);
      selGroup.add(h);
    }
  }
  function placeSel(b, sx, sy, sz) {
    selGroup.position.set(b.x, b.y ?? 0.1, b.z); selGroup.rotation.set(0, b.rotY, 0); selGroup.scale.set(sx, sy, sz);
  }

  function endPop() {
    if (!popping) return;
    root.remove(popping.group);
    for (const o of popping.group.children) if (o.isLineSegments) o.geometry.dispose();
    popping = null;
    rebuild();
    if (selected) placeSel(entries.get(selected).b, 1, 1, 1);
  }
  // Upgrade pop: the building leaves the merged mesh for half a second and squashes as its own group.
  function pop(id) {
    endPop();
    const e = entries.get(id); if (!e) return;
    rebuild(id);
    const g = new THREE.Group();
    g.position.set(e.b.x, e.b.y ?? 0.1, e.b.z); g.rotation.y = e.b.rotY;
    for (const p of e.parts) {
      const mat = p.body ? [p.facadeMat, p.facadeMat, p.mat, p.mat, p.facadeMat, p.facadeMat].map((m) => (night && m.userData.night ? m.userData.night : m)) : p.mat;
      const m = new THREE.Mesh(p.geo, mat);
      m.matrixAutoUpdate = false; m.matrix.copy(p.local); m.castShadow = m.receiveShadow = true;
      g.add(m);
      if (p.edge) { const l = new THREE.LineSegments(new THREE.EdgesGeometry(p.geo, 30), lineMat); l.matrixAutoUpdate = false; l.matrix.copy(p.local); g.add(l); }
    }
    root.add(g);
    popping = { id, group: g, t: 0 };
  }

  rebuild();

  return {
    setRemoved(ids) {
      const next = new Set(ids);
      if (next.size === removed.size && [...next].every((i) => removed.has(i))) return;
      removed = next; endPop(); rebuild();
      if (selected && removed.has(selected)) setHull(null);
    },
    setNight(on) { if (on === night) return; night = on; applyNight(); },
    select: setHull,
    pop,
    update(dt) {
      if (!popping) return;
      popping.t += dt;
      const k = popping.t / 0.5;
      if (k >= 1) { endPop(); return; }
      const s = Math.sin(k * Math.PI), sx = 1 + 0.12 * s, sy = 1 + 0.18 * s;
      popping.group.scale.set(sx, sy, sx);
      if (selected === popping.id) placeSel(entries.get(selected).b, sx, sy, sx);
    },
    // Nearest alive building under the ray, or null.
    pick(raycaster) {
      const list = [];
      for (const e of entries.values()) if (!removed.has(e.b.id)) list.push(e.proxy);
      const hit = raycaster.intersectObjects(list, false)[0];
      if (!hit) return null;
      for (const e of entries.values()) if (e.proxy === hit.object) return e.b.id;
      return null;
    },
    hideSelection(v) { selGroup.visible = !v; },
  };
}
