// Cars and buses, drawn. The movement is in vehicle-agents.js (pure logic, tested in node); this file poses each vehicle
// on its lane and writes it into instanced meshes. Three car models and one bus model, each a body and a cabin
// InstancedMesh plus one dynamic line buffer for the ink edges. Only vehicles on screen are written, so the GPU work
// follows what the player can see. Nothing here feeds back into the sim.
import * as THREE from '../../vendor/three/three.module.min.js';
import { toon, lineMat } from './materials.js';
import { GRID_N } from '../world/grid.js';
import { DIRS, opposite } from '../world/roadnet.js';
import { CAR_COLORS } from '../world/palettes.js';
import { groundY, tileWorld } from './road-mesh.js';
import { Fleet, BUS, DRIVE, KERB, KERB_TIME, SHRINK_TIME, laneOf, laneOffset } from './vehicle-agents.js';

const CAR_MAX = 500, CAR_TARGET = 300, CARS_PER_FLOW = 0.35; // cars on screen = volume on the network x this
const BUS_MAX = 16, BUS_COLOURS = [0xD98C7A, 0xEBD9A0];
const CABIN = 0xFAF3E4, HALF = 1.5;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// Hatchback, saloon and van. Sizes in world units. The cabin tapers towards the top; the van's is nearly square.
const MODELS = [
  { bl: 1.3, bh: 0.42, bw: 0.8, by: 0.36, cl: 0.7, ch: 0.36, cw: 0.7, cx: -0.12, taper: 0.7 },
  { bl: 1.62, bh: 0.4, bw: 0.82, by: 0.34, cl: 0.8, ch: 0.34, cw: 0.68, cx: -0.2, taper: 0.6 },
  { bl: 1.5, bh: 0.64, bw: 0.84, by: 0.44, cl: 1.0, ch: 0.3, cw: 0.76, cx: 0.2, taper: 0.92 },
];
const BUS_MODEL = { bl: 2.3, bh: 0.85, bw: 1.05, by: 0.55, cl: 2.0, ch: 0.22, cw: 0.92, cx: 0, taper: 1 };

// Shapes a box so its top is narrower by `k` (a windscreen slope), in place.
function taper(geo, k) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setX(i, p.getX(i) * k);
  p.needsUpdate = true;
  return geo;
}

function modelGeometry(s) {
  const body = new THREE.BoxGeometry(s.bl, s.bh, s.bw);
  const cabin = taper(new THREE.BoxGeometry(s.cl, s.ch, s.cw), s.taper);
  const bodyY = s.by, cabinY = s.by + s.bh / 2 + s.ch / 2 - 0.04; // the cabin sits on the body's roof
  return { body, cabin, bodyY, cabinX: s.cx, cabinY };
}

// One model: instanced bodies and cabins, the ink edges as one line buffer, and the offsets that place them.
function buildModel(parent, spec, cap, cabinColour) {
  const g = modelGeometry(spec);
  const bodies = new THREE.InstancedMesh(g.body, toon(0xffffff), cap);
  const cabins = new THREE.InstancedMesh(g.cabin, toon(cabinColour), cap);
  for (const m of [bodies, cabins]) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.count = 0; }

  // Ink edges: template vertices with the part offsets baked in. Each vehicle transforms them on every write.
  const tmpl = [];
  const addEdges = (geo, x, y, z) => {
    const p = new THREE.EdgesGeometry(geo, 30).attributes.position;
    for (let i = 0; i < p.count; i++) tmpl.push(p.getX(i) + x, p.getY(i) + y, p.getZ(i) + z);
  };
  addEdges(g.body, 0, g.bodyY, 0);
  addEdges(g.cabin, g.cabinX, g.cabinY, 0);
  const verts = tmpl.length / 3;
  const lineGeo = new THREE.BufferGeometry();
  const lp = new Float32Array(tmpl.length * cap);
  lineGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  lineGeo.setDrawRange(0, 0);
  parent.add(bodies, cabins, lines);

  return {
    bodies, cabins, lineGeo, lp, tmpl, verts, n: 0,
    bodyOff: new THREE.Matrix4().makeTranslation(0, g.bodyY, 0),
    cabinOff: new THREE.Matrix4().makeTranslation(g.cabinX, g.cabinY, 0),
  };
}

// Shared state every vehicle reads: the roads, the sim's traffic model (read only) and the view box for culling.
export function buildCars(parent, grid, camera) {
  const fleet = new Fleet(7);
  const models = MODELS.map((s) => buildModel(parent, s, CAR_MAX, CABIN));
  const bus = buildModel(parent, BUS_MODEL, BUS_MAX, CABIN);
  const all = [...models, bus];
  const m = new THREE.Matrix4(), local = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const pos = new THREE.Vector3(), sc = new THREE.Vector3(), v = new THREE.Vector3(), col = new THREE.Color();
  const pose = { x: 0, z: 0, heading: 0 };
  let roads = null, tours = [];

  // Where a vehicle is, and which way it faces. Driving vehicles follow a Bezier through their tile, from the lane they
  // enter on to the lane they leave on. Parked ones stand at the kerb.
  function poseOf(a) {
    const gx = a.tile % GRID_N, gz = (a.tile - gx) / GRID_N;
    const [cx, cz] = tileWorld(gx, gz);
    const mv = DIRS[a.mv];
    if (a.state !== DRIVE) {
      pose.x = cx - mv[1] * KERB; pose.z = cz + mv[0] * KERB;
      pose.heading = Math.atan2(-mv[1], mv[0]);
      return pose;
    }
    const out = DIRS[a.out], rm = [-mv[1], mv[0]], ro = [-out[1], out[0]];
    const offIn = laneOffset(roads, a.tile, a.lane);
    const offOut = a.nt >= 0 ? laneOffset(roads, a.nt, laneOf(roads, a.nt, a.pref)) : offIn;
    const p0x = cx - mv[0] * HALF + rm[0] * offIn, p0z = cz - mv[1] * HALF + rm[1] * offIn;
    const p2x = cx + out[0] * HALF + ro[0] * offOut, p2z = cz + out[1] * HALF + ro[1] * offOut;
    let kx, kz;
    if (a.out === a.mv) { kx = (p0x + p2x) / 2; kz = (p0z + p2z) / 2; }
    else if (a.out === opposite(a.mv)) { kx = cx + mv[0] * 1.25; kz = cz + mv[1] * 1.25; }
    else { const s = (p2x - p0x) * mv[0] + (p2z - p0z) * mv[1]; kx = p0x + mv[0] * s; kz = p0z + mv[1] * s; }
    const u = Math.min(1, Math.max(0, a.x)), w = 1 - u;
    pose.x = w * w * p0x + 2 * w * u * kx + u * u * p2x;
    pose.z = w * w * p0z + 2 * w * u * kz + u * u * p2z;
    const tx = 2 * w * (kx - p0x) + 2 * u * (p2x - kx), tz = 2 * w * (kz - p0z) + 2 * u * (p2z - kz);
    pose.heading = Math.atan2(-tz, tx);
    return pose;
  }

  // Grows in after a spawn, and shrinks away once parked.
  function scaleOf(a) {
    if (a.state === DRIVE) return Math.min(1, a.age * 2.5);
    return Math.min(1, Math.max(0, 1 - (a.t - KERB_TIME) / SHRINK_TIME));
  }

  function write(M, i, s, colourHex) {
    const { x, z, heading } = pose;
    q.setFromEuler(e.set(0, heading, 0));
    pos.set(x, 0.1 + groundY(x, z), z);
    sc.set(s, s, s);
    m.compose(pos, q, sc);
    M.bodies.setMatrixAt(i, local.copy(M.bodyOff).premultiply(m));
    M.cabins.setMatrixAt(i, local.copy(M.cabinOff).premultiply(m));
    M.bodies.setColorAt(i, col.setHex(colourHex));
    const { tmpl, verts, lp } = M;
    for (let k = 0; k < verts; k++) {
      v.set(tmpl[3 * k], tmpl[3 * k + 1], tmpl[3 * k + 2]).applyMatrix4(m);
      const o = (i * verts + k) * 3;
      lp[o] = v.x; lp[o + 1] = v.y; lp[o + 2] = v.z;
    }
  }

  // Cheap culling: a circle around the view centre, wide enough for the widest screen at this zoom.
  function inView(view, x, z) {
    const r = (view.half / view.zoom) * 2.2 + 4;
    const dx = x - view.tx, dz = z - view.tz;
    return dx * dx + dz * dz < r * r;
  }

  function draw(view) {
    for (const M of all) M.n = 0;
    for (const a of fleet.agents) {
      if (!a.alive) continue;
      const s = scaleOf(a);
      if (s < 0.02) continue;
      poseOf(a);
      if (!inView(view, pose.x, pose.z)) continue;
      const M = a.kind === BUS ? bus : models[a.type];
      const colour = a.kind === BUS ? BUS_COLOURS[a.colour % BUS_COLOURS.length] : CAR_COLORS[a.colour % CAR_COLORS.length];
      write(M, M.n++, s, colour);
    }
    for (const M of all) {
      M.bodies.count = M.cabins.count = M.n;
      M.lineGeo.setDrawRange(0, M.verts * M.n);
      M.bodies.instanceMatrix.needsUpdate = true;
      M.cabins.instanceMatrix.needsUpdate = true;
      if (M.bodies.instanceColor) M.bodies.instanceColor.needsUpdate = true;
      M.lineGeo.attributes.position.needsUpdate = true;
    }
  }

  return {
    // dt is already scaled by game speed; paused passes 0. grid.traffic is read only.
    update(dt, next, view = camera.view) {
      if (next !== roads) { roads = next; tours = busTours(next); }
      const tr = grid.traffic || null;
      if (tr && roads) {
        fleet.step(dt, {
          roads, net: tr.net, fields: tr.fields, anchors: tr.anchors, total: tr.total, version: grid.loadRev, tours,
          carWant: Math.min(CAR_TARGET, Math.round(tr.vehicles * CARS_PER_FLOW)), busWant: Math.min(BUS_MAX, tours.length),
        });
      }
      draw(view);
    },
    count: () => fleet.carCount() + fleet.busCount(),
    carCount: () => fleet.carCount(),
    busCount: () => fleet.busCount(),
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
        if (vx < 0 || vz < 0 || vx >= GRID_N || vz >= GRID_N) continue;
        const v = vz * GRID_N + vx;
        if (!isBus(v) || seen.has(v)) continue;
        seen.add(v); tour.push(v); stack.push([v, 0]); advanced = true;
      }
      if (!advanced) { stack.pop(); if (stack.length) tour.push(stack[stack.length - 1][0]); }
    }
    if (tour.length > 2) tours.push(tour.slice(0, -1)); // the walk ends back at the root
  }
  return tours;
}
