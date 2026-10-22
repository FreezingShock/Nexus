// Where the windows of a building are. The wall textures (render/models/materials.js) draw one window in the middle of
// each bay and storey, so the same bay and storey counts give the same spots. Pure: no THREE.
import { LANG } from '../../world/models.js';

const { BAY, FLOOR_H: FH } = LANG;

// Per window style: pane width and height as fractions of a bay and a storey, and the pane's centre as a fraction of
// the storey above its floor. Read off the cell drawn in models/materials.js (the cell is 64 px square).
export const PANE = {
  sash: [0.34, 0.47, 0.53],
  shutter: [0.31, 0.44, 0.53],
  arched: [0.375, 0.44, 0.47],
  ribbon: [0.81, 0.41, 0.55],
};
const SHRINK = 1.12;  // the glow covers the whole pane, a touch over so no dark edge shows
const OUT = 0.03;     // and a little proud of the wall

// Calls fn(x, y, z, yaw, w, h, face, floor) for every window of a body ({ x, z, y0, w, d, floors, style }) in the
// building's own frame. Faces: 0 front (+z), 1 right (+x), 2 back (-z), 3 left (-x). yaw turns a plane that faces +z
// to face outwards. Returns how many windows there were.
export function forEachWindow(body, fn) {
  const pane = PANE[body.style] || PANE.sash;
  const nx = Math.max(1, Math.round(body.w / BAY)), nz = Math.max(1, Math.round(body.d / BAY));
  const h = pane[1] * FH * SHRINK;
  let n = 0;
  for (let face = 0; face < 4; face++) {
    const alongX = face === 0 || face === 2, bays = alongX ? nx : nz, span = alongX ? body.w : body.d, bayW = span / bays;
    const w = pane[0] * bayW * SHRINK;
    const yaw = face === 0 ? 0 : face === 1 ? Math.PI / 2 : face === 2 ? Math.PI : -Math.PI / 2;
    for (let f = 0; f < body.floors; f++) {
      const y = body.y0 + f * FH + pane[2] * FH;
      for (let i = 0; i < bays; i++) {
        const u = -span / 2 + (i + 0.5) * bayW;
        const x = face === 0 ? body.x + u : face === 2 ? body.x - u : face === 1 ? body.x + body.w / 2 + OUT : body.x - body.w / 2 - OUT;
        const z = face === 0 ? body.z + body.d / 2 + OUT : face === 2 ? body.z - body.d / 2 - OUT : face === 1 ? body.z + u : body.z - u;
        fn(x, y, z, yaw, w, h, face, f);
        n++;
      }
    }
  }
  return n;
}

export function countWindows(body) {
  const nx = Math.max(1, Math.round(body.w / BAY)), nz = Math.max(1, Math.round(body.d / BAY));
  return (2 * nx + 2 * nz) * body.floors;
}
