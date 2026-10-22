// Eases the sky towards the targets from core/calendar.js, so a new weather or season fades in over a few seconds
// instead of snapping. Wet ground rises quickly and dries slowly, so the town stays shiny for a while after rain.
// The returned object is read by night.js (light and haze), season.js (shader) and the weather particles.
import * as THREE from '../../vendor/three/three.module.min.js';

const RATE = {
  night: 2, warm: 2, daylight: 2, strength: 1.5,
  cloud: 1, fog: 0.8, rain: 1.2, snow: 1.2, leaves: 1.2, petals: 1,
  cover: 0.25, foliage: 0.4, autumn: 0.4, blossom: 0.4,
};
// Colour targets: the key on the sky, and the key on the target object it eases from.
const TINTS = { foliageCol: 'foliageCol', foliageAlt: 'foliageAlt', fieldCol: 'field', waterCol: 'water', hazeCol: 'haze', sunCol: 'sun' };
const WET_RISE = 1.0, WET_DRY = 0.03;

export function createSky() {
  const cur = {
    night: 0, warm: 0, daylight: 1, strength: 1, cloud: 0, fog: 0, rain: 0, snow: 0, leaves: 0, petals: 0, wet: 0,
    cover: 0, foliage: 0, autumn: 0, blossom: 0,
    dir: new THREE.Vector3(-1, 1, 0.35).normalize(),
    foliageCol: new THREE.Color(0xC6E27A), foliageAlt: new THREE.Color(0xC6E27A), fieldCol: new THREE.Color(0x9FC563),
    waterCol: new THREE.Color(0x6FA9B8), hazeCol: new THREE.Color(0xF1E6C8), sunCol: new THREE.Color(0xFFEBC0),
  };
  const want = new THREE.Vector3(), tint = new THREE.Color();
  let first = true;
  return {
    cur,
    // dt in seconds; t is an atmosphereTargets() object. The first call snaps, so a loaded town starts in its real light.
    update(dt, t) {
      const ease = (rate) => (first ? 1 : 1 - Math.exp(-dt * rate));
      for (const k of Object.keys(RATE)) cur[k] += (t[k] - cur[k]) * ease(RATE[k]);
      cur.wet += (t.wet - cur.wet) * ease(t.wet > cur.wet ? WET_RISE : WET_DRY);
      want.set(t.dir[0], t.dir[1], t.dir[2]).normalize();
      cur.dir.lerp(want, ease(2)).normalize();
      for (const [key, from] of Object.entries(TINTS)) {
        tint.setHex(t[from]);
        cur[key].lerp(tint, ease(0.4));
      }
      first = false;
      return cur;
    },
  };
}
