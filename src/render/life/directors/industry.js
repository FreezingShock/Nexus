// Workshops and warehouses: shift workers at the door, a forklift shuttling crates along the yard, and a delivery van that
// pulls up at the kerb, waits, and drives off. Hours are in life/rules.js; smoke from the stacks is in life-smoke.
// Only buildings near the camera are worked on.
import * as THREE from '../../../../vendor/three/three.module.min.js';
import { forkliftGeometry, vanGeometry } from '../figures.js';
import { ZERO } from '../pools.js';
import { doorRoute } from '../routes.js';
import { flowKind, forkliftWorking, kindOf, vanInterval, visitRate } from '../rules.js';
import { groundY } from '../../road-mesh.js';
import { unit } from '../../../sim/schedule.js';

export const MAX_YARDS = 300;
const UP = new THREE.Vector3(0, 1, 0);
const VANS = [0xE6BC62, 0xBFD8C4, 0xD98C7A, 0x8DBEDD, 0xFAF3E4];
const LIFTS = [0xE6BC62, 0xD98C7A];
const HI_VIS = 0xE6BC62;

export function createIndustry(pools) {
  const lift = pools.make('forklift', forkliftGeometry(), MAX_YARDS), van = pools.make('van', vanGeometry(), MAX_YARDS);
  const m4 = new THREE.Matrix4(), p3 = new THREE.Vector3(), qa = new THREE.Quaternion(), s3 = new THREE.Vector3(), col = new THREE.Color();
  const G = { x: 0, z: 0, rot: 0, half: 0, front: 0 };
  const Y = {
    n: 0, x: new Float32Array(MAX_YARDS), z: new Float32Array(MAX_YARDS), y: new Float32Array(MAX_YARDS), rot: new Float32Array(MAX_YARDS),
    seed: new Int32Array(MAX_YARDS), half: new Float32Array(MAX_YARDS), front: new Float32Array(MAX_YARDS), doors: [],
    nextAt: new Float32Array(MAX_YARDS), hasLift: new Uint8Array(MAX_YARDS), hasVan: new Uint8Array(MAX_YARDS),
    // forklift: position along the front (local x), direction, pause left
    fx: new Float32Array(MAX_YARDS), fdir: new Float32Array(MAX_YARDS), fpause: new Float32Array(MAX_YARDS), fshow: new Float32Array(MAX_YARDS),
    // van: 0 away, 1 arriving, 2 parked, 3 leaving; local x, direction of travel, timer to the next visit
    vstate: new Uint8Array(MAX_YARDS), vx: new Float32Array(MAX_YARDS), vdir: new Float32Array(MAX_YARDS), vwait: new Float32Array(MAX_YARDS), vstop: new Float32Array(MAX_YARDS), vnext: new Float32Array(MAX_YARDS),
  };

  function place(mesh, k, y, lx, lz, yaw, scale) {
    const c = Math.cos(Y.rot[y]), s = Math.sin(Y.rot[y]), wx = Y.x[y] + lx * c + lz * s, wz = Y.z[y] - lx * s + lz * c;
    qa.setFromAxisAngle(UP, Y.rot[y] + yaw);
    mesh.setMatrixAt(k, m4.compose(p3.set(wx, groundY(wx, wz) + 0.03, wz), qa, s3.set(scale, scale, scale)));
  }

  return {
    build(entries) {
      Y.n = 0; Y.doors.length = 0;
      for (const e of entries) {
        if (kindOf(e.b) !== 'work' || Y.n >= MAX_YARDS) continue;
        const sites = e.parts.sites, body = sites && sites.bodies[0];
        if (!body || !sites.doors.length) continue;
        const y = Y.n++, b = e.b, seed = b.seed | 0;
        Y.x[y] = b.x; Y.y[y] = b.y; Y.z[y] = b.z; Y.rot[y] = b.rotY; Y.seed[y] = seed; Y.half[y] = body.w / 2; Y.front[y] = body.z + body.d / 2;
        Y.doors.push(sites.doors);
        Y.nextAt[y] = 1 + 10 * unit(seed, 150);
        Y.hasLift[y] = unit(seed, 151) < 0.7 && body.w > 2 ? 1 : 0; Y.hasVan[y] = unit(seed, 152) < 0.8 ? 1 : 0;
        Y.fx[y] = -Y.half[y] + 0.7; Y.fdir[y] = 1; Y.fpause[y] = 2 * unit(seed, 153); Y.fshow[y] = 0;
        Y.vstate[y] = 0; Y.vnext[y] = 10 + 40 * unit(seed, 154);
        lift.setColorAt(y, col.setHex(LIFTS[Math.floor(unit(seed, 155) * LIFTS.length)])); lift.setMatrixAt(y, ZERO);
        van.setColorAt(y, col.setHex(VANS[Math.floor(unit(seed, 156) * VANS.length)])); van.setMatrixAt(y, ZERO);
      }
      lift.count = van.count = Y.n; lift.visible = van.visible = Y.n > 0;
      lift.instanceMatrix.needsUpdate = van.instanceMatrix.needsUpdate = true; lift.instanceColor.needsUpdate = van.instanceColor.needsUpdate = true;
    },

    frame(c) {
      const { dt, hour, fill, effects } = c;
      const crowdK = (0.35 + 1.1 * fill) * c.crowd * (effects < 1 ? 0.5 : 1);
      let dirty = false;
      for (let y = 0; y < Y.n; y++) {
        if (!c.near(Y.x[y], Y.z[y])) continue;
        const half = Y.half[y], front = Y.front[y];

        // workers at the door
        const rate = effects > 0 ? visitRate('work', hour) * crowdK : 0;
        if (rate > 0) {
          Y.nextAt[y] -= dt;
          if (Y.nextAt[y] <= 0) {
            G.x = Y.x[y]; G.z = Y.z[y]; G.rot = Y.rot[y]; G.half = half; G.front = front;
            const doors = Y.doors[y], door = doors[Math.floor(Math.random() * doors.length)];
            const r = doorRoute(G, door, flowKind('work', Math.random(), hour), Math.random);
            pools.folk.spawn({ ...r, doorY: Y.y[y] + 0.25, color: HI_VIS });
            Y.nextAt[y] = -Math.log(1 - Math.random()) / rate;
          }
        }

        // the forklift shuttles along the yard in front, pausing at each end, and rolls out of sight when the day is done
        if (Y.hasLift[y]) {
          const want = effects >= 1 && forkliftWorking(hour) ? 1 : 0;
          Y.fshow[y] += (want - Y.fshow[y]) * Math.min(1, dt * 2); if (Math.abs(Y.fshow[y] - want) < 0.02) Y.fshow[y] = want;
          const u = Y.fshow[y];
          if (u > 0) {
            const a = -half + 0.7, b = half - 0.7;
            if (Y.fpause[y] > 0) Y.fpause[y] -= dt;
            else {
              Y.fx[y] += Y.fdir[y] * 0.55 * dt;
              if (Y.fx[y] >= b) { Y.fx[y] = b; Y.fdir[y] = -1; Y.fpause[y] = 3 + 3 * Math.random(); }
              else if (Y.fx[y] <= a) { Y.fx[y] = a; Y.fdir[y] = 1; Y.fpause[y] = 3 + 3 * Math.random(); }
            }
            place(lift, y, y, Y.fx[y], front + 0.8, Y.fdir[y] > 0 ? 0 : Math.PI, u);
            dirty = true;
          } else if (Y.fshow[y] === 0) { lift.setMatrixAt(y, ZERO); dirty = true; }
        }

        // the delivery van
        if (Y.hasVan[y] && effects >= 1) {
          const st = Y.vstate[y];
          if (st === 0) {
            Y.vnext[y] -= dt;
            if (Y.vnext[y] <= 0) {
              const gap = vanInterval(hour, fill);
              if (gap === Infinity) Y.vnext[y] = 30;
              else {
                const doors = Y.doors[y], door = doors[Math.floor(Math.random() * doors.length)];
                Y.vdir[y] = Math.random() < 0.5 ? 1 : -1; Y.vstop[y] = Math.max(-half, Math.min(half, door[0]));
                Y.vx[y] = Y.vstop[y] - Y.vdir[y] * (half + 3.5); Y.vstate[y] = 1; Y.vnext[y] = gap * (0.6 + 0.8 * Math.random());
              }
            }
          } else if (st === 1) {
            Y.vx[y] += Y.vdir[y] * 1.6 * dt;
            if ((Y.vstop[y] - Y.vx[y]) * Y.vdir[y] <= 0) { Y.vx[y] = Y.vstop[y]; Y.vstate[y] = 2; Y.vwait[y] = 12 + 10 * Math.random(); }
          } else if (st === 2) {
            Y.vwait[y] -= dt;
            if (Y.vwait[y] <= 0) Y.vstate[y] = 3;
          } else {
            Y.vx[y] += Y.vdir[y] * 1.6 * dt;
            if ((Y.vx[y] - Y.vstop[y]) * Y.vdir[y] > half + 3.5) { Y.vstate[y] = 0; van.setMatrixAt(y, ZERO); dirty = true; }
          }
          if (Y.vstate[y]) {
            place(van, y, y, Y.vx[y], front + 1.15, Y.vdir[y] > 0 ? 0 : Math.PI, 1);
            dirty = true;
          }
        }
      }
      if (dirty) { lift.instanceMatrix.needsUpdate = true; van.instanceMatrix.needsUpdate = true; }
      lift.visible = effects >= 1 && Y.n > 0; van.visible = effects >= 1 && Y.n > 0;
    },
  };
}
