// Cars and buses, drawn. The movement is in vehicle-agents.js (pure logic, tested in node); this file poses each vehicle
// on its lane and writes it into instanced meshes. Six car models and one bus model, each a painted body and a trim mesh (glass, wheels, lamps),
// both instanced, plus one dynamic line buffer shared by every model for the ink edges (one draw call, not seven). Only vehicles on screen are written, so the GPU work
// follows what the player can see. Nothing here feeds back into the sim.
import * as THREE from '../../vendor/three/three.module.min.js';
import { toon, toonUncached, lineMat } from './materials.js';
import { CAR_SPECS, BUS_SPEC, buildVehicle } from './vehicle-models.js';
import { GRID_N } from '../world/grid.js';
import { DIRS, opposite } from '../world/roadnet.js';
import { groundY, tileWorld } from './road-mesh.js';
import { allocInstanceColors } from './geom.js';
import { drivingNow } from '../sim/schedule.js';
import { Fleet, BUS, DRIVE, KERB, KERB_TIME, SHRINK_TIME, laneOf, laneOffset } from './vehicle-agents.js';

const CAR_MAX = 500; // hard cap on cars; the crowd setting scales how many of the residents out driving are drawn
const BUS_MAX = 16, BUS_COLOURS = [0xD98C7A, 0xEBD9A0];
const HALF = 1.5;
// Paint: warm pastels from the palette plus a few deeper tones, so a street has some variety without shouting.
const PAINT = [0xE9C1B8, 0xBFD8C4, 0xEBD9A0, 0xCBC3DC, 0xD98C7A, 0xFAF3E4, 0x9DB37C, 0xC8694F, 0xD9A441, 0x8DBEDD, 0x7C8C9A, 0xA7856A];
// How often (in town hours) the list of residents out driving is worked out again.
const RECOUNT_H = 0.02;

// Six car bodies and the bus, from vehicle-models.js. Each model: painted bodies, trim (glass, wheels, lamps) and an ink
// edge template. The trim casts no shadow: the body's shadow already covers it, and it saves a shadow draw per model.
function buildModel(parent, spec, cap) {
  const g = buildVehicle(spec);
  const bodies = allocInstanceColors(new THREE.InstancedMesh(g.body, toon(0xffffff), cap));
  const trim = new THREE.InstancedMesh(g.trim, toonUncached(0xffffff, { vertexColors: true }), cap);
  for (const m of [bodies, trim]) { m.frustumCulled = false; m.receiveShadow = true; m.count = 0; }
  bodies.castShadow = true;
  parent.add(bodies, trim);
  const tmpl = new Float32Array(g.edges);
  return { bodies, trim, tmpl, verts: tmpl.length / 3, cap, n: 0 };
}

// One line buffer with room for every model at its cap. Vehicles are written one after another each frame.
function buildEdges(parent, models) {
  const size = models.reduce((a, M) => a + M.tmpl.length * M.cap, 0);
  const geo = new THREE.BufferGeometry(), lp = new Float32Array(size);
  geo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  geo.setDrawRange(0, 0);
  const lines = new THREE.LineSegments(geo, lineMat);
  lines.frustumCulled = false;
  parent.add(lines);
  return { lines, geo, lp, n: 0 };
}

// Shared state every vehicle reads: the roads, the sim's traffic model (read only) and the view box for culling.
export function buildCars(parent, grid, camera) {
  const fleet = new Fleet(7);
  const models = CAR_SPECS.map((s) => buildModel(parent, s, CAR_MAX));
  const bus = buildModel(parent, BUS_SPEC, BUS_MAX);
  const persons = new Int32Array(CAR_MAX), seen = { hour: -1, n: -1, day: -1, count: 0 };
  let crowd = 1; // graphics setting: scales the car target (CAR_MAX is the hard cap)
  const all = [...models, bus];
  const edges = buildEdges(parent, all);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
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
    M.bodies.setMatrixAt(i, m);
    M.trim.setMatrixAt(i, m);
    M.bodies.setColorAt(i, col.setHex(colourHex));
    const { tmpl, verts } = M, lp = edges.lp;
    for (let k = 0; k < verts; k++) {
      v.set(tmpl[3 * k], tmpl[3 * k + 1], tmpl[3 * k + 2]).applyMatrix4(m);
      const o = (edges.n + k) * 3;
      lp[o] = v.x; lp[o + 1] = v.y; lp[o + 2] = v.z;
    }
    edges.n += verts;
  }

  // Cheap culling: a circle around the view centre, wide enough for the widest screen at this zoom.
  function inView(view, x, z) {
    const r = (view.half / view.zoom) * 2.2 + 4;
    const dx = x - view.tx, dz = z - view.tz;
    return dx * dx + dz * dz < r * r;
  }

  function draw(view) {
    for (const M of all) M.n = 0;
    edges.n = 0;
    for (const a of fleet.agents) {
      if (!a.alive) continue;
      const s = scaleOf(a);
      if (s < 0.02) continue;
      poseOf(a);
      if (!inView(view, pose.x, pose.z)) continue;
      const M = a.kind === BUS ? bus : models[a.type % models.length];
      const colour = a.kind === BUS ? BUS_COLOURS[a.colour % BUS_COLOURS.length] : PAINT[a.colour % PAINT.length];
      write(M, M.n++, s, colour);
    }
    for (const M of all) {
      M.bodies.count = M.trim.count = M.n;
      M.bodies.instanceMatrix.needsUpdate = true;
      M.trim.instanceMatrix.needsUpdate = true;
      if (M.bodies.instanceColor) M.bodies.instanceColor.needsUpdate = true;
    }
    edges.geo.setDrawRange(0, edges.n);
    const attr = edges.geo.attributes.position;
    attr.updateRange.offset = 0; attr.updateRange.count = Math.max(edges.n * 3, 3); // upload only what was written
    attr.needsUpdate = true;
  }

  return {
    // dt is already scaled by game speed; paused passes 0. grid.traffic is read only.
    // hour is the town clock (state.routineHour). The cars on screen are the residents whose drive window is open now.
    update(dt, next, pop, live, hour, day = 0, view = camera.view) {
      if (next !== roads) { roads = next; tours = busTours(next); }
      const tr = grid.traffic || null;
      if (tr && roads) {
        // Who is out driving: worked out from the schedule when the clock or the headcount has moved, never saved.
        const people = pop >= 0 && hour >= 0 ? Math.floor(pop) : -1;
        if (people >= 0 && (people !== seen.n || day !== seen.day || Math.abs(hour - seen.hour) > RECOUNT_H || hour < seen.hour)) {
          seen.n = people; seen.day = day; seen.hour = hour; seen.count = drivingNow(people, hour, persons, day);
        }
        const resident = people >= 0;
        fleet.step(dt, {
          roads, net: tr.net, fields: tr.fields, anchors: tr.anchors, total: tr.total, version: grid.loadRev, tours,
          carWant: resident ? Math.min(Math.round(seen.count * crowd), CAR_MAX) : Math.min(300 * crowd, Math.round(tr.vehicles * 0.35)),
          persons: resident ? persons : undefined, personN: resident ? seen.count : 0,
          arrivals: live ? live.perS : 0, busWant: Math.min(BUS_MAX, tours.length),
        });
      }
      draw(view);
    },
    count: () => fleet.carCount() + fleet.busCount(),
    // Graphics settings: how many cars, and whether the ink edges are drawn. Nothing here touches the fleet's logic.
    setQuality(rs) {
      crowd = rs.crowd;
      edges.lines.visible = rs.edges;
    },
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
