// Townsfolk walk the pavements beside the roads, idle at junctions and now and then slip into a building.
// Visual only: no pathing, no effect on the sim. Each one wanders the road network tile by tile and picks a way at each
// junction. State machine: walk -> idle | enter -> inside -> exit -> walk.
import * as THREE from '../../vendor/three/three.module.min.js';
import { toon } from './materials.js';
import { GRID_N, tileIndex } from '../world/grid.js';
import { DIRS, connMask, dirsOfMask, opposite } from '../world/roadnet.js';
import { makeRng } from '../world/rng.js';
import { groundY, tileWorld } from './road-mesh.js';

const MAX = 500, TARGET = 300, PER_ROAD_TILE = 0.5;
const SPEED = 1.6, TILE = 3, PAVEMENT = 1.35; // units per second, tile size, offset from the road centre
const ENTER_S = 0.35, IDLE_CHANCE = 0.12, ENTER_CHANCE = 0.05;
const CLOTHES = [0xD98C7A, 0xBFD8C4, 0x8DBEDD, 0xEBD9A0, 0x9DB37C, 0xFAF3E4, 0xCBC3DC];
const SKIN = 0xE8C7A0;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export function buildTownsfolk(parent, grid, camera) {
  const rng = makeRng(131);
  const body = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.2, 0.6, 6), toon(0xffffff), MAX);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 6, 5), toon(SKIN), MAX);
  for (const m of [body, head]) { m.frustumCulled = false; m.castShadow = true; m.count = 0; }
  const col = new THREE.Color();
  for (let i = 0; i < MAX; i++) body.setColorAt(i, col.setHex(CLOTHES[i % CLOTHES.length]));
  parent.add(body, head);

  const people = [];
  let roads = null, roadTiles = [];
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3();

  const dirVec = (d) => DIRS[d];
  const isRoad = (gx, gz) => gx >= 0 && gz >= 0 && gx < GRID_N && gz < GRID_N && !!roads[tileIndex(gx, gz)];

  // A random road tile to stand on, and a heading that leaves it.
  function place(p) {
    for (let tries = 0; tries < 20 && roadTiles.length; tries++) {
      const t = roadTiles[Math.floor(rng() * roadTiles.length)];
      const gx = t % GRID_N, gz = Math.floor(t / GRID_N);
      const dirs = dirsOfMask(connMask(roads, gx, gz));
      if (!dirs.length) continue;
      p.gx = gx; p.gz = gz; p.dir = dirs[Math.floor(rng() * dirs.length)];
      p.side = rng() < 0.5 ? -1 : 1; p.u = rng(); p.mode = 'walk'; p.t = 0; p.alive = true;
      return true;
    }
    p.alive = false;
    return false;
  }

  // Reached the middle of the next tile: pick the way on. Usually onwards, not back the way they came.
  function junction(p) {
    p.gx += dirVec(p.dir)[0]; p.gz += dirVec(p.dir)[1]; p.u -= 1;
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

  return {
    update(dt, next) {
      if (next !== roads) {
        roads = next;
        roadTiles = Object.keys(next).map(Number);
      }
      const want = Math.min(TARGET, Math.round(roadTiles.length * PER_ROAD_TILE));
      while (people.length < want) people.push({ alive: false, gx: 0, gz: 0, dir: 0, side: 1, u: 0, mode: 'walk', t: 0, hidden: false });
      if (people.length > want) people.length = want;
      people.forEach((p, i) => {
        if (!p.alive || !isRoad(p.gx, p.gz)) { place(p); if (!p.alive) { body.setMatrixAt(i, ZERO); head.setMatrixAt(i, ZERO); return; } }
        // state machine
        let scale = 1;
        if (p.mode === 'walk') {
          p.u += (SPEED * dt) / TILE;
          while (p.u >= 1 && p.alive) junction(p);
          if (!p.alive) { place(p); return; }
        } else if (p.mode === 'idle') {
          p.t -= dt; if (p.t <= 0) p.mode = 'walk';
        } else if (p.mode === 'enter') {
          p.t -= dt; scale = Math.max(0, p.t / ENTER_S);
          if (p.t <= 0) { p.mode = 'inside'; p.t = 3 + rng() * 3; scale = 0; }
        } else if (p.mode === 'inside') {
          p.t -= dt; scale = 0;
          if (p.t <= 0) { p.mode = 'exit'; p.t = ENTER_S; }
        } else if (p.mode === 'exit') {
          p.t -= dt; scale = Math.min(1, 1 - p.t / ENTER_S);
          if (p.t <= 0) p.mode = 'walk';
        }
        // position: the road centre, stepped along the heading, offset onto the pavement
        const [cx, cz] = tileWorld(p.gx, p.gz), [dx, dz] = dirVec(p.dir);
        const along = p.mode === 'walk' ? p.u : 0;
        const x = cx + dx * TILE * along - dz * PAVEMENT * p.side, z = cz + dz * TILE * along + dx * PAVEMENT * p.side;
        if (!inView(x, z) || scale === 0) { body.setMatrixAt(i, ZERO); head.setMatrixAt(i, ZERO); return; }
        const bob = p.mode === 'walk' ? Math.abs(Math.sin(along * Math.PI * 2)) * 0.05 : 0;
        q.setFromEuler(e.set(0, Math.atan2(-dz, dx), 0));
        pos.set(x, groundY(x, z) + 0.3 + bob, z); sc.set(scale, scale, scale);
        mtx.compose(pos, q, sc);
        body.setMatrixAt(i, mtx);
        pos.y += 0.42;
        mtx.compose(pos, q, sc);
        head.setMatrixAt(i, mtx);
      });
      body.count = head.count = people.length;
      body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = true;
    },
    count: () => people.filter((p) => p.alive).length,
  };
}
