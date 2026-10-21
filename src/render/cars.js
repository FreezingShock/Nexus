// Cars are visual agents only: they wander the road network tile by tile, and nothing in the sim depends on them.
// Bodies and cabins are two InstancedMeshes; the ink edges are one dynamic line buffer.
import * as THREE from '../../vendor/three/three.module.min.js';
import { toon, lineMat } from './materials.js';
import { GRID_N } from '../world/grid.js';
import { DIRS, connMask, dirsOfMask, opposite, shapeOf } from '../world/roadnet.js';
import { CAR_COLORS } from '../world/palettes.js';
import { makeRng } from '../world/rng.js';
import { groundY, tileWorld } from './road-mesh.js';

const BODY = new THREE.BoxGeometry(1.5, 0.45, 0.8), CABIN = new THREE.BoxGeometry(0.8, 0.4, 0.7);
const MAX_CARS = 64, LANE = 0.6, HALF = 1.5;

export function buildCars(parent, layout) {
  const n = MAX_CARS;
  const rng = makeRng(77);
  const bodies = new THREE.InstancedMesh(BODY, toon(0xffffff), n);
  const cabins = new THREE.InstancedMesh(CABIN, toon(0xFAF3E4), n);
  for (const m of [bodies, cabins]) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; }
  const col = new THREE.Color();
  const palette = layout.cars.map((c) => c.col).concat(CAR_COLORS);
  for (let i = 0; i < n; i++) bodies.setColorAt(i, col.setHex(palette[i % palette.length]));
  bodies.count = cabins.count = 0; // grows with the road network

  const tmpl = [];
  const addEdges = (geo, x, y, z) => {
    const p = new THREE.EdgesGeometry(geo, 30).attributes.position;
    for (let i = 0; i < p.count; i++) tmpl.push(p.getX(i) + x, p.getY(i) + y, p.getZ(i) + z);
  };
  addEdges(BODY, 0, 0.4, 0); addEdges(CABIN, -0.1, 0.78, 0);
  const per = tmpl.length;
  const lineGeo = new THREE.BufferGeometry();
  const lp = new Float32Array(per * n);
  lineGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false; lineGeo.setDrawRange(0, 0);
  parent.add(bodies, cabins, lines);

  const m = new THREE.Matrix4(), local = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), v = new THREE.Vector3();

  let roads = null, tiles = [], cars = [];
  const at = (gx, gz) => (gx >= 0 && gz >= 0 && gx < GRID_N && gz < GRID_N ? roads[gz * GRID_N + gx] : undefined);

  // A one-way tile only takes traffic going its way; a corner also refuses the arm it exits by.
  const accepts = (rec, out) => !rec || rec.t !== 'one' || rec.d !== opposite(out);
  const strictOk = (rec, out, shape) => accepts(rec, out) && (!rec || rec.t !== 'one' || shape.kind !== 'straight' || rec.d === out);
  const laneFor = (rec, car) => (rec && rec.t === 'one' ? car.side * LANE : LANE);

  // Builds the curve through tile (gx, gz): enter moving `mv`, leave moving `out`.
  function plan(car) {
    const [cx, cz] = tileWorld(car.gx, car.gz), mv = DIRS[car.mv], out = DIRS[car.out];
    const rm = [-mv[1], mv[0]], ro = [-out[1], out[0]];
    const next = at(car.gx + out[0], car.gz + out[1]);
    const l0 = car.lane, l1 = laneFor(next, car);
    const p0 = [cx - mv[0] * HALF + rm[0] * l0, cz - mv[1] * HALF + rm[1] * l0];
    const p2 = [cx + out[0] * HALF + ro[0] * l1, cz + out[1] * HALF + ro[1] * l1];
    let c;
    if (car.out === car.mv) c = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
    else if (car.out === opposite(car.mv)) c = [cx + mv[0] * 1.25, cz + mv[1] * 1.25];
    else { const s = (p2[0] - p0[0]) * mv[0] + (p2[1] - p0[1]) * mv[1]; c = [p0[0] + mv[0] * s, p0[1] + mv[1] * s]; }
    const chord = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]), poly = Math.hypot(c[0] - p0[0], c[1] - p0[1]) + Math.hypot(p2[0] - c[0], p2[1] - c[1]);
    car.seg = { p0, c, p2, len: Math.max(0.5, (2 * chord + poly) / 3) };
    car.nextLane = l1;
  }

  // Picks where to go from the tile the car is in. Returns false when it is stuck.
  function choose(car) {
    const rec = at(car.gx, car.gz), shape = shapeOf(connMask(roads, car.gx, car.gz));
    let opts = dirsOfMask(connMask(roads, car.gx, car.gz)).filter((d) => d !== opposite(car.mv));
    if (rec.t === 'one' && shape.kind !== 'cross' && shape.kind !== 'tee') opts = opts.filter((d) => d === rec.d);
    opts = opts.filter((d) => { const nr = at(car.gx + DIRS[d][0], car.gz + DIRS[d][1]); return nr && strictOk(nr, d, shapeOf(connMask(roads, car.gx + DIRS[d][0], car.gz + DIRS[d][1]))); });
    if (!opts.length) {
      const back = opposite(car.mv), nr = at(car.gx + DIRS[back][0], car.gz + DIRS[back][1]);
      if (rec.t === 'one' || !nr || nr.t === 'one') return false; // one-way roads never turn cars around
      opts = [back];
    }
    // prefer going on over turning, now and then take a turn
    const straight = opts.includes(car.mv);
    car.out = straight && (opts.length === 1 || rng() < 0.55) ? car.mv : opts[Math.floor(rng() * opts.length)];
    plan(car);
    return true;
  }

  function respawn(car) {
    for (let tries = 0; tries < 30; tries++) {
      const t = tiles[Math.floor(rng() * tiles.length)];
      if (!t) break;
      const mask = connMask(roads, t[0], t[1]), dirs = dirsOfMask(mask);
      if (!dirs.length) continue;
      const rec = at(t[0], t[1]);
      let mv = dirs[Math.floor(rng() * dirs.length)];
      if (rec.t === 'one') { if (!dirs.includes(rec.d)) continue; mv = rec.d; }
      car.gx = t[0]; car.gz = t[1]; car.mv = mv; car.side = rng() < 0.5 ? -1 : 1; car.lane = laneFor(rec, car);
      car.u = 0; car.age = 0; car.speed = 2.2 + rng() * 1.6;
      if (choose(car)) return true;
    }
    car.alive = false;
    return false;
  }

  function sync(next) {
    roads = next;
    tiles = Object.keys(next).map((k) => [Number(k) % GRID_N, Math.floor(Number(k) / GRID_N)]);
    const want = Math.min(n, Math.round(tiles.length * 0.26));
    while (cars.length < want) cars.push({ alive: false, u: 0, age: 0, side: 1, lane: LANE });
    if (cars.length > want) cars.length = want;
    for (const c of cars) if (!c.alive || !at(c.gx, c.gz) || !at(c.gx + DIRS[c.out][0], c.gz + DIRS[c.out][1])) { c.alive = true; respawn(c); } else { plan(c); }
    bodies.count = cabins.count = cars.length; lineGeo.setDrawRange(0, per * cars.length);
  }

  return {
    // dt is already scaled by game speed; paused passes 0. `next` is state.roads.
    update(dt, next) {
      if (next !== roads) sync(next);
      cars.forEach((c, i) => {
        if (!c.alive) { cars[i].alive = respawn(c); if (!c.alive) { bodies.setMatrixAt(i, local.makeScale(0, 0, 0)); cabins.setMatrixAt(i, local.makeScale(0, 0, 0)); return; } }
        c.age += dt; c.u += (c.speed * dt) / c.seg.len;
        let guard = 0;
        while (c.u >= 1 && guard++ < 3) {
          const nx = c.gx + DIRS[c.out][0], nz = c.gz + DIRS[c.out][1];
          if (!at(nx, nz)) { respawn(c); break; }
          c.gx = nx; c.gz = nz; c.mv = c.out; c.lane = c.nextLane; c.u -= 1;
          if (!choose(c)) { respawn(c); break; }
        }
        const { p0, c: cp, p2 } = c.seg, u = Math.min(1, c.u), w = 1 - u;
        const x = w * w * p0[0] + 2 * w * u * cp[0] + u * u * p2[0], z = w * w * p0[1] + 2 * w * u * cp[1] + u * u * p2[1];
        const tx = 2 * w * (cp[0] - p0[0]) + 2 * u * (p2[0] - cp[0]), tz = 2 * w * (cp[1] - p0[1]) + 2 * u * (p2[1] - cp[1]);
        const grow = Math.min(1, c.age * 2.5);
        q.setFromEuler(e.set(0, Math.atan2(-tz, tx), 0)); pos.set(x, 0.1 + groundY(x, z), z); sc.set(grow, grow, grow);
        m.compose(pos, q, sc);
        bodies.setMatrixAt(i, local.makeTranslation(0, 0.4, 0).premultiply(m));
        cabins.setMatrixAt(i, local.makeTranslation(-0.1, 0.78, 0).premultiply(m));
        for (let k = 0; k < per; k += 3) {
          v.set(tmpl[k], tmpl[k + 1], tmpl[k + 2]).applyMatrix4(m);
          lp[i * per + k] = v.x; lp[i * per + k + 1] = v.y; lp[i * per + k + 2] = v.z;
        }
      });
      bodies.instanceMatrix.needsUpdate = cabins.instanceMatrix.needsUpdate = true;
      lineGeo.attributes.position.needsUpdate = true;
    },
    count: () => cars.filter((c) => c.alive).length,
  };
}
