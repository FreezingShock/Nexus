// Upgrade scaffolding: wooden poles and boards climb up around a building, stand for a moment with a puff of work dust,
// then come down as the new level pops in. The plan and timing live in render/scaffold-plan.js. One instanced mesh holds
// every scaffold on screen, so this is one draw call, and the mesh is hidden while nothing is being built.
//
// API for render code (scene.sys('scaffold')):
//   raise(world, box, onReveal) -> handle | null
//     world: the building's world matrix; box: its parts' bounding box in its own frame (Box3).
//     onReveal() runs once, when the building should switch to its new look. null means no scaffolding (effects off,
//     or every slot busy): the caller reveals straight away.
//   handle.cancel(): the building went away; the scaffolding comes down and onReveal never runs.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { toonUncached } from '../materials.js';
import { scaffoldPieces, pieceGrowth, pieceAt, REVEAL_S, DROP_S, RISE_S, MAX_PIECES } from '../scaffold-plan.js';

const SLOTS = 6;                 // buildings under scaffolding at once; more upgrades than that just pop
const WORK_EVERY_S = 0.4;        // a little puff of work dust this often while it stands
const MAX = SLOTS * MAX_PIECES;

export default {
  id: 'scaffold',
  create({ world, sys }) {
    let effects = 1;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toonUncached(0xffffff), MAX);
    mesh.frustumCulled = false; mesh.visible = false; mesh.count = MAX;
    mesh.castShadow = true; mesh.receiveShadow = false;
    world.add(mesh);

    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const c = new THREE.Color();
    for (let i = 0; i < MAX; i++) { mesh.setMatrixAt(i, zero); mesh.setColorAt(i, c.set('#ffffff')); }

    const slots = new Array(SLOTS).fill(null); // { world, pieces, t, dropAt, onReveal, revealed, work, at, r }
    const local = new THREE.Matrix4(), m = new THREE.Matrix4();
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler();
    const tmp = { x: 0, y: 0, z: 0, sx: 0, sy: 0, sz: 0 };

    function clearSlot(k) {
      for (let i = 0; i < MAX_PIECES; i++) mesh.setMatrixAt(k * MAX_PIECES + i, zero);
      mesh.instanceMatrix.needsUpdate = true;
      slots[k] = null;
    }

    return {
      // Is scaffolding switched on, and how many slots are free right now (0 when effects are off).
      enabled() { return effects > 0; },
      free() { return effects ? slots.filter((x) => !x).length : 0; },
      raise(worldMatrix, box, onReveal) {
        if (!effects) return null;
        const k = slots.indexOf(null);
        if (k < 0) return null;
        const pieces = scaffoldPieces(box);
        pieces.forEach((pc, i) => mesh.setColorAt(k * MAX_PIECES + i, c.set(pc.color)));
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        const at = new THREE.Vector3().setFromMatrixPosition(worldMatrix);
        const slot = { world: worldMatrix.clone(), pieces, t: 0, dropAt: REVEAL_S, onReveal, revealed: false, work: RISE_S, at,
          r: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2 };
        slots[k] = slot;
        mesh.visible = true;
        return {
          cancel() {
            if (slots[k] !== slot || slot.revealed) return;
            slot.revealed = true;                      // never reveal a building that is gone
            slot.dropAt = Math.min(slot.dropAt, Math.max(slot.t, RISE_S * 0.5));
          },
        };
      },
      frame(f) {
        let any = false;
        for (let k = 0; k < SLOTS; k++) {
          const sl = slots[k];
          if (!sl) continue;
          sl.t += Math.min(f.dt, 0.25);
          if (!sl.revealed && sl.t >= sl.work) { // work dust: a few puffs round the base, a different side each time
            sl.work += WORK_EVERY_S;
            const a = sl.t * 7.3, d = sl.r * 0.8;
            sys('puffs')?.burst(sl.at.x + Math.cos(a) * d, sl.at.z + Math.sin(a) * d, 0.7, 3);
          }
          if (!sl.revealed && sl.t >= sl.dropAt) { sl.revealed = true; sl.onReveal?.(); }
          if (sl.t >= sl.dropAt + DROP_S) { clearSlot(k); continue; }
          any = true;
          sl.pieces.forEach((pc, i) => {
            const g = pieceGrowth(pc, sl.t, sl.dropAt);
            pieceAt(pc, g, tmp);
            p.set(tmp.x, tmp.y, tmp.z); e.set(pc.rx, 0, pc.rz); q.setFromEuler(e); s.set(tmp.sx || 1e-4, tmp.sy || 1e-4, tmp.sz || 1e-4);
            if (g <= 0) s.set(0, 0, 0);
            local.compose(p, q, s);
            m.multiplyMatrices(sl.world, local);
            mesh.setMatrixAt(k * MAX_PIECES + i, m);
          });
        }
        if (any) mesh.instanceMatrix.needsUpdate = true;
        mesh.visible = any;
      },
      quality(rs) { effects = rs.effects; },
    };
  },
};
