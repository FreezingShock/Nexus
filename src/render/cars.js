// Cars and buses are visual agents only. Cars follow the sim's flow fields (one tree per destination zone) and spawn on
// road edges in proportion to their volume. Each bus loops once round its bus network. Nothing here feeds back into the sim.
// Bodies and cabins are InstancedMeshes; the ink edges are one dynamic line buffer per kind.
import * as THREE from '../../vendor/three/three.module.min.js';
import { toon, lineMat } from './materials.js';
import { GRID_N, inBounds, tileIndex } from '../world/grid.js';
import { DIRS, opposite } from '../world/roadnet.js';
import { CAR_COLORS } from '../world/palettes.js';
import { makeRng } from '../world/rng.js';
import { groundY, tileWorld } from './road-mesh.js';
import { stepBetween } from '../sim/traffic.js';

const CAR_MAX = 500, CAR_TARGET = 300, CARS_PER_FLOW = 0.35; // cars on screen = volume on the network x this
const BUS_MAX = 16;
const LANE = 0.6, HALF = 1.5;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

const CAR = { body: new THREE.BoxGeometry(1.5, 0.45, 0.8), cabin: new THREE.BoxGeometry(0.8, 0.4, 0.7), bodyY: 0.4, cabinX: -0.1, cabinY: 0.78 };
const BUS = { body: new THREE.BoxGeometry(2.3, 0.85, 1.05), cabin: new THREE.BoxGeometry(2.0, 0.22, 0.92), bodyY: 0.55, cabinX: 0, cabinY: 1.04 };

// Shared state every vehicle reads: the roads, the sim's traffic model and the view box for culling.
// `tr` is grid.traffic (fields, spawn table, dests); `view` is camera.view.
export function buildCars(parent, grid, camera) {
  const cars = makeVehicles(parent, { max: CAR_MAX, geo: CAR, colors: CAR_COLORS, cabinColor: 0xFAF3E4, speed: [2.2, 3.8], seed: 7 });
  const buses = makeVehicles(parent, { max: BUS_MAX, geo: BUS, colors: [0xD98C7A, 0xEBD9A0], cabinColor: 0xFAF3E4, speed: [2.0, 2.0], seed: 9 });
  let roads = null, tours = [];
  return {
    // dt is already scaled by game speed; paused passes 0.
    update(dt, next) {
      if (next !== roads) { roads = next; tours = busTours(next); }
      const tr = grid.traffic || null, view = camera.view;
      const want = tr ? Math.min(CAR_TARGET, Math.round(tr.vehicles * CARS_PER_FLOW)) : 0;
      cars.update(dt, { roads, tr, view, want, tours: null });
      buses.update(dt, { roads, tr, view, want: Math.min(BUS_MAX, tours.length), tours });
    },
    count: () => cars.count() + buses.count(),
    carCount: () => cars.count(),
    busCount: () => buses.count(),
  };
}

// A bus loop per connected run of bus tiles: a depth-first walk of the run's spanning tree gives a closed tour that
// visits every tile (each street is driven both ways). Runs of a single tile have no loop.
export function busTours(roads) {
  const seen = new Set(), tours = [];
  const isBus = (i) => !!roads[i] && roads[i].t === 'bus';
  for (const key of Object.keys(roads)) {
    const root = Number(key);
    if (!isBus(root) || seen.has(root)) continue;
    const tour = [root], stack = [[root, 0]];
    seen.add(root);
    while (stack.length) {
      const top = stack[stack.length - 1], u = top[0], gx = u % GRID_N, gz = Math.floor(u / GRID_N);
      let advanced = false;
      while (top[1] < 4 && !advanced) {
        const d = top[1]++, vx = gx + DIRS[d][0], vz = gz + DIRS[d][1];
        if (!inBounds(vx, vz)) continue;
        const v = tileIndex(vx, vz);
        if (!isBus(v) || seen.has(v)) continue;
        seen.add(v); tour.push(v); stack.push([v, 0]); advanced = true;
      }
      if (!advanced) { stack.pop(); if (stack.length) tour.push(stack[stack.length - 1][0]); }
    }
    if (tour.length > 2) tours.push(tour.slice(0, -1)); // the walk ends back at the root
  }
  return tours;
}

// One kind of vehicle: instanced bodies and cabins, plus the ink edges, and the logic that moves them along.
function makeVehicles(parent, spec) {
  const { max, geo, colors, cabinColor, speed, seed } = spec;
  const rng = makeRng(seed);
  const bodies = new THREE.InstancedMesh(geo.body, toon(0xffffff), max);
  const cabins = new THREE.InstancedMesh(geo.cabin, toon(cabinColor), max);
  for (const m of [bodies, cabins]) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.count = 0; }
  const col = new THREE.Color();
  for (let i = 0; i < max; i++) bodies.setColorAt(i, col.setHex(colors[i % colors.length]));

  // Ink edges: template vertices with the body offsets baked in, transformed per vehicle.
  const tmpl = [];
  const addEdges = (g, x, y, z) => {
    const p = new THREE.EdgesGeometry(g, 30).attributes.position;
    for (let i = 0; i < p.count; i++) tmpl.push(p.getX(i) + x, p.getY(i) + y, p.getZ(i) + z);
  };
  addEdges(geo.body, 0, geo.bodyY, 0); addEdges(geo.cabin, geo.cabinX, geo.cabinY, 0);
  const per = tmpl.length;
  const lineGeo = new THREE.BufferGeometry();
  const lp = new Float32Array(per * max);
  lineGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false; lineGeo.setDrawRange(0, 0);
  parent.add(bodies, cabins, lines);

  const m = new THREE.Matrix4(), local = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), v = new THREE.Vector3();
  const bodyOff = new THREE.Matrix4().makeTranslation(0, geo.bodyY, 0), cabinOff = new THREE.Matrix4().makeTranslation(geo.cabinX, geo.cabinY, 0);
  const cars = [];
  let roads = null;
  const at = (gx, gz) => (gx >= 0 && gz >= 0 && gx < GRID_N && gz < GRID_N ? roads[gz * GRID_N + gx] : undefined);

  // A one-way tile only takes traffic going its way; a corner also refuses the arm it exits by.
  const laneFor = (rec, car) => (rec && rec.t === 'one' ? car.side * LANE : LANE);

  // Builds the curve through the car's tile: enter moving `mv`, leave moving `out`.
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

  // Cars: the next tile is the flow field's next hop towards the car's destination. Buses: the next stop on the loop.
  // Returns false at the end of a route (the destination, or no way on), which makes the car respawn.
  function choose(car, ctx) {
    const u = car.gz * GRID_N + car.gx;
    let nx;
    if (car.tour) nx = car.tour[(car.k + 1) % car.tour.length];
    else {
      const f = ctx.tr && ctx.tr.fields[car.dest];
      nx = f ? f.next[u] : -1;
    }
    if (nx === undefined || nx < 0) return false;
    const out = stepBetween(u, nx);
    if (out < 0 || !at(nx % GRID_N, Math.floor(nx / GRID_N))) return false;
    car.out = out;
    plan(car);
    return true;
  }

  // Cars spawn on an edge picked in proportion to its volume, heading along it, towards a destination that routes
  // through that edge. Buses start at a random stop of their loop.
  function respawn(car, ctx) {
    car.alive = false;
    car.age = 0; car.speed = speed[0] + rng() * (speed[1] - speed[0]); car.side = rng() < 0.5 ? -1 : 1; car.u = 0;
    if (car.tour) {
      const tour = car.tour, k = Math.floor(rng() * tour.length), t = tour[k];
      car.k = k; car.gx = t % GRID_N; car.gz = Math.floor(t / GRID_N);
      car.mv = stepBetween(tour[(k - 1 + tour.length) % tour.length], t);
      if (car.mv < 0) car.mv = 0;
      car.lane = laneFor(ctx.roads[t], car);
      car.out = stepBetween(t, tour[(k + 1) % tour.length]);
      if (car.out < 0) return false;
      plan(car); car.alive = true;
      return true;
    }
    const tr = ctx.tr;
    if (!tr || !tr.spawnN) return false;
    const total = tr.spawnCum[tr.spawnN - 1];
    for (let tries = 0; tries < 6; tries++) {
      const r = rng() * total;
      let lo = 0, hi = tr.spawnN - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (tr.spawnCum[mid] < r) lo = mid + 1; else hi = mid; }
      const edge = tr.spawnEdge[lo], u = edge >> 2, d = edge & 3;
      const v = u + DIRS[d][0] + DIRS[d][1] * GRID_N;
      const options = [];
      for (const j of tr.dests) { const f = tr.fields[j]; if (f && f.next[u] === v) options.push(j); }
      if (!options.length) continue;
      car.dest = options[Math.floor(rng() * options.length)];
      car.gx = u % GRID_N; car.gz = Math.floor(u / GRID_N);
      car.mv = d; car.out = d;
      car.lane = laneFor(ctx.roads[u], car);
      plan(car); car.alive = true;
      return true;
    }
    return false;
  }

  function sync(want) {
    while (cars.length < want) cars.push({ alive: false, hidden: false, tour: null, k: 0, dest: -1, seg: null, lane: LANE, nextLane: LANE, u: 0, age: 0, speed: 1, side: 1, gx: 0, gz: 0, mv: 0, out: 0 });
    if (cars.length > want) cars.length = want;
  }

  function hide(i) {
    bodies.setMatrixAt(i, ZERO); cabins.setMatrixAt(i, ZERO);
    lp.fill(0, i * per, (i + 1) * per);
  }

  return {
    count: () => cars.filter((c) => c.alive).length,
    update(dt, ctx) {
      roads = ctx.roads;
      const tours = ctx.tours; // buses: slot i drives loop i; cars leave this null
      sync(ctx.want);
      cars.forEach((c, i) => {
        if (tours) {
          const loop = tours.length ? tours[i % tours.length] : null;
          if (c.tour !== loop) { c.tour = loop; c.alive = false; } // the roads changed under this bus: start it again
          if (!loop) { hide(i); return; }
        }
        if (c.alive && !at(c.gx, c.gz)) c.alive = false;
        if (!c.alive) { respawn(c, ctx); if (!c.alive) { hide(i); c.hidden = true; return; } }
        c.age += dt; c.u += (c.speed * dt) / c.seg.len;
        let guard = 0;
        while (c.u >= 1 && guard++ < 3) {
          const nx = c.gx + DIRS[c.out][0], nz = c.gz + DIRS[c.out][1];
          if (!at(nx, nz)) { c.alive = false; break; }
          c.gx = nx; c.gz = nz; c.mv = c.out; c.lane = c.nextLane; c.u -= 1;
          if (c.tour) c.k = (c.k + 1) % c.tour.length;
          if (!choose(c, ctx)) { c.alive = false; break; }
        }
        if (!c.alive) { respawn(c, ctx); if (!c.alive) { hide(i); c.hidden = true; return; } }
        const { p0, c: cp, p2 } = c.seg, u = Math.min(1, c.u), w = 1 - u;
        const x = w * w * p0[0] + 2 * w * u * cp[0] + u * u * p2[0], z = w * w * p0[1] + 2 * w * u * cp[1] + u * u * p2[1];
        const tx = 2 * w * (cp[0] - p0[0]) + 2 * u * (p2[0] - cp[0]), tz = 2 * w * (cp[1] - p0[1]) + 2 * u * (p2[1] - cp[1]);
        if (!inView(ctx.view, x, z)) { if (!c.hidden) hide(i); c.hidden = true; return; }
        c.hidden = false;
        const grow = Math.min(1, c.age * 2.5);
        q.setFromEuler(e.set(0, Math.atan2(-tz, tx), 0)); pos.set(x, 0.1 + groundY(x, z), z); sc.set(grow, grow, grow);
        m.compose(pos, q, sc);
        bodies.setMatrixAt(i, local.copy(bodyOff).premultiply(m));
        cabins.setMatrixAt(i, local.copy(cabinOff).premultiply(m));
        for (let k = 0; k < per; k += 3) {
          v.set(tmpl[k], tmpl[k + 1], tmpl[k + 2]).applyMatrix4(m);
          lp[i * per + k] = v.x; lp[i * per + k + 1] = v.y; lp[i * per + k + 2] = v.z;
        }
      });
      bodies.count = cabins.count = cars.length;
      lineGeo.setDrawRange(0, per * cars.length);
      bodies.instanceMatrix.needsUpdate = cabins.instanceMatrix.needsUpdate = true;
      lineGeo.attributes.position.needsUpdate = true;
    },
  };
}

// Cheap culling: a circle around the view centre, wide enough for the widest screen at this zoom.
function inView(view, x, z) {
  const r = (view.half / view.zoom) * 2.2 + 4;
  const dx = x - view.tx, dz = z - view.tz;
  return dx * dx + dz * dz < r * r;
}

