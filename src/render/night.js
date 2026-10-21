// Lights and sky. Day and night blend by lerping light and haze; windows swap in the town module.
import * as THREE from '../../vendor/three/three.module.min.js';

const dayBg = new THREE.Color(0xD7E2E4), nightBg = new THREE.Color(0x3A4468);
const dayHemi = new THREE.Color(0xFFF3DC), nightHemi = new THREE.Color(0x9AA8D8);
const daySun = new THREE.Color(0xFFE3B8), nightSun = new THREE.Color(0xB8C8FF);

export function createLighting(scene) {
  scene.background = new THREE.Color(0xD7E2E4);
  scene.fog = new THREE.Fog(0xD7E2E4, 175, 340);
  const hemi = new THREE.HemisphereLight(0xFFF3DC, 0x8A8F62, 0.6); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xFFE3B8, 0.7);
  sun.position.set(-40, 70, 30); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52, near: 1, far: 200 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun);
  let t = 0;
  return {
    // returns the blend 0..1 so the caller can swap windows at the midpoint
    update(dt, night) {
      t += (night - t) * Math.min(1, dt * 2.5);
      scene.background.copy(dayBg).lerp(nightBg, t); scene.fog.color.copy(scene.background);
      hemi.color.copy(dayHemi).lerp(nightHemi, t); hemi.intensity = 0.6 + 0.2 * t;
      sun.color.copy(daySun).lerp(nightSun, t); sun.intensity = 0.7 - 0.3 * t;
      return t;
    },
    snap(night) { t = night ? 1 : 0; this.update(0, night); },
  };
}
