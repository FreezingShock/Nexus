// Townsfolk walk the pavements beside the roads, idle at junctions and now and then slip into a building.
// Visual only: no pathing, no effect on the sim. Each one wanders the road network tile by tile and picks a way at each
// junction. State machine: walk -> idle | enter -> inside -> exit -> walk.
import * as THREE from '../../vendor/three/three.module.min.js';
import { toon } from './materials.js';
import { unit, walkingNow } from '../sim/schedule.js';
import { allocInstanceColors } from './geom.js';
import { GRID_N, tileIndex } from '../world/grid.js';
import { DIRS, connMask, dirsOfMask, opposite } from '../world/roadnet.js';
import { makeRng } from '../world/rng.js';
import { groundY, tileWorld } from './road-mesh.js';
import { TUNNEL_GATE } from '../world/starter.js';

const MAX = 500, TARGET = 300, PER_ROAD_TILE = 0.5;
const SPEED = 1.6, TILE = 3, PAVEMENT = 1.35; // units per second, tile size, offset from the road centre
const ENTER_S = 0.35, IDLE_CHANCE = 0.12, ENTER_CHANCE = 0.05;
// The tunnel gate (a dead end at the foot of the mountain): some walkers come out of it, and a walker heading into it goes in.
const GATE = tileIndex(TUNNEL_GATE.gx, TUNNEL_GATE.gz), TUNNEL_IN = 0.1;
const RECOUNT_H = 0.02; // how often (town hours) the list of residents out walking is worked out again
// Looks come from the person: coat, trousers, skin and hair or hat are picked by hash of their index, so a resident always looks the same.
const COATS = [0xD98C7A, 0xBFD8C4, 0x8DBEDD, 0xEBD9A0, 0x9DB37C, 0xFAF3E4, 0xCBC3DC, 0xC8694F, 0xA7856A];
const TROUSERS = [0x6C7A8F, 0x7A6A58, 0x4F5A4A, 0x8C8173];
const SKIN = [0xF1D3B3, 0xE8C7A0, 0xC99A6E, 0x9C6B48];
const HAIR = [0x3A2E26, 0x6B4A32, 0xB88A4A, 0xD8CFC0, 0x8A8A8A, 0xA6502F];
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
// Age groups: children are smaller and slower, elders slower and a touch bent.
const kidOf = (i) => unit(i, 31) < 0.14;
const elderOf = (i) => unit(i, 31) > 0.86;

// One pedestrian in four parts, each an InstancedMesh sharing the same matrix: coat, legs, head and hair.
function buildFolkGeometry() {
  const legs = new THREE.BoxGeometry(0.1, 0.26, 0.1);
  const left = legs.clone().translate(0, 0.13, -0.07), right = legs.clone().translate(0, 0.13, 0.07);
  const both = mergeBoxes(left, right);
  return {
    coat: new THREE.CylinderGeometry(0.14, 0.22, 0.46, 7).translate(0, 0.49, 0),
    legs: both,
    head: new THREE.SphereGeometry(0.14, 7, 5).translate(0, 0.84, 0),
    hair: new THREE.SphereGeometry(0.155, 7, 4, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(-0.01, 0.855, 0),
  };
}
function mergeBoxes(a, b) {
  const g = new THREE.BufferGeometry(), A = a.toNonIndexed(), B = b.toNonIndexed();
  for (const k of ['position', 'normal']) {
    const arr = new Float32Array(A.attributes[k].array.length + B.attributes[k].array.length);
    arr.set(A.attributes[k].array); arr.set(B.attributes[k].array, A.attributes[k].array.length);
    g.setAttribute(k, new THREE.BufferAttribute(arr, 3));
  }
  return g;
}

export function buildTownsfolk(parent, grid, camera) {
  const rng = makeRng(131);
  let crowd = 1; // graphics setting: scales the target (MAX is the hard cap)
  const geo = buildFolkGeometry();
  const mk = (g, mat, tinted) => {
    const mesh = new THREE.InstancedMesh(g, mat, MAX);
    if (tinted) allocInstanceColors(mesh);
    mesh.frustumCulled = false; mesh.castShadow = true; mesh.count = 0;
    return mesh;
  };
  const coat = mk(geo.coat, toon(0xffffff), true), legs = mk(geo.legs, toon(0xffffff), true);
  const head = mk(geo.head, toon(0xffffff), true), hair = mk(geo.hair, toon(0xffffff), true);
  const parts = [coat, legs, head, hair];
  const col = new THREE.Color();
  parent.add(...parts);

  const people = [];
  const out = new Int32Array(MAX), seen = { hour: -1, n: -1, count: 0 }, walking = new Set();
  let roads = null, roadTiles = [], arrive = 0;
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3();

  const dirVec = (d) => DIRS[d];
  const isRoad = (gx, gz) => gx >= 0 && gz >= 0 && gx < GRID_N && gz < GRID_N && !!roads[tileIndex(gx, gz)];

  // Dresses a slot as resident `id`: colours, size and pace all come from the hash of the index.
  function dress(i, p, id) {
    p.person = id;
    const kid = kidOf(id), elder = elderOf(id);
    p.size = kid ? 0.72 : elder ? 0.95 : 0.92 + 0.14 * unit(id, 33);
    p.speed = (kid ? 1.15 : elder ? 1.0 : 1.35 + 0.4 * unit(id, 34)) * (SPEED / 1.6);
    p.lean = elder ? 0.12 : 0;
    const pick = (list, salt) => list[Math.floor(unit(id, salt) * list.length)];
    coat.setColorAt(i, col.setHex(pick(COATS, 32)));
    legs.setColorAt(i, col.setHex(pick(TROUSERS, 35)));
    head.setColorAt(i, col.setHex(pick(SKIN, 36)));
    hair.setColorAt(i, col.setHex(elder ? 0xD8CFC0 : pick(HAIR, 37)));
  }
  const hide = (i) => { for (const m of parts) m.setMatrixAt(i, ZERO); };

  // A random road tile to stand on, and a heading that leaves it.
  function place(p) {
    for (let tries = 0; tries < 20 && roadTiles.length; tries++) {
      const fromTunnel = !!roads[GATE] && rng() < TUNNEL_IN + Math.min(0.25, arrive * 0.3);
      const t = fromTunnel ? GATE : roadTiles[Math.floor(rng() * roadTiles.length)];
      const gx = t % GRID_N, gz = Math.floor(t / GRID_N);
      const dirs = dirsOfMask(connMask(roads, gx, gz));
      if (!dirs.length) continue;
      p.gx = gx; p.gz = gz; p.dir = dirs[Math.floor(rng() * dirs.length)];
      p.side = rng() < 0.5 ? -1 : 1; p.u = fromTunnel ? 0 : rng(); p.mode = 'walk'; p.t = 0; p.alive = true; p.tunnel = false;
      return true;
    }
    p.alive = false;
    return false;
  }

  // Reached the middle of the next tile: pick the way on. Usually onwards, not back the way they came.
  function junction(p) {
    p.gx += dirVec(p.dir)[0]; p.gz += dirVec(p.dir)[1]; p.u -= 1;
    // the gate is a dead end: a walker heading into it goes into the tunnel and is gone
    if (p.gx === TUNNEL_GATE.gx && p.gz === TUNNEL_GATE.gz && p.dir === 0) { p.mode = 'enter'; p.t = ENTER_S; p.tunnel = true; return; }
    let dirs = dirsOfMask(connMask(roads, p.gx, p.gz)).filter((d) => d !== opposite(p.dir));
    if (!dirs.length) dirs = dirsOfMask(connMask(roads, p.gx, p.gz));
    if (!dirs.length) { p.alive = false; return; }
    p.dir = dirs[Math.floor(rng() * dirs.length)];
    const r = rng();
    if (r < ENTER_CHANCE && hasDoor(p.gx, p.gz)) { p.mode = 'enter'; p.t = ENTER_S; }
    else if (r < ENTER_CHANCE + IDLE_CHANCE) { p.mode = 'idle'; p.t = 1.5 + rng() * 2; }
  }
  const hasDoor = (gx, gz) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
    const x = gx + dx, z = gz + dz;
    return x >= 0 && z >= 0 && x < GRID_N && z < GRID_N && grid.lot[tileIndex(x, z)] > 0;
  });

  function inView(x, z) {
    const v = camera.view, r = (v.half / v.zoom) * 2.2 + 4, dx = x - v.tx, dz = z - v.tz;
    return dx * dx + dz * dz < r * r;
  }

  // Slots follow the residents out walking: new walkers appear as their window opens, and leave (into a doorway) as it closes.
  function sync(pop, hour) {
    const n = pop >= 0 && hour >= 0 ? Math.floor(pop) : -1;
    if (n < 0) return false;
    if (n !== seen.n || Math.abs(hour - seen.hour) > RECOUNT_H || hour < seen.hour) {
      seen.n = n; seen.hour = hour;
      const cap = Math.min(MAX, Math.floor(TARGET * crowd));
      seen.count = walkingNow(n, hour, out.subarray(0, cap));
      walking.clear();
      for (let k = 0; k < seen.count; k++) walking.add(out[k]);
      for (const p of people) {
        if (p.person >= 0 && !walking.has(p.person) && p.alive && !p.leave) { p.leave = true; if (p.mode === 'walk' || p.mode === 'idle') { p.mode = 'enter'; p.t = ENTER_S; } }
      }
      const have = new Set();
      for (const p of people) if (p.person >= 0 && !p.leave) have.add(p.person);
      for (let k = 0; k < seen.count; k++) {
        const id = out[k];
        if (have.has(id)) continue;
        let i = people.findIndex((p) => !p.alive);
        if (i < 0 && people.length < MAX) { i = people.length; people.push({ alive: false, gx: 0, gz: 0, dir: 0, side: 1, u: 0, mode: 'walk', t: 0, person: -1, leave: false, size: 1, speed: SPEED, lean: 0 }); }
        if (i < 0) break;
        const p = people[i];
        p.leave = false; p.alive = false; dress(i, p, id);
        if (place(p)) { p.mode = 'exit'; p.t = ENTER_S; }
        have.add(id);
      }
      for (const m of parts) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    return true;
  }

  return {
    // hour is the town clock (state.routineHour). The walkers on screen are the residents whose walk window is open now.
    update(dt, next, pop, live, hour) {
      arrive = live ? live.perS : 0;
      if (next !== roads) {
        roads = next;
        roadTiles = Object.keys(next).map(Number);
      }
      if (!sync(pop, hour)) {
        // no population or clock to follow (bare scenes): a few wanderers, as before
        const want = Math.min(TARGET * crowd, Math.round(roadTiles.length * PER_ROAD_TILE));
        while (people.length < want) people.push({ alive: false, gx: 0, gz: 0, dir: 0, side: 1, u: 0, mode: 'walk', t: 0, person: -1, leave: false, size: 1, speed: SPEED, lean: 0 });
        if (people.length > want) people.length = want;
      }
      people.forEach((p, i) => {
        const anon = p.person < 0;
        if (!p.alive && !anon) { hide(i); return; }
        if (anon && (!p.alive || !isRoad(p.gx, p.gz))) { if (!place(p)) { hide(i); return; } }
        if (p.alive && !isRoad(p.gx, p.gz)) { if (!place(p)) { hide(i); return; } }
        // state machine
        let scale = 1;
        if (p.mode === 'walk') {
          p.u += (p.speed * dt) / TILE;
          while (p.u >= 1 && p.alive) junction(p);
          if (!p.alive) { if (!anon && !p.leave) place(p); if (!p.alive) { hide(i); return; } }
        } else if (p.mode === 'idle') {
          p.t -= dt; if (p.t <= 0) p.mode = 'walk';
        } else if (p.mode === 'enter') {
          p.t -= dt; scale = Math.max(0, p.t / ENTER_S);
          if (p.t <= 0 && (p.tunnel || p.leave)) { p.alive = false; p.tunnel = false; if (!anon && !p.leave) place(p); hide(i); return; }
          if (p.t <= 0) { p.mode = 'inside'; p.t = 3 + rng() * 3; scale = 0; }
        } else if (p.mode === 'inside') {
          p.t -= dt; scale = 0;
          if (p.t <= 0) { if (p.leave) { p.alive = false; hide(i); return; } p.mode = 'exit'; p.t = ENTER_S; }
        } else if (p.mode === 'exit') {
          p.t -= dt; scale = Math.min(1, 1 - p.t / ENTER_S);
          if (p.t <= 0) p.mode = 'walk';
        }
        // position: the road centre, stepped along the heading, offset onto the pavement
        const [cx, cz] = tileWorld(p.gx, p.gz), [dx, dz] = dirVec(p.dir);
        const along = p.mode === 'walk' ? p.u : 0;
        const x = cx + dx * TILE * along - dz * PAVEMENT * p.side, z = cz + dz * TILE * along + dx * PAVEMENT * p.side;
        if (!inView(x, z) || scale === 0) { hide(i); return; }
        const stride = p.mode === 'walk' ? Math.sin(along * Math.PI * 2 * (TILE / 1.3)) : 0;
        const bob = Math.abs(stride) * 0.04 * p.size;
        q.setFromEuler(e.set(stride * 0.06, Math.atan2(-dz, dx), -p.lean));
        const sz = scale * p.size;
        pos.set(x, groundY(x, z) + 0.02 + bob, z); sc.set(sz, sz, sz);
        mtx.compose(pos, q, sc);
        for (const m of parts) m.setMatrixAt(i, mtx);
      });
      for (const m of parts) { m.count = people.length; m.instanceMatrix.needsUpdate = true; }
    },
    count: () => people.filter((p) => p.alive && p.mode !== 'inside').length,
    setCrowd(c) { crowd = c; },
  };
}
