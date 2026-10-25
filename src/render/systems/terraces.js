// Hillside terraces: every placed building and grown lot on a slope stands on a level stone pad, and a retaining wall runs
// down from it to the lowest ground round the lot, so a street of homes steps down the hill. A pale coping caps each wall.
// Instanced boxes with an ink hull: four draw calls for the whole town. Rebuilt when buildings, lots or the ground change.
import { standOn } from '../../world/models.js';
import { GRID_HALF, TILE, GRID_N } from '../../world/grid.js';
import { toon, hullInk } from '../materials.js';
import { createLandWatch } from '../land-watch.js';

export const MAX_TERRACES = 1200;
export const WALL_FROM = 0.45; // a pad this far above the low side gets a wall; below that the kit's foundation covers it
const SINK = 0.5;              // walls reach this far into the ground, so no gap shows on the low side
const INSET = 0.06;

// The terrace of a lot: { x, z, w, d, y, lo } or null on level ground. Pure: the tests call it.
export function terraceOf(gx, gz, fw, fd) {
  const x = (gx + (fw - 1) / 2 - GRID_HALF) * TILE, z = (gz + (fd - 1) / 2 - GRID_HALF) * TILE;
  const { y, lo } = standOn(x, z, fw, fd);
  if (y - lo < WALL_FROM) return null;
  return { x, z, w: fw * TILE - INSET, d: fd * TILE - INSET, y, lo };
}

// Every lot that wants a terrace: placed buildings still standing, and grown lots.
export function terracesOf(state) {
  const out = [], gone = new Set(state.removed || []);
  for (const r of state.placed || []) {
    if (gone.has(r.id)) continue;
    const t = terraceOf(r.gx, r.gz, r.fw, r.fd);
    if (t) out.push(t);
  }
  for (const l of state.lots || []) {
    const t = terraceOf(l[0] % GRID_N, Math.floor(l[0] / GRID_N), 1, 1);
    if (t) out.push(t);
  }
  return out.slice(0, MAX_TERRACES);
}

export default {
  id: 'terraces',
  create({ THREE, world }) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const inst = (mat) => { const m = new THREE.InstancedMesh(box, mat, MAX_TERRACES); m.count = 0; m.frustumCulled = false; world.add(m); return m; };
    const wall = inst(toon(0xB3A68E)), wallInk = inst(hullInk), cap = inst(toon(0xDCD0B6)), capInk = inst(hullInk);
    wall.castShadow = wall.receiveShadow = cap.receiveShadow = true;
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const land = createLandWatch();
    let sig = '';
    function rebuild(state) {
      const list = terracesOf(state);
      list.forEach((t, i) => {
        const bottom = t.lo - SINK, h = t.y - bottom;
        p.set(t.x, bottom + h / 2, t.z); s.set(t.w, h, t.d); m.compose(p, q, s); wall.setMatrixAt(i, m);
        s.set(t.w + 0.05, h + 0.05, t.d + 0.05); m.compose(p, q, s); wallInk.setMatrixAt(i, m);
        p.set(t.x, t.y - 0.09, t.z); s.set(t.w + 0.14, 0.18, t.d + 0.14); m.compose(p, q, s); cap.setMatrixAt(i, m);
        s.set(t.w + 0.2, 0.24, t.d + 0.2); m.compose(p, q, s); capInk.setMatrixAt(i, m);
      });
      for (const mesh of [wall, wallInk, cap, capInk]) { mesh.count = list.length; mesh.instanceMatrix.needsUpdate = true; }
    }
    return {
      frame(f) {
        const st = f.state;
        const next = (st.placed ? st.placed.length + ':' + (st.placed[st.placed.length - 1]?.id || '') : '') + '|' + (st.removed ? st.removed.length : 0) + '|' + st.zoneRev;
        if (land.poll() || next !== sig) { sig = next; rebuild(st); }
      },
      count: () => wall.count,
    };
  },
};
