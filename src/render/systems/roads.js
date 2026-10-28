// Draws the road network from state.roads: merged chunks, a rippling pop when roads are laid, dust puffs, lamps,
// the traffic tint (congestion classes from grid.load, set by the traffic sim) and the ghost preview that the pencil tool drives (scene.sys('roads')).
//   preview({ key, tiles: [{ gx, gz, t, d }], bad })   show a ghost of the roads a stroke would lay (key skips rebuilds)
//   clearPreview()
// Chunks are 24 x 24 tiles (a 4 x 4 map) and cost two draw calls each (one vertex-colored mesh, one line buffer). 16-tile
// chunks cost up to 72 calls on a well-roaded map; 24 caps it at 32 and an edit rebuilds its chunk in a few ms.
import { GRID_N } from '../../world/grid.js';
import { DIRS, connMask, shapeOf } from '../../world/roadnet.js';
import { hash } from '../../world/terrain.js';
import { Acc, ASPHALT, emitTiles, groundY, roadMaterial, tileWorld } from '../road-mesh.js';
import { allocInstanceColors } from '../geom.js';
import { createLandWatch } from '../land-watch.js';
import { trafficRgb } from '../../core/access.js';

const CHUNK = 24, PER_ROW = GRID_N / CHUNK;
let TRAFFIC = [null, ...trafficRgb('standard')]; // by class: free, busy, jammed; the Access setting swaps the set
const WAVES = 5, WAVE_GAP = 0.07, POP_S = 0.4;
const MAX_LAMPS = 260, MAX_PUFFS = 80;

const chunkOf = (idx) => Math.floor((idx % GRID_N) / CHUNK) + Math.floor(Math.floor(idx / GRID_N) / CHUNK) * PER_ROW;
const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1, k = x - 1; return 1 + c3 * k * k * k + c1 * k * k; };
const same = (a, b) => a && b && a.t === b.t && a.d === b.d;

function trafficColor(cls, out) {
  const c = TRAFFIC[cls];
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
}

export default {
  id: 'roads',
  create({ THREE, world, grid }) {
    const group = new THREE.Group(); world.add(group);
    const mat = roadMaterial();
    const ghostMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const ghostLine = new THREE.LineBasicMaterial({ color: 0x2B2620, transparent: true, opacity: 0.7, depthWrite: false });
    let roads = null, traffic = false, clock = 0, previewKey = '', seenLoad = -1;
    const chunks = new Map();      // chunk id -> { mesh, lines, acc }
    let waves = [];                // active pop animations: { group, start, tiles }
    let fresh = new Set();         // tile indices currently drawn by a wave, not yet in a chunk
    const dirty = new Set();
    const puffQueue = [];
    let ghost = null;
    const land = createLandWatch();

    // ---- chunks ----
    function dropChunk(id) {
      const c = chunks.get(id); if (!c) return;
      group.remove(c.mesh, c.lines); c.mesh.geometry.dispose(); c.lines.geometry.dispose(); chunks.delete(id);
    }
    function buildChunk(id, tiles) {
      dropChunk(id);
      if (!tiles.length) return;
      const acc = new Acc();
      emitTiles(acc, tiles, roads, { trackAsphalt: true });
      const mesh = acc.toMesh(mat), lines = acc.toLines();
      group.add(mesh, lines);
      const c = { mesh, lines, acc };
      chunks.set(id, c);
      if (traffic) tint(c);
    }
    function tint(c) {
      const col = c.mesh.geometry.attributes.color, rgb = [0, 0, 0];
      for (const [idx, r] of c.acc.asphalt) {
        const rec = roads[idx]; if (!rec) continue;
        const base = ASPHALT[rec.t];
        const cls = traffic ? grid.load[idx] : 0;
        if (cls) trafficColor(cls, rgb); else { rgb[0] = base[0]; rgb[1] = base[1]; rgb[2] = base[2]; }
        for (let i = r.start; i < r.end; i++) col.setXYZ(i, rgb[0], rgb[1], rgb[2]);
      }
      col.needsUpdate = true;
    }
    function rebuildDirty() {
      if (!dirty.size) return;
      const byChunk = new Map();
      for (const k of Object.keys(roads)) {
        const idx = Number(k);
        if (fresh.has(idx)) continue;
        const id = chunkOf(idx);
        if (dirty.has(id)) { let l = byChunk.get(id); if (!l) byChunk.set(id, l = []); l.push([idx % GRID_N, Math.floor(idx / GRID_N)]); }
      }
      for (const id of dirty) buildChunk(id, byChunk.get(id) || []);
      dirty.clear();
      buildLamps();
    }
    const markAround = (idx) => {
      const gx = idx % GRID_N, gz = Math.floor(idx / GRID_N);
      dirty.add(chunkOf(idx));
      for (const [dx, dz] of DIRS) { const x = gx + dx, z = gz + dz; if (x >= 0 && z >= 0 && x < GRID_N && z < GRID_N) dirty.add(chunkOf(z * GRID_N + x)); }
    };

    // ---- waves (the ripple when a stroke lands) ----
    function endWaves() {
      for (const w of waves) { group.remove(w.group); w.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); for (const i of w.tiles) { fresh.delete(i); markAround(i); } }
      waves = [];
    }
    function startWaves(list, t0) {
      const n = list.length, count = Math.min(WAVES, Math.max(1, Math.ceil(n / 2)));
      for (let k = 0; k < count; k++) {
        const slice = list.slice(Math.floor((k * n) / count), Math.floor(((k + 1) * n) / count));
        if (!slice.length) continue;
        const acc = new Acc();
        emitTiles(acc, slice.map((i) => [i % GRID_N, Math.floor(i / GRID_N)]), roads);
        const g = new THREE.Group(); g.add(acc.toMesh(mat), acc.toLines()); g.scale.y = 0.001; g.visible = false;
        group.add(g);
        waves.push({ group: g, start: t0 + k * WAVE_GAP, tiles: slice });
        for (const i of slice) { fresh.add(i); puffQueue.push({ at: t0 + k * WAVE_GAP + 0.08, i, col: 0xFAF3E4 }); }
      }
    }

    // ---- lamps ----
    const lampPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 2.0, 5), new THREE.MeshToonMaterial({ color: 0x2B2620 }), MAX_LAMPS);
    const lampDayMat = new THREE.MeshToonMaterial({ color: 0xEBD9A0 }), lampNightMat = new THREE.MeshBasicMaterial({ color: 0xFFD27A });
    const lampHead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 6, 5), lampDayMat, MAX_LAMPS);
    for (const m of [lampPole, lampHead]) { m.frustumCulled = false; m.count = 0; group.add(m); }
    lampPole.castShadow = true;
    const mtx = new THREE.Matrix4();
    function buildLamps() {
      let n = 0;
      for (const k of Object.keys(roads)) {
        if (n >= MAX_LAMPS) break;
        const idx = Number(k), gx = idx % GRID_N, gz = Math.floor(idx / GRID_N), shape = shapeOf(connMask(roads, gx, gz)), [cx, cz] = tileWorld(gx, gz);
        let x = null, z = null;
        if (shape.kind === 'straight' && (gx + 2 * gz) % 3 === 0) {
          const side = ((gx + gz) & 1) ? 1 : -1, off = 1.38 * side;
          if (shape.dirs[0] % 2 === 0) { x = cx; z = cz + off; } else { x = cx + off; z = cz; }
        } else if ((shape.kind === 'tee' || shape.kind === 'cross') && hash(gx, gz) < 0.5) {
          x = cx + (hash(gz, gx) < 0.5 ? 1.35 : -1.35); z = cz + (hash(gx + 5, gz) < 0.5 ? 1.35 : -1.35);
        }
        if (x === null) continue;
        const gy = groundY(x, z);
        lampPole.setMatrixAt(n, mtx.makeTranslation(x, 1.1 + gy, z));
        lampHead.setMatrixAt(n, mtx.makeTranslation(x, 2.15 + gy, z));
        n++;
      }
      lampPole.count = lampHead.count = n;
      lampPole.instanceMatrix.needsUpdate = lampHead.instanceMatrix.needsUpdate = true;
    }

    // ---- dust ----
    const puffMesh = allocInstanceColors(new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshToonMaterial({ color: 0xFFFFFF }), MAX_PUFFS));
    puffMesh.frustumCulled = false; puffMesh.count = 0; group.add(puffMesh);
    const puffs = [];
    const dummy = new THREE.Object3D(), colr = new THREE.Color();
    function spawnPuff(i, col) {
      const [x, z] = tileWorld(i % GRID_N, Math.floor(i / GRID_N));
      for (let k = 0; k < 2 && puffs.length < MAX_PUFFS; k++) {
        const a = Math.random() * 6.283, sp = 0.5 + Math.random() * 0.7;
        puffs.push({ x: x + Math.cos(a) * 0.4, y: 0.15 + groundY(x, z), z: z + Math.sin(a) * 0.4, vx: Math.cos(a) * sp, vy: 0.9 + Math.random() * 0.6, vz: Math.sin(a) * sp, age: 0, life: 0.55 + Math.random() * 0.25, col });
      }
    }
    function stepPuffs(dt) {
      for (let k = puffs.length - 1; k >= 0; k--) { const p = puffs[k]; p.age += dt; if (p.age >= p.life) puffs.splice(k, 1); }
      puffMesh.count = puffs.length;
      puffs.forEach((p, k) => {
        const u = p.age / p.life, s = (1 - u) * (0.6 + 0.6 * Math.sin(u * 3.1));
        dummy.position.set(p.x + p.vx * p.age, p.y + p.vy * p.age - 1.2 * p.age * p.age, p.z + p.vz * p.age);
        dummy.scale.setScalar(Math.max(0.01, s)); dummy.updateMatrix();
        puffMesh.setMatrixAt(k, dummy.matrix); puffMesh.setColorAt(k, colr.setHex(p.col));
      });
      puffMesh.instanceMatrix.needsUpdate = true;
      if (puffMesh.instanceColor) puffMesh.instanceColor.needsUpdate = true;
    }

    // ---- sync with state ----
    function sync(next) {
      const old = roads, first = old === null;
      endWaves();
      roads = next;
      if (first) {
        for (const k of Object.keys(next)) markAround(Number(k));
        rebuildDirty();
        return;
      }
      const changed = [];
      for (const k of Object.keys(next)) if (!same(old[k], next[k])) changed.push(Number(k));
      const removed = [];
      for (const k of Object.keys(old)) if (!next[k]) removed.push(Number(k));
      for (const i of changed) markAround(i);
      for (const i of removed) { markAround(i); puffQueue.push({ at: clock + 0.02, i, col: 0xCDBFA6 }); }
      startWaves(changed, clock);
      rebuildDirty();
    }

    function setPreview(plan) {
      if (!plan || !plan.tiles.length) { clearPreview(); return; }
      if (plan.key === previewKey) return;
      previewKey = plan.key;
      disposeGhost();
      const hyp = { ...roads }, stroke = new Set(), show = [];
      for (const e of plan.tiles) { const idx = e.gz * GRID_N + e.gx; hyp[idx] = e.d === undefined ? { t: e.t } : { t: e.t, d: e.d }; stroke.add(idx); }
      const extra = new Set();
      for (const idx of stroke) {
        const gx = idx % GRID_N, gz = Math.floor(idx / GRID_N);
        show.push([gx, gz]);
        for (const [dx, dz] of DIRS) { const n = (gz + dz) * GRID_N + gx + dx; if (roads[n] && !stroke.has(n) && !extra.has(n)) { extra.add(n); show.push([gx + dx, gz + dz]); } }
      }
      const acc = new Acc();
      emitTiles(acc, show, hyp, { lift: 0.03 });
      ghost = new THREE.Group();
      const m = acc.toMesh(ghostMat); m.castShadow = false; m.receiveShadow = false; m.renderOrder = 4;
      const l = acc.toLines(); l.material = ghostLine; l.renderOrder = 5;
      ghost.add(m, l); group.add(ghost);
      ghostMat.color.setHex(plan.bad ? 0xE9A394 : 0xBFD8EA);
    }
    function disposeGhost() { if (!ghost) return; group.remove(ghost); ghost.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); ghost = null; }
    function clearPreview() { previewKey = ''; disposeGhost(); }

    return {
      preview: setPreview, clearPreview,
      stats: () => ({ chunks: chunks.size, waves: waves.length, tiles: roads ? Object.keys(roads).length : 0 }),
      setNight(on) { lampHead.material = on ? lampNightMat : lampDayMat; },
      frame(f) {
        clock = f.t;
        if (f.state.roads !== roads) sync(f.state.roads);
        // The terrain tools moved ground: redraw the road chunks on it (roads follow the land).
        const moved = land.poll();
        if (moved && roads) {
          if (moved.all) for (const k of Object.keys(roads)) dirty.add(chunkOf(Number(k)));
          else for (const i of moved.tiles) if (roads[i]) dirty.add(chunkOf(i));
          rebuildDirty();
        }
        const want = f.tool === 'traffic';
        if (want !== traffic) { traffic = want; for (const c of chunks.values()) tint(c); }
        if (traffic && grid.loadRev !== seenLoad) { seenLoad = grid.loadRev; for (const c of chunks.values()) tint(c); }
        // pop waves
        let live = false;
        for (const w of waves) {
          const p = (clock - w.start) / POP_S;
          if (p < 0) { live = true; continue; }
          w.group.visible = true;
          w.group.scale.y = Math.max(0.001, p >= 1 ? 1 : easeOutBack(p));
          if (p < 1) live = true;
        }
        if (waves.length && !live) { endWaves(); rebuildDirty(); }
        // dust
        for (let k = puffQueue.length - 1; k >= 0; k--) if (puffQueue[k].at <= clock) { spawnPuff(puffQueue[k].i, puffQueue[k].col); puffQueue.splice(k, 1); }
        if (puffs.length) stepPuffs(f.dt); else if (puffMesh.count) puffMesh.count = 0;
        if (ghost) ghostMat.opacity = 0.7 + 0.08 * Math.sin(clock * 5);
      },
      // Colour-blind-friendly traffic colours (Settings > Access): repaint the tint when the set changes.
      access(a) {
        TRAFFIC = [null, ...trafficRgb(a.colors)];
        if (traffic) for (const c of chunks.values()) tint(c);
      },
    };
  },
};
