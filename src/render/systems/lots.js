// Buildings that grow on zoned tiles. Merged into a few meshes (cached parts and edges), with a squash-and-grow
// animation for each new or upgraded building. Reads state.lots; never writes sim state.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { makeParts, worldMatrix } from '../buildings.js';
import { toonVC } from '../models/materials.js';
import { Batch } from '../geom.js';
import { lineMat } from '../materials.js';
import { lotDescription } from '../../world/lots.js';

const POP_S = 0.62;
const REBUILD_GAP_S = 0.3;
const easeOutBack = (k) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

export default {
  id: 'lots',
  create({ world, grid }) {
    const group = new THREE.Group(); world.add(group);
    const popRoot = new THREE.Group(); world.add(popRoot);
    const cache = new Map();       // key -> { b, parts, world, edges }
    let current = new Map();       // tile -> key, as of the last state
    let built = [];                // merged meshes now on screen
    let included = new Set();      // keys inside the merged meshes
    let pops = [];                 // { key, group, t }
    let rev = -1, dirty = false, since = 1, night = false, first = true;
    const m = new THREE.Matrix4();

    const roadAt = (gx, gz) => grid.roadAt(gx, gz) !== 0;
    const keyOf = (l) => l[0] + ':' + l[1] + ':' + l[2] + ':' + grid.zone[l[0]];
    function entryFor(l) {
      const key = keyOf(l);
      let e = cache.get(key);
      if (!e) {
        const b = lotDescription(grid.zone[l[0]], l[1], l[2], l[0], roadAt);
        const parts = makeParts(b);
        const edges = parts.map((p) => (p.edge ? new THREE.EdgesGeometry(p.geo, 30).attributes.position.array : null));
        e = { key, b, parts, edges, world: worldMatrix(b) };
        cache.set(key, e);
      }
      return e;
    }
    function dropEntry(key) {
      const e = cache.get(key); if (!e) return;
      for (const p of e.parts) p.geo.dispose();
      cache.delete(key);
    }

    // Same as buildings.js addToBatch (plain parts share the vertex-color material), with the ink edges cached.
    function addToBatch(batch, e) {
      const vc = toonVC();
      e.parts.forEach((p, k) => {
        m.multiplyMatrices(e.world, p.local);
        if (p.body) {
          for (const s of p.splits) {
            const walls = s.materialIndex === 0 || s.materialIndex === 1 || s.materialIndex === 4 || s.materialIndex === 5;
            if (walls) batch.add(s.geo, p.facadeMat, m); else batch.add(s.geo, vc, m, { color: p.color });
          }
        } else batch.add(p.geo, vc, m, { color: p.color });
        const ed = e.edges[k];
        if (ed) {
          const v = new THREE.Vector3();
          for (let i = 0; i < ed.length; i += 3) { v.set(ed[i], ed[i + 1], ed[i + 2]).applyMatrix4(m); batch.lines.push(v.x, v.y, v.z); }
        }
      });
    }
    function applyNight() {
      for (const mesh of built) if (mesh.isMesh && mesh.userData.day.userData.night) mesh.material = night ? mesh.userData.day.userData.night : mesh.userData.day;
    }
    function rebuild() {
      for (const o of built) { group.remove(o); o.geometry.dispose(); }
      built = [];
      const batch = new Batch(), keys = new Set();
      const holding = new Set(pops.filter((p) => p.t < POP_S).map((p) => p.key));
      for (const l of liveLots) {
        const e = entryFor(l);
        if (holding.has(e.key)) continue;
        addToBatch(batch, e); keys.add(e.key);
      }
      built = batch.build(group);
      included = keys; applyNight();
      // settled pops are now inside the merged mesh: remove their stand-ins
      pops = pops.filter((p) => {
        if (p.t >= POP_S && included.has(p.key)) { popRoot.remove(p.group); disposePop(p); return false; }
        return true;
      });
      // forget geometry for buildings that are gone, and any stand-in still showing one
      const live = new Set(liveLots.map(keyOf));
      pops = pops.filter((p) => { if (live.has(p.key)) return true; popRoot.remove(p.group); disposePop(p); return false; });
      for (const k of [...cache.keys()]) if (!live.has(k)) dropEntry(k);
      dirty = false; since = 0;
    }
    function disposePop(p) { for (const o of p.group.children) if (o.isLineSegments) o.geometry.dispose(); }

    function startPop(l, grow) {
      const e = entryFor(l);
      const g = new THREE.Group();
      g.position.set(e.b.x, e.b.y, e.b.z); g.rotation.y = e.b.rotY;
      for (const p of e.parts) {
        const mat = p.body ? [p.facadeMat, p.facadeMat, p.mat, p.mat, p.facadeMat, p.facadeMat].map((x) => (night && x.userData.night ? x.userData.night : x)) : p.mat;
        const mesh = new THREE.Mesh(p.geo, mat);
        mesh.matrixAutoUpdate = false; mesh.matrix.copy(p.local); mesh.castShadow = mesh.receiveShadow = true;
        g.add(mesh);
        if (p.edge) { const ln = new THREE.LineSegments(new THREE.EdgesGeometry(p.geo, 30), lineMat); ln.matrixAutoUpdate = false; ln.matrix.copy(p.local); g.add(ln); }
      }
      g.scale.set(grow ? 0.01 : 1, grow ? 0.01 : 1, grow ? 0.01 : 1);
      popRoot.add(g);
      pops.push({ key: e.key, group: g, t: 0, grow });
    }

    let liveLots = [];
    function sync(state) {
      const prev = current;
      current = new Map(state.lots.map((l) => [l[0], keyOf(l)]));
      liveLots = state.lots;
      if (!first) {
        for (const l of state.lots) {
          const was = prev.get(l[0]), key = current.get(l[0]);
          if (was !== key) startPop(l, !was);
        }
      }
      first = false; dirty = true;
    }

    return {
      frame(f) {
        if (f.state.zoneRev !== rev) { rev = f.state.zoneRev; sync(f.state); }
        since += f.dt;
        for (const p of pops) {
          p.t += f.dt;
          const k = Math.min(1, p.t / POP_S);
          if (p.grow) { const s = Math.max(0.01, easeOutBack(k)); p.group.scale.set(1 + (s - 1) * 0.5, s, 1 + (s - 1) * 0.5); }
          else { const sq = Math.sin(k * Math.PI); p.group.scale.set(1 + 0.12 * sq, 1 + 0.18 * sq, 1 + 0.12 * sq); }
          if (k >= 1 && p.t - f.dt < POP_S) dirty = true; // settled this frame: fold into the merged mesh
        }
        if (dirty && since > REBUILD_GAP_S) rebuild();
      },
      setNight(on) { night = on; applyNight(); },
    };
  },
};
