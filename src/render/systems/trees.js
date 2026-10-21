// Trees: every tree in state.trees as instanced meshes, rebuilt whenever that list changes (the sim makes a new array
// on each change). Broadleaf and conifer keep the look they had as scenery, in five draw calls. A tree that goes
// (zoned, built on, paved or bulldozed) gives way with a small puff from the puffs system.
//
// API for render code (scene.sys('trees')): pick(raycaster) -> { id, d } for the nearest tree under the ray, or null.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { heightAt } from '../../world/terrain.js';
import { PINE_COLORS, TREE_COLORS } from '../../world/palettes.js';
import { MAX_PER_KIND } from '../../world/trees.js';
import { toon, hullInk } from '../materials.js';

const MAX_PUFFS = 10; // a big clearing puffs at most this many trees at once

function instanced(geo, mat) {
  const m = new THREE.InstancedMesh(geo, mat, MAX_PER_KIND);
  m.frustumCulled = false; // instance matrices place it far from the geometry's own bounds
  m.count = 0;
  return m;
}

export default {
  id: 'trees',
  create({ world, sys }) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const e = new THREE.Euler(), c = new THREE.Color();
    const canopyGeo = new THREE.IcosahedronGeometry(1, 0), trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1, 5);
    const coneGeo = new THREE.ConeGeometry(1.35, 4.4, 6, 1);
    const can = instanced(canopyGeo, toon(0xffffff)), canHull = instanced(canopyGeo, hullInk);
    const trunk = instanced(trunkGeo, toon(0x5B4636));
    const cone = instanced(coneGeo, toon(0xffffff)), coneHull = instanced(coneGeo, hullInk);
    can.castShadow = trunk.castShadow = cone.castShadow = true;
    world.add(can, canHull, trunk, cone, coneHull);

    let shownList = null, shownState = null; // what the meshes were last built from
    let canIds = [], coneIds = [];           // instance index -> tree id, for picking

    function rebuild(list) {
      const broad = [], pines = [];
      for (const t of list) (t.k === 'p' ? pines : broad).push(t);
      broad.forEach((t, i) => {
        const h = heightAt(t.x, t.z), sc = t.s;
        q.setFromEuler(e.set(0, t.rot, 0));
        p.set(t.x, h + 1.15 * sc + 0.5, t.z); s.set(sc * 1.05, sc * 0.95, sc * 1.05); m.compose(p, q, s); can.setMatrixAt(i, m);
        s.multiplyScalar(1.09); m.compose(p, q, s); canHull.setMatrixAt(i, m);
        p.set(t.x, h + 0.5 * sc, t.z); s.set(sc, sc * 1.1, sc); m.compose(p, q, s); trunk.setMatrixAt(i, m);
        can.setColorAt(i, c.setHex(TREE_COLORS[t.col]));
      });
      pines.forEach((t, i) => {
        const h = heightAt(t.x, t.z), sc = t.s;
        q.setFromEuler(e.set(0, t.rot, 0));
        p.set(t.x, h + 2.2 * sc, t.z); s.set(sc, sc, sc); m.compose(p, q, s); cone.setMatrixAt(i, m);
        s.multiplyScalar(1.08); m.compose(p, q, s); coneHull.setMatrixAt(i, m);
        cone.setColorAt(i, c.setHex(PINE_COLORS[t.col]));
      });
      for (const mesh of [can, canHull, trunk]) { mesh.count = broad.length; mesh.instanceMatrix.needsUpdate = true; }
      for (const mesh of [cone, coneHull]) { mesh.count = pines.length; mesh.instanceMatrix.needsUpdate = true; }
      for (const mesh of [can, cone]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      canIds = broad.map((t) => t.id);
      coneIds = pines.map((t) => t.id);
    }

    // Trees that stood before and do not now: a puff at each (a few, for a big clearing). Only within one town:
    // a loaded or imported town starts without puffs.
    function puffGone(before, list) {
      const now = new Set(list.map((t) => t.id));
      const gone = before.filter((t) => !now.has(t.id));
      const fx = sys('puffs');
      if (!fx || !gone.length) return;
      const step = Math.max(1, Math.ceil(gone.length / MAX_PUFFS));
      for (let k = 0; k < gone.length; k += step) fx.burst(gone[k].x, gone[k].z, 1.2, 4);
    }

    return {
      frame(f) {
        const { state } = f;
        if (!state.trees || state.trees === shownList) return;
        if (state === shownState && shownList) puffGone(shownList, state.trees);
        rebuild(state.trees);
        shownList = state.trees; shownState = state;
      },
      // Nearest tree under the ray, as { id, d }, or null. Called on a click, not per frame.
      pick(raycaster) {
        let best = null;
        for (const [mesh, ids] of [[can, canIds], [cone, coneIds]]) {
          if (!mesh.count) continue;
          const hit = raycaster.intersectObject(mesh, false)[0];
          if (hit && (!best || hit.distance < best.d)) best = { id: ids[hit.instanceId], d: hit.distance };
        }
        return best;
      },
    };
  },
};
