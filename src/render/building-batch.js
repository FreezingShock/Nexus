// One set of merged meshes for every building: placed ones (render/town.js) and grown lots (render/systems/lots.js).
// Both use the same wall and roof materials, so sharing the meshes draws each material once instead of once per owner,
// in the main pass and again in the shadow pass. Each owner registers a source that lists its baked buildings
// (Batch.bake); any owner's change re-merges all of them, which is a copy of baked arrays.
import * as THREE from '../../vendor/three/three.module.min.js';
import { Batch, disposeAll } from './geom.js';
import { nightWall } from './models/materials.js';

export function createBuildingBatch(parent) {
  const group = new THREE.Group(); parent.add(group);
  const sources = new Map(); // owner id -> () => baked buildings
  let built = [], night = false;

  function applyNight() {
    for (const m of built) if (m.isMesh && nightWall(m.userData.day)) m.material = night ? nightWall(m.userData.day) : m.userData.day;
  }
  return {
    source(id, list) { sources.set(id, list); },
    rebuild() {
      disposeAll(built, group);
      const batch = new Batch();
      for (const list of sources.values()) for (const baked of list()) batch.addBaked(baked);
      built = batch.build(group);
      applyNight();
    },
    setNight(on) { if (on === night) return; night = on; applyNight(); },
    meshes: () => built,
  };
}
