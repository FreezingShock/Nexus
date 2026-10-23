// Homes: residents who step out, leave or come home, washing on dry days, a cat on the roof. Only lived-in homes
// (population fill) take part, and only those near the camera are worked on. Habits are in life/rules.js.
import * as THREE from '../../../../vendor/three/three.module.min.js';
import { catGeometry } from '../figures.js';
import { ZERO } from '../pools.js';
import { doorRoute } from '../routes.js';
import { catOut, hasCat, hasWashingLine, dayBusy, homeOccupied, kindOf, outingKind, outingRate, washDay } from '../rules.js';
import { unit } from '../../../sim/schedule.js';
import { LANG } from '../../../world/models.js';

const { FLOOR_H: FH, BAY } = LANG;
export const MAX_HOMES = 700, MAX_CATS = 140;
export const COATS = [0xD98C7A, 0xBFD8C4, 0x8DBEDD, 0xEBD9A0, 0x9DB37C, 0xFAF3E4, 0xCBC3DC, 0xC8694F, 0xA7856A];
const CLOTHS = [0xFAF3E4, 0xD98C7A, 0x8DBEDD, 0xEBD9A0, 0xBFD8C4, 0xCBC3DC];
const FURS = [0xE3A56A, 0x6E6A66, 0x2E2B2A, 0xF1ECE3, 0xB98A5E, 0x9A9690];
const UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0);

export function createHomes(pools) {
  const catMesh = pools.make('cat', catGeometry(), MAX_CATS);
  const m4 = new THREE.Matrix4(), p3 = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), s3 = new THREE.Vector3(), col = new THREE.Color();
  const G = { x: 0, z: 0, rot: 0, half: 0, front: 0 };
  const H = {
    n: 0, x: new Float32Array(MAX_HOMES), z: new Float32Array(MAX_HOMES), y: new Float32Array(MAX_HOMES),
    rot: new Float32Array(MAX_HOMES), seed: new Int32Array(MAX_HOMES), half: new Float32Array(MAX_HOMES), front: new Float32Array(MAX_HOMES),
    nextAt: new Float32Array(MAX_HOMES), doors: [],
    cloth0: new Int32Array(MAX_HOMES), clothN: new Int16Array(MAX_HOMES), wash: new Float32Array(MAX_HOMES), washWant: new Uint8Array(MAX_HOMES), washDrawn: new Uint8Array(MAX_HOMES),
    cat: new Int16Array(MAX_HOMES).fill(-1), cx: new Float32Array(MAX_HOMES), cy: new Float32Array(MAX_HOMES), cz: new Float32Array(MAX_HOMES),
    catShow: new Float32Array(MAX_HOMES), catDrawn: new Uint8Array(MAX_HOMES),
  };
  const cl = { lx: new Float32Array(pools.cloth.max), ly: new Float32Array(pools.cloth.max), lz: new Float32Array(pools.cloth.max), sx: new Float32Array(pools.cloth.max), ph: new Float32Array(pools.cloth.max) };
  let catCount = 0, lastStep = -99, lastDay = -1;

  return {
    build(entries) {
      H.n = 0; H.doors.length = 0; catCount = 0;
      for (const e of entries) {
        if (kindOf(e.b) !== 'home' || H.n >= MAX_HOMES) continue;
        const sites = e.parts.sites, body = sites && sites.bodies[0];
        if (!body || !sites.doors.length) continue;
        const h = H.n++, b = e.b, seed = b.seed | 0;
        H.x[h] = b.x; H.y[h] = b.y; H.z[h] = b.z; H.rot[h] = b.rotY; H.seed[h] = seed;
        H.half[h] = body.w / 2; H.front[h] = body.z + body.d / 2;
        H.nextAt[h] = 1 + 20 * unit(seed, 80);
        H.doors.push(sites.doors);
        H.wash[h] = 0; H.washWant[h] = 0; H.washDrawn[h] = 0; H.catShow[h] = 0; H.catDrawn[h] = 0; H.cat[h] = -1; H.clothN[h] = 0; H.cloth0[h] = 0;
        if (hasWashingLine(seed) && body.floors >= 2) {
          const n = 3 + Math.floor(unit(seed, 81) * 3), first = pools.cloth.alloc(n);
          if (first >= 0) {
            const nx = Math.max(1, Math.round(body.w / BAY)), bay = body.w / nx;
            const mid = body.x + (nx > 1 ? -body.w / 2 + bay : 0);
            const floor = Math.min(body.floors - 1, 1 + Math.floor(unit(seed, 82) * Math.max(1, body.floors - 1) * 0.999));
            for (let i = 0; i < n; i++) {
              const k = first + i;
              cl.lx[k] = mid + (i - (n - 1) / 2) * 0.42; cl.ly[k] = body.y0 + floor * FH + 0.92; cl.lz[k] = H.front[h] + 0.1;
              cl.sx[k] = 0.8 + 0.5 * unit(seed, 83 + i); cl.ph[k] = 6.28 * unit(seed, 90 + i);
              pools.cloth.color(k, CLOTHS[Math.floor(unit(seed, 100 + i) * CLOTHS.length)]);
            }
            H.cloth0[h] = first; H.clothN[h] = n;
          }
        }
        if (hasCat(seed) && sites.perch && catCount < MAX_CATS) {
          const [px, py, pz] = sites.perch, k = catCount++, c = Math.cos(b.rotY), s = Math.sin(b.rotY);
          H.cat[h] = k;
          H.cx[h] = b.x + px * c + pz * s; H.cz[h] = b.z - px * s + pz * c; H.cy[h] = b.y + py;
          catMesh.setColorAt(k, col.setHex(FURS[Math.floor(unit(seed, 84) * FURS.length)]));
          catMesh.setMatrixAt(k, ZERO);
        }
      }
      catMesh.count = catCount; catMesh.visible = catCount > 0;
      catMesh.instanceMatrix.needsUpdate = true; catMesh.instanceColor.needsUpdate = true;
      lastStep = -99;
    },

    frame(c) {
      const { dt, hour, night, season, wk, fill, effects, day } = c;
      if (Math.abs(hour - lastStep) > 0.1 || hour < lastStep || day !== lastDay) {
        lastStep = hour; lastDay = day;
        for (let h = 0; h < H.n; h++) H.washWant[h] = effects >= 1 && H.clothN[h] && homeOccupied(H.seed[h], fill) && washDay(H.seed[h], day, hour, season, wk) ? 1 : 0;
      }
      const rate = effects > 0 && night < 0.6 && c.rain <= 0.3 ? outingRate(hour) * (0.35 + 1.1 * fill) * c.crowd * (effects < 1 ? 0.5 : 1) : 0;
      const wind = wk === 'leaves' ? 0.5 : 0.16;
      let clothDirty = false, catDirty = false;

      for (let h = 0; h < H.n; h++) {
        if (!c.near(H.x[h], H.z[h])) continue;

        if (rate > 0 && homeOccupied(H.seed[h], fill)) {
          H.nextAt[h] -= dt;
          if (H.nextAt[h] <= 0) {
            const doors = H.doors[h], door = doors[Math.floor(Math.random() * doors.length)];
            G.x = H.x[h]; G.z = H.z[h]; G.rot = H.rot[h]; G.half = H.half[h]; G.front = H.front[h];
            const r = doorRoute(G, door, outingKind(Math.random(), hour), Math.random);
            pools.folk.spawn({ ...r, doorY: H.y[h] + 0.25, color: COATS[Math.floor(Math.random() * COATS.length)] });
            H.nextAt[h] = -Math.log(1 - Math.random()) / (rate * dayBusy(H.seed[h], day));
          }
        }

        if (H.clothN[h]) {
          const want = H.washWant[h];
          if (H.wash[h] !== want) { H.wash[h] += (want - H.wash[h]) * Math.min(1, dt * 1.6); if (Math.abs(H.wash[h] - want) < 0.02) H.wash[h] = want; }
          const u = H.wash[h];
          if (u > 0 || H.washDrawn[h]) {
            const cs = Math.cos(H.rot[h]), sn = Math.sin(H.rot[h]);
            for (let n = 0; n < H.clothN[h]; n++) {
              const k = H.cloth0[h] + n;
              if (u <= 0) { pools.cloth.hide(k); continue; }
              qa.setFromAxisAngle(UP, H.rot[h]);
              qa.multiply(qb.setFromAxisAngle(RIGHT, Math.sin(c.t * 2.1 + cl.ph[k]) * wind * u));
              p3.set(H.x[h] + cl.lx[k] * cs + cl.lz[k] * sn, H.y[h] + cl.ly[k], H.z[h] - cl.lx[k] * sn + cl.lz[k] * cs);
              pools.cloth.mesh.setMatrixAt(k, m4.compose(p3, qa, s3.set(cl.sx[k], u, 1)));
            }
            H.washDrawn[h] = u > 0 ? 1 : 0; clothDirty = true;
          }
        }

        const k = H.cat[h];
        if (k >= 0) {
          const want = effects >= 1 && catOut(H.seed[h], hour, night, wk, season) ? 1 : 0;
          if (H.catShow[h] !== want) { H.catShow[h] += (want - H.catShow[h]) * Math.min(1, dt * 2); if (Math.abs(H.catShow[h] - want) < 0.02) H.catShow[h] = want; }
          const u = H.catShow[h];
          if (u > 0 || H.catDrawn[h]) {
            if (u <= 0) catMesh.setMatrixAt(k, ZERO);
            else {
              const ph = unit(H.seed[h], 85) * 6.28, stretch = Math.max(0, Math.sin(c.t * 0.23 + ph) - 0.93) * 12;
              qa.setFromAxisAngle(UP, H.rot[h] + (unit(H.seed[h], 86) < 0.5 ? 0 : Math.PI) + 0.4 * Math.sin(c.t * 0.17 + ph));
              const sz = 1.35 * u;
              s3.set(sz * (1 + 0.3 * stretch), sz * (1 + 0.025 * Math.sin(c.t * 1.9 + ph) - 0.15 * stretch), sz);
              catMesh.setMatrixAt(k, m4.compose(p3.set(H.cx[h], H.cy[h], H.cz[h]), qa, s3));
            }
            H.catDrawn[h] = u > 0 ? 1 : 0; catDirty = true;
          }
        }
      }
      if (clothDirty) pools.cloth.mesh.instanceMatrix.needsUpdate = true;
      if (catDirty) catMesh.instanceMatrix.needsUpdate = true;
      catMesh.visible = effects >= 1 && catCount > 0;
    },
  };
}
