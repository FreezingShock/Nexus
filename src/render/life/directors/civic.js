// Schools, clinics and police, fire stations, playgrounds and parks: school children at the bell and at break, visitors at
// the clinic door, children on the swings, strollers crossing the greens and plazas, a fire engine called out and back.
// Hours are in life/rules.js. Only places near the camera are worked on.
import * as THREE from '../../../../vendor/three/three.module.min.js';
import { engineGeometry, personGeometry, swingGeometry } from '../figures.js';
import { ZERO } from '../pools.js';
import { doorRoute, faceOf, toWorld } from '../routes.js';
import { engineInterval, kindOf, parkRate, schoolKind, schoolRate, serviceRate, swingBusy } from '../rules.js';
import { groundY } from '../../road-mesh.js';
import { unit } from '../../../sim/schedule.js';
import { COATS } from './homes.js';

export const MAX_PLACES = 500, MAX_SWINGS = 240, MAX_ENGINES = 60;
const UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0);
const KID_COATS = [0xD98C7A, 0xEBD9A0, 0x8DBEDD, 0xBFD8C4, 0xCBC3DC, 0xC8694F];
const ENGINES = [0xB8574A, 0xC8694F];
const ARM = 0.6; // swing rope length

export function createCivic(pools) {
  const swing = pools.make('swing', swingGeometry(), MAX_SWINGS, { cast: false });
  const kid = pools.make('swingkid', personGeometry(), MAX_SWINGS);
  const engine = pools.make('engine', engineGeometry(), MAX_ENGINES);
  const m4 = new THREE.Matrix4(), p3 = new THREE.Vector3(), v3 = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), s3 = new THREE.Vector3(), col = new THREE.Color();
  const G = { x: 0, z: 0, rot: 0, half: 0, front: 0 };
  const B = { x: 0, z: 0, rot: 0 };
  // places: kind 0 school, 1 service, 2 park, 3 fire station, 4 playground (also a park)
  const Pl = {
    n: 0, kind: new Uint8Array(MAX_PLACES), x: new Float32Array(MAX_PLACES), z: new Float32Array(MAX_PLACES), y: new Float32Array(MAX_PLACES), rot: new Float32Array(MAX_PLACES),
    half: new Float32Array(MAX_PLACES), front: new Float32Array(MAX_PLACES), w: new Float32Array(MAX_PLACES), d: new Float32Array(MAX_PLACES),
    seed: new Int32Array(MAX_PLACES), nextAt: new Float32Array(MAX_PLACES), doors: [],
    // engine: state 0 in, 1 out, 2 away, 3 back; progress along the route in units; timer; direction; slot
    es: new Uint8Array(MAX_PLACES), ep: new Float32Array(MAX_PLACES), et: new Float32Array(MAX_PLACES), edir: new Float32Array(MAX_PLACES), eslot: new Int16Array(MAX_PLACES).fill(-1),
    // swings: first slot and count
    sw0: new Int16Array(MAX_PLACES), swN: new Int8Array(MAX_PLACES),
  };
  const W = { px: new Float32Array(MAX_SWINGS), py: new Float32Array(MAX_SWINGS), pz: new Float32Array(MAX_SWINGS), place: new Int16Array(MAX_SWINGS), idx: new Int16Array(MAX_SWINGS), amp: new Float32Array(MAX_SWINGS), kid: new Float32Array(MAX_SWINGS), lz: new Float32Array(MAX_SWINGS), lx: new Float32Array(MAX_SWINGS) };
  let swingCount = 0, engineCount = 0;

  // Where an engine is at distance s along its way: out of the door, to the kerb, then along the street and off the lot.
  // Fills out = { x, z, yaw, len } in the building's own frame (yaw turns a +x-facing model to its heading).
  function engineAt(i, s, out) {
    const door = Pl.doors[i][0], front = Pl.front[i], lane = front + 1.15, reach = Pl.half[i] + 4, dir = Pl.edir[i];
    const leg1 = lane - (front + 0.1), x0 = door[0];
    if (s <= leg1) { out.x = x0; out.z = front + 0.1 + s; out.yaw = -Math.PI / 2; }
    else { out.x = x0 + dir * (s - leg1); out.z = lane; out.yaw = dir > 0 ? 0 : Math.PI; }
    out.len = leg1 + Math.abs(dir * reach - x0);
    return out;
  }
  const E = { x: 0, z: 0, yaw: 0, len: 0 };

  return {
    build(entries) {
      Pl.n = 0; Pl.doors.length = 0; swingCount = 0; engineCount = 0;
      for (const e of entries) {
        const b = e.b, cat = b.cat, kind = kindOf(b);
        const k = kind === 'school' ? 0 : kind === 'service' ? (b.model === 'fire-station' ? 3 : 1) : cat === 'park' ? (b.model === 'playground' ? 4 : 2) : -1;
        if (k < 0 || Pl.n >= MAX_PLACES) continue;
        const sites = e.parts.sites, body = sites && sites.bodies[0];
        if (k <= 1 || k === 3) { if (!body || !sites.doors.length) continue; }
        const i = Pl.n++, seed = b.seed | 0;
        Pl.kind[i] = k; Pl.x[i] = b.x; Pl.y[i] = b.y; Pl.z[i] = b.z; Pl.rot[i] = b.rotY; Pl.seed[i] = seed;
        Pl.half[i] = body ? body.w / 2 : b.w / 2; Pl.front[i] = body ? body.z + body.d / 2 : b.d / 2; Pl.w[i] = b.w; Pl.d[i] = b.d;
        Pl.nextAt[i] = 2 + 20 * unit(seed, 180);
        Pl.doors.push(sites.doors);
        Pl.es[i] = 0; Pl.et[i] = 20 + 100 * unit(seed, 181); Pl.eslot[i] = -1; Pl.swN[i] = 0; Pl.sw0[i] = swingCount;
        if (k === 3 && engineCount < MAX_ENGINES) { Pl.eslot[i] = engineCount; engine.setColorAt(engineCount, col.setHex(ENGINES[Math.floor(unit(seed, 182) * ENGINES.length)])); engine.setMatrixAt(engineCount, ZERO); engineCount++; }
        if (k === 4) {
          const c = Math.cos(b.rotY), s = Math.sin(b.rotY);
          for (const sw of sites.swings) {
            if (swingCount >= MAX_SWINGS) break;
            const j = swingCount++;
            W.px[j] = b.x + sw.x * c + sw.z * s; W.pz[j] = b.z - sw.x * s + sw.z * c; W.py[j] = b.y + sw.top; W.place[j] = i; W.idx[j] = Pl.swN[i]++; W.amp[j] = 0.05; W.kid[j] = 0;
            kid.setColorAt(j, col.setHex(KID_COATS[Math.floor(unit(seed, 183 + j) * KID_COATS.length)]));
            swing.setMatrixAt(j, ZERO); kid.setMatrixAt(j, ZERO);
          }
        }
      }
      swing.count = kid.count = swingCount; engine.count = engineCount;
      swing.visible = kid.visible = swingCount > 0; engine.visible = engineCount > 0;
      swing.instanceMatrix.needsUpdate = kid.instanceMatrix.needsUpdate = engine.instanceMatrix.needsUpdate = true;
      kid.instanceColor.needsUpdate = engine.instanceColor.needsUpdate = true;
    },

    frame(c) {
      const { dt, hour, fill, effects } = c;
      const crowdK = (0.35 + 1.1 * fill) * c.crowd * (effects < 1 ? 0.5 : 1);
      const dry = c.rain <= 0.3 && c.wk !== 'rain' && c.wk !== 'snow';
      let swDirty = false, enDirty = false;
      for (let i = 0; i < Pl.n; i++) {
        if (!c.near(Pl.x[i], Pl.z[i])) continue;
        const k = Pl.kind[i];
        B.x = Pl.x[i]; B.z = Pl.z[i]; B.rot = Pl.rot[i];
        G.x = Pl.x[i]; G.z = Pl.z[i]; G.rot = Pl.rot[i]; G.half = Pl.half[i]; G.front = Pl.front[i];

        if (effects > 0 && (k === 0 || k === 1)) {
          const rate = (k === 0 ? schoolRate(hour) : serviceRate(hour)) * crowdK;
          if (rate > 0) {
            Pl.nextAt[i] -= dt;
            if (Pl.nextAt[i] <= 0) {
              const doors = Pl.doors[i], door = doors[Math.floor(Math.random() * doors.length)];
              const n = k === 0 ? 2 + Math.floor(Math.random() * 3) : 1;
              for (let q = 0; q < n; q++) {
                const kindName = k === 0 ? schoolKind(hour) : Math.random() < 0.5 ? 'arrive' : 'leave';
                const r = doorRoute(G, door, kindName, Math.random);
                pools.folk.spawn({ ...r, doorY: Pl.y[i] + 0.25, size: k === 0 ? 0.68 + Math.random() * 0.1 : undefined, speed: k === 0 ? 1.3 + Math.random() * 0.4 : undefined, color: k === 0 ? KID_COATS[Math.floor(Math.random() * KID_COATS.length)] : COATS[Math.floor(Math.random() * COATS.length)] });
              }
              Pl.nextAt[i] = -Math.log(1 - Math.random()) / rate;
            }
          }
        }

        if (effects > 0 && (k === 2 || k === 4) && dry) {
          const rate = parkRate(hour) * crowdK;
          if (rate > 0) {
            Pl.nextAt[i] -= dt;
            if (Pl.nextAt[i] <= 0) {
              const hw = Pl.w[i] / 2 - 0.35, hd = Pl.d[i] / 2 - 0.35, side = Math.random() < 0.5 ? -1 : 1;
              const pts = [[side * hw, (Math.random() * 2 - 1) * hd], [(Math.random() * 2 - 1) * hw * 0.6, (Math.random() * 2 - 1) * hd * 0.6], [-side * hw, (Math.random() * 2 - 1) * hd]].map(([lx, lz]) => ({ ...toWorld(B, lx, lz), door: false }));
              pools.folk.spawn({ pts, doorY: Pl.y[i], stand: 5 + Math.random() * 12, fadeIn: 0.7, fadeOut: 0.7, face: Pl.rot[i], color: COATS[Math.floor(Math.random() * COATS.length)] });
              Pl.nextAt[i] = -Math.log(1 - Math.random()) / rate;
            }
          }
        }

        if (k === 4) {
          for (let n = 0; n < Pl.swN[i]; n++) {
            const j = Pl.sw0[i] + n;
            const busy = effects >= 1 && swingBusy(Pl.seed[i], n, hour, c.t, c.wk, fill) ? 1 : 0;
            W.amp[j] += ((busy ? 0.75 : 0.04) - W.amp[j]) * Math.min(1, dt * 0.8);
            W.kid[j] += (busy - W.kid[j]) * Math.min(1, dt * 2); if (Math.abs(W.kid[j] - busy) < 0.02) W.kid[j] = busy;
            const ang = Math.sin(c.t * 3.1 + j) * W.amp[j];
            qa.setFromAxisAngle(UP, Pl.rot[i]);
            qa.multiply(qb.setFromAxisAngle(RIGHT, ang));
            swing.setMatrixAt(j, m4.compose(p3.set(W.px[j], W.py[j], W.pz[j]), qa, s3.set(1, 1, 1)));
            if (W.kid[j] > 0) {
              v3.set(0, -ARM, 0).applyQuaternion(qa); // the seat
              const u = W.kid[j] * 0.62;
              qb.setFromAxisAngle(UP, faceOf(B));
              kid.setMatrixAt(j, m4.compose(p3.set(W.px[j] + v3.x, W.py[j] + v3.y + 0.04, W.pz[j] + v3.z), qb, s3.set(u, u * 0.86, u)));
            } else kid.setMatrixAt(j, ZERO);
            swDirty = true;
          }
        }

        if (k === 3 && Pl.eslot[i] >= 0 && effects >= 1) {
          const slot = Pl.eslot[i];
          if (Pl.es[i] === 0) {
            Pl.et[i] -= dt;
            if (Pl.et[i] <= 0) { Pl.es[i] = 1; Pl.ep[i] = 0; Pl.edir[i] = Math.random() < 0.5 ? 1 : -1; }
          } else if (Pl.es[i] === 2) {
            Pl.et[i] -= dt;
            if (Pl.et[i] <= 0) { Pl.es[i] = 3; engineAt(i, 0, E); Pl.ep[i] = E.len; }
          }
          if (Pl.es[i] === 1 || Pl.es[i] === 3) {
            const out = Pl.es[i] === 1;
            Pl.ep[i] += (out ? 1 : -1) * 1.5 * dt;
            engineAt(i, 0, E); const len = E.len;
            if (out && Pl.ep[i] >= len) { Pl.es[i] = 2; Pl.et[i] = 20 + 25 * Math.random(); engine.setMatrixAt(slot, ZERO); enDirty = true; }
            else if (!out && Pl.ep[i] <= 0) { Pl.es[i] = 0; Pl.et[i] = engineInterval(hour) * (0.6 + 0.8 * Math.random()); engine.setMatrixAt(slot, ZERO); enDirty = true; }
            else {
              engineAt(i, Pl.ep[i], E);
              const u = Math.max(0, Math.min(1, (len - Pl.ep[i]) / 1.2, Pl.ep[i] / 0.4)); // grows out of the doorway, shrinks away at the far end
              const yaw = Pl.rot[i] + E.yaw + (out ? 0 : Math.PI); // coming home it faces back into the station
              const cs = Math.cos(Pl.rot[i]), sn = Math.sin(Pl.rot[i]), wx = Pl.x[i] + E.x * cs + E.z * sn, wz = Pl.z[i] - E.x * sn + E.z * cs;
              qa.setFromAxisAngle(UP, yaw);
              engine.setMatrixAt(slot, m4.compose(p3.set(wx, groundY(wx, wz) + 0.03, wz), qa, s3.set(u, u, u))); enDirty = true;
            }
          }
        }
      }
      if (swDirty) { swing.instanceMatrix.needsUpdate = true; kid.instanceMatrix.needsUpdate = true; }
      if (enDirty) engine.instanceMatrix.needsUpdate = true;
      swing.visible = effects >= 1 && swingCount > 0; kid.visible = effects >= 1 && swingCount > 0; engine.visible = effects >= 1 && engineCount > 0;
    },
  };
}
