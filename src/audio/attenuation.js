// How loud each place-bound sound is from where the camera is. The listener is the camera's eye: in the orbit view it sits
// over the focus point, and rises as you zoom out, so a zoomed-out town is quieter. In free-fly it is the eye itself, so
// the streets at eye height sound close. Pure: no DOM, no Web Audio, and no Three.js.
import { riverX } from '../world/terrain.js';

export const NEAR = 10;     // inside this distance a source plays at full level
export const FAR = 70;      // beyond this distance it is silent
export const ORBIT_EYE = 0.5; // orbit eye height as a share of the view's half-height, divided by zoom

// Smoothstep fall-off: flat at both ends, so nothing clicks as the camera moves. Distance is in world units.
export function falloff(d, near = NEAR, far = FAR) {
  if (!Number.isFinite(d)) return 0;
  if (d <= near) return 1;
  if (d >= far) return 0;
  const t = (d - near) / (far - near);
  return 1 - t * t * (3 - 2 * t);
}

// Where the listener is, from the camera state (camera.view and camera.free in src/render/camera.js).
export function listenerOf({ mode, view, free }) {
  if (mode === 'fly' && free) return { x: free.pos.x, z: free.pos.z, h: free.pos.y };
  const zoom = view.zoom > 0 ? view.zoom : 1;
  return { x: view.tx, z: view.tz, h: (view.half * ORBIT_EYE) / zoom };
}

// Straight-line distance from the listener to the nearest of a set of ground points (x, z).
export function distanceTo(listener, points) {
  let best = Infinity;
  for (const p of points) {
    const dx = p.x - listener.x, dz = p.z - listener.z;
    const d = Math.sqrt(dx * dx + dz * dz + listener.h * listener.h);
    if (d < best) best = d;
  }
  return best;
}

// The river as a set of points along the town, sampled every 14 units from one edge of the map to the other.
export const RIVER_POINTS = Array.from({ length: 11 }, (_, i) => {
  const z = -70 + i * 14;
  return { x: riverX(z), z };
});

// Named sources of place-bound sound. Town covers the streets and trees around the middle of the map.
export const SOURCES = {
  town: [{ x: 0, z: 0 }],
  river: RIVER_POINTS,
};

// Gain per source for one listener: { town: 0..1, river: 0..1 }. Never NaN, never above 1.
export function sourceGains(listener) {
  const out = {};
  for (const [name, points] of Object.entries(SOURCES)) {
    out[name] = falloff(distanceTo(listener, points));
  }
  return out;
}
