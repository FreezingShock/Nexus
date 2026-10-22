// Lights and sky. The sun follows the clock: it arcs across the town, warms at dawn and dusk, dims under cloud, and the
// moon takes over after dark. Every value comes from the eased sky in render/sky.js. Windows and lamps swap in the
// town module and the road lamps when the night blend crosses halfway (scene.js).
import * as THREE from '../../vendor/three/three.module.min.js';

const DAWN_BG = new THREE.Color(0xF0C6A6), NIGHT_BG = new THREE.Color(0x3A4468);
const CLOUD_BG = new THREE.Color(0xB7C0C5), FOG_BG = new THREE.Color(0xC9D2D2);
const DAY_HEMI = new THREE.Color(0xFFF3DC), NIGHT_HEMI = new THREE.Color(0x9AA8D8);
const DAWN_SUN = new THREE.Color(0xFFB273), NIGHT_SUN = new THREE.Color(0xB8C8FF);
const bg = new THREE.Color(), tone = new THREE.Color();

export function createLighting(scene) {
  scene.background = new THREE.Color(0xD7E2E4);
  scene.fog = new THREE.Fog(0xD7E2E4, 175, 340);
  const hemi = new THREE.HemisphereLight(0xFFF3DC, 0x8A8F62, 0.6); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xFFE3B8, 0.7);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52, near: 1, far: 200 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun);
  return {
    // s is the eased sky. Returns the night blend (0 day, 1 night) so the caller can swap windows at the midpoint.
    update(dt, s) {
      const day = 1 - s.night;
      // The day colour is the season's haze (spring cream, summer pale blue, autumn warm, winter cold).
      bg.copy(s.hazeCol).lerp(DAWN_BG, s.warm * day * 0.85).lerp(CLOUD_BG, s.cloud * 0.6 * day)
        .lerp(FOG_BG, s.fog * 0.8 * day).lerp(NIGHT_BG, s.night);
      scene.background.copy(bg); scene.fog.color.copy(bg);
      scene.fog.near = 175 - 120 * s.fog - 40 * s.cloud;
      scene.fog.far = 340 - 180 * s.fog - 60 * s.cloud;

      tone.copy(DAY_HEMI).lerp(NIGHT_HEMI, s.night); hemi.color.copy(tone);
      hemi.intensity = 0.6 + 0.2 * s.night - 0.1 * s.cloud * day;

      tone.copy(s.sunCol).lerp(DAWN_SUN, s.warm * day * 0.6).lerp(NIGHT_SUN, s.night); sun.color.copy(tone);
      sun.intensity = 0.7 * s.strength * s.daylight * (1 - 0.55 * s.cloud) + 0.35 * s.night;
      sun.position.copy(s.dir).multiplyScalar(80);
      return s.night;
    },
    // Graphics settings: the sun's shadow on or off, and its map size. A new size drops the old map; three.js makes one.
    shadows(on, size) {
      sun.castShadow = !!on;
      if (sun.shadow.mapSize.x !== size) {
        sun.shadow.mapSize.set(size, size);
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      }
    },
  };
}
