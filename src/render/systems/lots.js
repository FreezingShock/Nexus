// Buildings that grow on zoned tiles. Merged into a few meshes (cached parts and edges), with a squash-and-grow
// animation for each new or upgraded building. Reads state.lots; never writes sim state.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { makeParts, worldMatrix } from '../buildings.js';
import { toonVC, nightWall } from '../models/materials.js';
import { Batch } from '../geom.js';
import { createBuildingBatch } from '../building-batch.js';
import { lineMat } from '../materials.js';
import { addHull, placeHull, proxyFor, partsBox } from '../town.js';
import { lotDescription, lotId, lotTileOf } from '../../world/lots.js';
import { createLandWatch } from '../land-watch.js';

const POP_S = 0.62;
const REBUILD_GAP_S = 0.3;
const UNIT = new THREE.Vector3(1, 1, 1);
const easeOutBack = (k) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

export default {
  id: 'lots',
  create({ world, grid, sys, town }) {
    const buildings = town?.buildings || createBuildingBatch(world); // own meshes only when run without a town
    const popRoot = new THREE.Group(); world.add(popRoot);
    const selGroup = new THREE.Group(); world.add(selGroup); // the selection outline, like town.js
    const cache = new Map();       // key -> { b, parts, world, edges, proxy }
    let current = new Map();       // tile -> key, as of the last state
    let included = new Set();      // keys inside the merged meshes
    let pops = [];                 // { key, tile, group, t, grow }
    let selected = null;           // id of the lot with an outline
    const upgrading = new Set();   // tiles a player upgrade just touched: they throw dust when they pop
    const held = new Map();        // tile -> { lot, h }: under upgrade scaffolding, still drawn as the old lot until the reveal
    let rev = -1, dirty = false, since = 1, night = false, first = true;
    let lifeRev = 0, lifeList = []; // for render/systems/life-*.js: the grown lots standing in the merged meshes
    const m = new THREE.Matrix4();
    const land = createLandWatch();

    const roadAt = (gx, gz) => grid.roadAt(gx, gz) !== 0;
    let paintSig = '', townPaint = null; // the town-wide paint grown lots wear (state.townPaint), part of every lot's cache key
    const keyOf = (l) => l[0] + ':' + l[1] + ':' + l[2] + ':' + grid.zone[l[0]] + paintSig;
    function entryFor(l) {
      const key = keyOf(l);
      let e = cache.get(key);
      if (!e) {
        const b = lotDescription(grid.zone[l[0]], l[1], l[2], l[0], roadAt, townPaint);
        const parts = makeParts(b);
        const edges = parts.map((p) => (p.edge ? new THREE.EdgesGeometry(p.geo, 30).attributes.position.array : null));
        const world = worldMatrix(b);
        const proxy = proxyFor(parts, world); // a click target only: never added to the scene
        proxy.userData.tile = l[0];
        e = { key, b, parts, edges, world, proxy };
        cache.set(key, e);
      }
      return e;
    }
    function dropEntry(key) {
      const e = cache.get(key); if (!e) return;
      for (const p of e.parts) p.geo.dispose();
      e.proxy.geometry.dispose();
      cache.delete(key);
    }

    // Same as buildings.js addToBatch (plain parts share the vertex-color material), with the ink edges cached. Each
    // building is baked into world-space arrays once, so a rebuild of the whole town is a copy, not a transform.
    function bakedOf(e) {
      if (!e.baked) {
        const one = new Batch(), vc = toonVC();
        e.parts.forEach((p, k) => {
          m.multiplyMatrices(e.world, p.local);
          if (p.body) {
            for (const s of p.splits) {
              const walls = s.materialIndex === 0 || s.materialIndex === 1 || s.materialIndex === 4 || s.materialIndex === 5;
              if (walls) one.add(s.geo, p.facadeMat, m); else one.add(s.geo, vc, m, { color: p.color });
            }
          } else one.add(p.geo, vc, m, { color: p.color });
          if (e.edges[k]) one.addLines(e.edges[k], m);
        });
        e.baked = one.bake();
      }
      return e.baked;
    }
    // Grown lots draw into the same meshes as placed buildings (render/building-batch.js), as the 'lots' source.
    let shownBaked = [];
    buildings.source('lots', () => shownBaked);
    function rebuild() {
      const keys = new Set(), baked = [];
      const holding = new Set(pops.filter((p) => p.t < POP_S).map((p) => p.key));
      const shown = liveLots.map((l) => held.get(l[0])?.lot || l);
      for (const l of shown) {
        const e = entryFor(l);
        if (holding.has(e.key)) continue;
        baked.push(bakedOf(e)); keys.add(e.key);
      }
      shownBaked = baked;
      buildings.rebuild();
      included = keys;
      lifeList = shown.map(entryFor).filter((e) => keys.has(e.key)); lifeRev++;
      // settled pops are now inside the merged mesh: remove their stand-ins
      pops = pops.filter((p) => {
        if (p.t >= POP_S && included.has(p.key)) { popRoot.remove(p.group); disposePop(p); return false; }
        return true;
      });
      // forget geometry for buildings that are gone, and any stand-in still showing one
      const live = new Set([...liveLots, ...shown].map(keyOf));
      pops = pops.filter((p) => { if (live.has(p.key)) return true; popRoot.remove(p.group); disposePop(p); return false; });
      for (const k of [...cache.keys()]) if (!live.has(k)) dropEntry(k);
      dirty = false; since = 0;
    }
    function disposePop(p) { for (const o of p.group.children) if (o.isLineSegments) o.geometry.dispose(); }

    function startPop(l, grow, dust = false) {
      const e = entryFor(l);
      if (grow) sys('puffs')?.burst(e.b.x, e.b.z, 3, 10); // a new building: a little dust as it goes up
      else if (upgrading.delete(l[0]) || dust) sys('puffs')?.burst(e.b.x, e.b.z, 3.4, 16); // a player upgrade: as big as a placed one's
      const g = new THREE.Group();
      g.position.set(e.b.x, e.b.y, e.b.z); g.rotation.y = e.b.rotY;
      for (const p of e.parts) {
        const mat = p.body ? [p.facadeMat, p.facadeMat, p.mat, p.mat, p.facadeMat, p.facadeMat].map((x) => (night && nightWall(x) ? nightWall(x) : x)) : p.mat;
        const mesh = new THREE.Mesh(p.geo, mat);
        mesh.matrixAutoUpdate = false; mesh.matrix.copy(p.local); mesh.castShadow = mesh.receiveShadow = true;
        g.add(mesh);
        if (p.edge) { const ln = new THREE.LineSegments(new THREE.EdgesGeometry(p.geo, 30), lineMat); ln.matrixAutoUpdate = false; ln.matrix.copy(p.local); g.add(ln); }
      }
      g.scale.set(grow ? 0.01 : 1, grow ? 0.01 : 1, grow ? 0.01 : 1);
      popRoot.add(g);
      pops.push({ key: e.key, tile: l[0], group: g, t: 0, grow });
    }

    // A player upgrade: scaffolding goes up round the old lot (`was` is its key), and the new one pops in at the reveal.
    function raiseScaffold(l, was) {
      const scaffold = sys('scaffold');
      if (!scaffold) return false;
      const tile = l[0], e = entryFor(l);
      const h = scaffold.raise(e.world, partsBox(e.parts), () => {
        held.delete(tile);
        const now = liveLots.find((x) => x[0] === tile);
        if (now) startPop(now, false, true);
        dirty = true;
      });
      if (!h) return false;
      held.set(tile, { lot: was.split(':').slice(0, 3).map(Number), h });
      return true;
    }

    let liveLots = [];
    function sync(state) {
      const prev = current;
      // A new town-wide paint changes every key at once: redraw quietly, without a pop on each lot.
      const sig = state.townPaint ? JSON.stringify(state.townPaint) : '', repainted = sig !== paintSig;
      paintSig = sig; townPaint = state.townPaint || null;
      current = new Map(state.lots.map((l) => [l[0], keyOf(l)]));
      liveLots = state.lots;
      if (!first && !repainted) {
        for (const l of state.lots) {
          const was = prev.get(l[0]), key = current.get(l[0]);
          if (was === key || held.has(l[0])) continue; // under scaffolding: the reveal shows whatever the lot is by then
          if (was && upgrading.has(l[0]) && raiseScaffold(l, was)) { upgrading.delete(l[0]); continue; }
          startPop(l, !was);
        }
      }
      for (const [tile, hd] of held) if (!current.has(tile)) { hd.h.cancel(); held.delete(tile); } // bulldozed mid-build
      first = false; dirty = true;
      if (selected) select(selected); // the outline follows a new level, and clears when the lot is gone
    }

    // The outline of one grown lot, or none. Ids are lot<tile> (world/lots.js); other ids are not lots and clear it.
    function select(id) {
      selGroup.clear(); selected = null;
      const tile = lotTileOf(id);
      const l = tile === null ? null : liveLots.find((x) => x[0] === tile);
      if (!l) return;
      const e = entryFor(l);
      selected = id;
      placeHull(selGroup, e.b, 1, 1, 1);
      addHull(selGroup, e.parts);
    }

    return {
      frame(f) {
        if (f.state.zoneRev !== rev) { rev = f.state.zoneRev; sync(f.state); }
        // The terrain tools moved ground: buildings on it are described again at their new height.
        const moved = land.poll();
        if (moved) for (const l of liveLots) if (moved.all || moved.tiles.has(l[0])) { dropEntry(keyOf(l)); dirty = true; }
        since += f.dt;
        const lotPop = selected ? pops.find((p) => p.tile === lotTileOf(selected)) : null;
        for (const p of pops) {
          p.t += f.dt;
          const k = Math.min(1, p.t / POP_S);
          if (p.grow) { const s = Math.max(0.01, easeOutBack(k)); p.group.scale.set(1 + (s - 1) * 0.5, s, 1 + (s - 1) * 0.5); }
          else { const sq = Math.sin(k * Math.PI); p.group.scale.set(1 + 0.12 * sq, 1 + 0.18 * sq, 1 + 0.12 * sq); }
          if (k >= 1 && p.t - f.dt < POP_S) dirty = true; // settled this frame: fold into the merged mesh
        }
        if (selected) selGroup.scale.copy(lotPop ? lotPop.group.scale : UNIT); // the outline squashes with its building
        if (dirty && since > REBUILD_GAP_S) rebuild();
      },
      setNight(on) { night = on; buildings.setNight(on); },
      // Nearest grown lot under the ray as { id, d }, or null. Same shape as town.probe, so the scene can compare them.
      probe(raycaster) {
        const list = [];
        for (const l of liveLots) list.push(entryFor(l).proxy);
        const hit = raycaster.intersectObjects(list, false)[0];
        if (!hit) return null;
        return { id: lotId(hit.object.userData.tile), d: hit.distance };
      },
      select,
      lifeRev: () => lifeRev,
      lifeEntries: () => lifeList,
      // A player upgrade on a grown lot: its next level change throws dust, as a placed building's does.
      pop(id) {
        const tile = lotTileOf(id);
        if (tile === null) return;
        upgrading.add(tile);
        setTimeout(() => upgrading.delete(tile), 1500);
      },
    };
  },
};
