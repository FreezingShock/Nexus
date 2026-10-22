// Shops, cafes and offices: awning valances that flutter, a blade sign that swings, customers and office workers going
// in and out of the door, and cafe-goers sitting at the terrace tables. Opening hours and busy times are in life/rules.js;
// the lit shop fronts are in the window system. Only buildings near the camera are worked on.
import * as THREE from '../../../../vendor/three/three.module.min.js';
import { bladeGeometry } from '../figures.js';
import { ZERO } from '../pools.js';
import { doorRoute, seatRoute } from '../routes.js';
import { cafeRate, flowKind, kindOf, visitRate } from '../rules.js';
import { unit } from '../../../sim/schedule.js';
import { COATS } from './homes.js';

export const MAX_SHOPS = 400, MAX_SIGNS = 400;
const UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0), BACK = new THREE.Vector3(0, 0, 1);
const VALANCE_H = 0.45; // cloth scale: 0.3 tall cloth becomes a 0.13 valance

export function createCommercial(pools) {
  const signMesh = pools.make('sign', bladeGeometry(), MAX_SIGNS, { cast: false });
  const m4 = new THREE.Matrix4(), p3 = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), s3 = new THREE.Vector3(), col = new THREE.Color();
  const G = { x: 0, z: 0, rot: 0, half: 0, front: 0 };
  const S = {
    n: 0, x: new Float32Array(MAX_SHOPS), z: new Float32Array(MAX_SHOPS), y: new Float32Array(MAX_SHOPS), rot: new Float32Array(MAX_SHOPS),
    seed: new Int32Array(MAX_SHOPS), kind: new Uint8Array(MAX_SHOPS), half: new Float32Array(MAX_SHOPS), front: new Float32Array(MAX_SHOPS),
    nextAt: new Float32Array(MAX_SHOPS), nextSeat: new Float32Array(MAX_SHOPS), doors: [], seats: [], seatFree: [],
    flap0: new Int32Array(MAX_SHOPS), flapN: new Int16Array(MAX_SHOPS), sign: new Int16Array(MAX_SHOPS).fill(-1),
    sx: new Float32Array(MAX_SHOPS), sy: new Float32Array(MAX_SHOPS), sz: new Float32Array(MAX_SHOPS),
  };
  const fl = { lx: new Float32Array(pools.cloth.max), ly: new Float32Array(pools.cloth.max), lz: new Float32Array(pools.cloth.max), sx: new Float32Array(pools.cloth.max), ph: new Float32Array(pools.cloth.max) };
  let signCount = 0;

  return {
    build(entries) {
      S.n = 0; signCount = 0; S.doors.length = 0; S.seats.length = 0; S.seatFree.length = 0;
      for (const e of entries) {
        const kind = kindOf(e.b);
        if ((kind !== 'shop' && kind !== 'office') || S.n >= MAX_SHOPS) continue;
        const sites = e.parts.sites, body = sites && sites.bodies[0];
        if (!body || !sites.doors.length) continue;
        const s = S.n++, b = e.b, seed = b.seed | 0;
        S.x[s] = b.x; S.y[s] = b.y; S.z[s] = b.z; S.rot[s] = b.rotY; S.seed[s] = seed; S.kind[s] = kind === 'shop' ? 0 : 1;
        S.half[s] = body.w / 2; S.front[s] = body.z + body.d / 2;
        S.nextAt[s] = 1 + 12 * unit(seed, 130); S.nextSeat[s] = 3 + 20 * unit(seed, 131);
        S.doors.push(sites.doors);
        S.seats.push(sites.tables.flatMap(([tx, tz]) => [[tx - 0.38, tz], [tx + 0.38, tz]]));
        S.seatFree.push(new Float32Array(S.seats[s].length));
        S.flapN[s] = 0; S.flap0[s] = 0; S.sign[s] = -1;
        let first = true;
        for (const a of sites.awnings) {
          const n = Math.max(2, Math.round(a.w / 0.42)), k0 = pools.cloth.alloc(n);
          if (k0 < 0) continue;
          for (let i = 0; i < n; i++) {
            const k = k0 + i, wf = a.w / n;
            fl.lx[k] = a.x - a.w / 2 + (i + 0.5) * wf; fl.ly[k] = a.y; fl.lz[k] = a.z; fl.sx[k] = (wf / 0.2) * 1.04; fl.ph[k] = 6.28 * unit(seed, 140 + i) + i * 0.6;
            pools.cloth.color(k, a.color);
          }
          // one record per awning: flaps of a shop are contiguous per awning; only the first awning's range is kept for swaying
          if (first) { S.flap0[s] = k0; S.flapN[s] = n; }
          else if (k0 === S.flap0[s] + S.flapN[s]) S.flapN[s] += n;
          if (first && signCount < MAX_SIGNS && kind === 'shop') {
            const k = signCount++;
            S.sign[s] = k; S.sx[s] = a.x + a.w / 2 - 0.12; S.sy[s] = a.y + 0.72; S.sz[s] = a.z - 0.78 + 0.04;
            signMesh.setColorAt(k, col.setHex(a.color)); signMesh.setMatrixAt(k, ZERO);
          }
          first = false;
        }
      }
      signMesh.count = signCount; signMesh.visible = signCount > 0;
      signMesh.instanceMatrix.needsUpdate = true; signMesh.instanceColor.needsUpdate = true;
    },

    frame(c) {
      const { dt, hour, fill, effects } = c;
      const wind = c.wk === 'leaves' ? 0.45 : c.wk === 'rain' ? 0.12 : 0.07;
      const crowdK = (0.35 + 1.1 * fill) * c.crowd * (effects < 1 ? 0.5 : 1);
      let clothDirty = false, signDirty = false;
      for (let s = 0; s < S.n; s++) {
        if (!c.near(S.x[s], S.z[s])) continue;
        const cs = Math.cos(S.rot[s]), sn = Math.sin(S.rot[s]);

        if (effects > 0 && S.flapN[s]) {
          for (let n = 0; n < S.flapN[s]; n++) {
            const k = S.flap0[s] + n;
            qa.setFromAxisAngle(UP, S.rot[s]);
            qa.multiply(qb.setFromAxisAngle(RIGHT, (Math.sin(c.t * 2.6 + fl.ph[k]) * 0.6 + Math.sin(c.t * 4.1 + fl.ph[k] * 1.7) * 0.25) * (0.06 + wind)));
            p3.set(S.x[s] + fl.lx[k] * cs + fl.lz[k] * sn, S.y[s] + fl.ly[k], S.z[s] - fl.lx[k] * sn + fl.lz[k] * cs);
            pools.cloth.mesh.setMatrixAt(k, m4.compose(p3, qa, s3.set(fl.sx[k], VALANCE_H, 1)));
          }
          clothDirty = true;
        }
        const g = S.sign[s];
        if (effects > 0 && g >= 0) {
          qa.setFromAxisAngle(UP, S.rot[s]);
          qa.multiply(qb.setFromAxisAngle(BACK, Math.sin(c.t * 1.7 + S.seed[s]) * (0.07 + wind * 0.8)));
          p3.set(S.x[s] + S.sx[s] * cs + S.sz[s] * sn, S.y[s] + S.sy[s], S.z[s] - S.sx[s] * sn + S.sz[s] * cs);
          signMesh.setMatrixAt(g, m4.compose(p3, qa, s3.set(1, 1, 1)));
          signDirty = true;
        }

        // visitors
        if (effects <= 0) continue;
        G.x = S.x[s]; G.z = S.z[s]; G.rot = S.rot[s]; G.half = S.half[s]; G.front = S.front[s];
        const kindName = S.kind[s] ? 'office' : 'shop', rate = visitRate(kindName, hour) * crowdK;
        if (rate > 0) {
          S.nextAt[s] -= dt;
          if (S.nextAt[s] <= 0) {
            const doors = S.doors[s], door = doors[Math.floor(Math.random() * doors.length)];
            const r = doorRoute(G, door, flowKind(kindName, Math.random(), hour), Math.random);
            pools.folk.spawn({ ...r, doorY: S.y[s] + 0.25, color: COATS[Math.floor(Math.random() * COATS.length)] });
            S.nextAt[s] = -Math.log(1 - Math.random()) / rate;
          }
        }
        const seats = S.seats[s];
        if (seats.length) {
          const sr = cafeRate(hour) * crowdK;
          if (sr > 0) {
            S.nextSeat[s] -= dt;
            if (S.nextSeat[s] <= 0) {
              const free = S.seatFree[s], i = Math.floor(Math.random() * seats.length);
              if (free[i] <= c.t) {
                const r = seatRoute(G, seats[i], Math.random);
                if (pools.folk.spawn({ ...r, sit: true, doorY: S.y[s], color: COATS[Math.floor(Math.random() * COATS.length)] })) free[i] = c.t + r.stand + 8;
              }
              S.nextSeat[s] = -Math.log(1 - Math.random()) / sr;
            }
          }
        }
      }
      if (clothDirty) pools.cloth.mesh.instanceMatrix.needsUpdate = true;
      if (signDirty) signMesh.instanceMatrix.needsUpdate = true;
      signMesh.visible = effects > 0 && signCount > 0;
    },
  };
}
