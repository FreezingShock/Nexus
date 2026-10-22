// Life around homes, and only lived-in ones (population fill decides how many): residents who step out, leave for the day or
// come home along the front of the house; washing that appears on dry days; a cat that sits out on the roof in fair weather.
// Visual only. Three instanced meshes (people, washing, cats), pools with fixed sizes, no allocation per frame, and
// nothing is worked out for a home outside the camera's reach. Habits are in life/rules.js. Graphics: Off draws none,
// Light has half the people and no cats or washing, Full everything. Notes: docs/LIFE.md.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { allocInstanceColors } from '../geom.js';
import { catGeometry, clothGeometry, personGeometry, tintToon } from '../life/figures.js';
import { catOut, hasCat, hasWashingLine, homeOccupied, kindOf, outingKind, outingRate, washDay } from '../life/rules.js';
import { groundY } from '../road-mesh.js';
import { unit } from '../../sim/schedule.js';
import { LANG } from '../../world/models.js';

const { FLOOR_H: FH, BAY } = LANG;
export const MAX_HOMES = 700, MAX_FOLK = 96, MAX_CLOTH = 600, MAX_CATS = 140;
const COATS = [0xD98C7A, 0xBFD8C4, 0x8DBEDD, 0xEBD9A0, 0x9DB37C, 0xFAF3E4, 0xCBC3DC, 0xC8694F, 0xA7856A];
const CLOTHS = [0xFAF3E4, 0xD98C7A, 0x8DBEDD, 0xEBD9A0, 0xBFD8C4, 0xCBC3DC];
const FURS = [0xE3A56A, 0x6E6A66, 0x2E2B2A, 0xF1ECE3, 0xB98A5E, 0x9A9690];
const STOOP = 0.6;     // how far in front of the wall the residents stand and walk
const DOOR_FADE = 0.25, SIDE_FADE = 0.7; // distance over which a resident appears: through a door, or walking in from the side
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1);

export default {
  id: 'life-homes',
  create({ world, town, camera, sys }) {
    let effects = 1, crowd = 1;
    const mk = (geo, max) => {
      const m = new THREE.InstancedMesh(geo, tintToon(), max);
      m.frustumCulled = false; m.castShadow = true; m.receiveShadow = false; m.count = 0;
      allocInstanceColors(m);
      world.add(m);
      return m;
    };
    const folkMesh = mk(personGeometry(), MAX_FOLK), clothMesh = mk(clothGeometry(), MAX_CLOTH), catMesh = mk(catGeometry(), MAX_CATS);
    const m4 = new THREE.Matrix4(), p3 = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), s3 = new THREE.Vector3();
    const eul = new THREE.Euler(), col = new THREE.Color();
    const hide = (mesh, k) => { m4.makeScale(0, 0, 0); mesh.setMatrixAt(k, m4); };
    for (let a = 0; a < MAX_FOLK; a++) hide(folkMesh, a); // free slots draw nothing

    // ---- homes, worked out once per change of the town ----
    const H = {
      n: 0, x: new Float32Array(MAX_HOMES), z: new Float32Array(MAX_HOMES), y: new Float32Array(MAX_HOMES),
      rot: new Float32Array(MAX_HOMES), seed: new Int32Array(MAX_HOMES), half: new Float32Array(MAX_HOMES), front: new Float32Array(MAX_HOMES),
      nextAt: new Float32Array(MAX_HOMES), doors: [],
      // washing: first cloth and how many, how far it has unfurled (0..1), whether a line is out today, whether matrices are showing
      cloth0: new Int32Array(MAX_HOMES), clothN: new Int16Array(MAX_HOMES), wash: new Float32Array(MAX_HOMES), washWant: new Uint8Array(MAX_HOMES), washDrawn: new Uint8Array(MAX_HOMES),
      // cat: its slot (or -1), perch in world space, how far it is out (0..1), whether it is drawn
      cat: new Int16Array(MAX_HOMES).fill(-1), cx: new Float32Array(MAX_HOMES), cy: new Float32Array(MAX_HOMES), cz: new Float32Array(MAX_HOMES),
      catShow: new Float32Array(MAX_HOMES), catDrawn: new Uint8Array(MAX_HOMES),
    };
    const cl = { lx: new Float32Array(MAX_CLOTH), ly: new Float32Array(MAX_CLOTH), lz: new Float32Array(MAX_CLOTH), sx: new Float32Array(MAX_CLOTH), ph: new Float32Array(MAX_CLOTH) };
    let clothCount = 0, catCount = 0, seenRev = -1, lastStep = -99, day = 0, lastHour = 0;

    function build() {
      const lots = sys('lots');
      H.n = 0; H.doors.length = 0; clothCount = 0; catCount = 0;
      for (const e of town.lifeEntries().concat(lots ? lots.lifeEntries() : [])) {
        if (kindOf(e.b) !== 'home' || H.n >= MAX_HOMES) continue;
        const sites = e.parts.sites, body = sites && sites.bodies[0];
        if (!body || !sites.doors.length) continue;
        const h = H.n++, b = e.b, seed = b.seed | 0;
        H.x[h] = b.x; H.y[h] = b.y; H.z[h] = b.z; H.rot[h] = b.rotY; H.seed[h] = seed;
        H.half[h] = body.w / 2; H.front[h] = body.z + body.d / 2;
        H.nextAt[h] = 1 + 20 * unit(seed, 80);
        H.doors.push(sites.doors);
        H.wash[h] = 0; H.washWant[h] = 0; H.washDrawn[h] = 0; H.catShow[h] = 0; H.catDrawn[h] = 0; H.cat[h] = -1; H.clothN[h] = 0; H.cloth0[h] = clothCount;
        if (hasWashingLine(seed) && body.floors >= 2 && clothCount + 5 <= MAX_CLOTH) {
          const n = 3 + Math.floor(unit(seed, 81) * 3), nx = Math.max(1, Math.round(body.w / BAY)), bay = body.w / nx;
          const mid = body.x + (nx > 1 ? -body.w / 2 + bay : 0);
          const floor = 1 + Math.floor(unit(seed, 82) * Math.max(1, body.floors - 1) * 0.999);
          for (let i = 0; i < n; i++) {
            const k = clothCount++;
            cl.lx[k] = mid + (i - (n - 1) / 2) * 0.42; cl.ly[k] = body.y0 + Math.min(floor, body.floors - 1) * FH + 0.92; cl.lz[k] = H.front[h] + 0.1;
            cl.sx[k] = 0.8 + 0.5 * unit(seed, 83 + i); cl.ph[k] = 6.28 * unit(seed, 90 + i);
            col.setHex(CLOTHS[Math.floor(unit(seed, 100 + i) * CLOTHS.length)]);
            clothMesh.setColorAt(k, col);
            hide(clothMesh, k);
          }
          H.clothN[h] = n;
        }
        if (hasCat(seed) && sites.perch && catCount < MAX_CATS) {
          const [px, py, pz] = sites.perch, k = catCount++, c = Math.cos(b.rotY), s = Math.sin(b.rotY);
          H.cat[h] = k;
          H.cx[h] = b.x + px * c + pz * s; H.cz[h] = b.z - px * s + pz * c; H.cy[h] = b.y + py;
          col.setHex(FURS[Math.floor(unit(seed, 84) * FURS.length)]);
          catMesh.setColorAt(k, col);
          hide(catMesh, k);
        }
      }
      clothMesh.count = clothCount; catMesh.count = catCount;
      clothMesh.instanceMatrix.needsUpdate = catMesh.instanceMatrix.needsUpdate = true;
      if (clothMesh.instanceColor) clothMesh.instanceColor.needsUpdate = true;
      if (catMesh.instanceColor) catMesh.instanceColor.needsUpdate = true;
      lastStep = -99;
    }

    // ---- residents: three waypoints (two legs), maybe a stand-still at the middle one ----
    const A = {
      on: new Uint8Array(MAX_FOLK), wx: new Float32Array(MAX_FOLK * 3), wz: new Float32Array(MAX_FOLK * 3), wy: new Float32Array(MAX_FOLK * 3),
      leg: new Uint8Array(MAX_FOLK), t: new Float32Array(MAX_FOLK), len: new Float32Array(MAX_FOLK), speed: new Float32Array(MAX_FOLK),
      stand: new Float32Array(MAX_FOLK), standing: new Float32Array(MAX_FOLK), size: new Float32Array(MAX_FOLK), yaw: new Float32Array(MAX_FOLK),
      faceYaw: new Float32Array(MAX_FOLK), phase: new Float32Array(MAX_FOLK), dist: new Float32Array(MAX_FOLK),
      fadeIn: new Float32Array(MAX_FOLK), fadeOut: new Float32Array(MAX_FOLK),
    };
    let nextActor = 0, folkTop = 0;

    function setLeg(a, leg) {
      A.leg[a] = leg; A.t[a] = 0;
      const i = a * 3 + leg, dx = A.wx[i + 1] - A.wx[i], dz = A.wz[i + 1] - A.wz[i];
      A.len[a] = Math.max(0.05, Math.hypot(dx, dz));
      A.yaw[a] = Math.atan2(-dz, dx);
    }

    // kind: 'leave' (door, along the front, away), 'arrive' (from along the front, to the door), 'step' (out, a pause, back in)
    function spawn(h, kind) {
      let a = -1;
      for (let i = 0; i < MAX_FOLK; i++) { const k = (nextActor + i) % MAX_FOLK; if (!A.on[k]) { a = k; break; } }
      if (a < 0) return;
      nextActor = (a + 1) % MAX_FOLK;
      const doors = H.doors[h], door = doors[Math.floor(Math.random() * doors.length)];
      const c = Math.cos(H.rot[h]), s = Math.sin(H.rot[h]), front = H.front[h] + STOOP, half = H.half[h];
      const side = Math.random() < 0.5 ? -1 : 1, end = Math.max(-half - 0.9, Math.min(half + 0.9, door[0] + side * (1.6 + Math.random() * 1.4)));
      const stoopX = Math.max(-half + 0.4, Math.min(half - 0.4, door[0] + (Math.random() - 0.5) * 0.9));
      const lx0 = kind === 'arrive' ? end : door[0], lz0 = kind === 'arrive' ? front : door[1];
      const lx1 = kind === 'step' ? stoopX : door[0] + side * 0.15, lz1 = front;
      const lx2 = kind === 'leave' ? end : door[0], lz2 = kind === 'leave' ? front : door[1];
      const lxs = [lx0, lx1, lx2], lzs = [lz0, lz1, lz2], atDoor = [kind !== 'arrive', false, kind !== 'leave'];
      for (let i = 0; i < 3; i++) {
        const wx = H.x[h] + lxs[i] * c + lzs[i] * s, wz = H.z[h] - lxs[i] * s + lzs[i] * c;
        A.wx[a * 3 + i] = wx; A.wz[a * 3 + i] = wz;
        A.wy[a * 3 + i] = atDoor[i] ? H.y[h] + 0.25 : groundY(wx, wz) + 0.02;
      }
      A.on[a] = 1; A.phase[a] = Math.random() * 6.28; A.dist[a] = 0; A.standing[a] = 0;
      A.speed[a] = 1.05 + Math.random() * 0.45;
      A.size[a] = Math.random() < 0.18 ? 0.72 : 0.9 + Math.random() * 0.14;
      A.stand[a] = kind === 'step' ? 3 + Math.random() * 5 : 0;
      A.fadeIn[a] = kind === 'arrive' ? SIDE_FADE : DOOR_FADE; A.fadeOut[a] = kind === 'leave' ? SIDE_FADE : DOOR_FADE;
      A.faceYaw[a] = Math.atan2(-c, s); // looking out of the front: the building's +z in world is (s, c)
      col.setHex(COATS[Math.floor(Math.random() * COATS.length)]);
      folkMesh.setColorAt(a, col);
      folkMesh.instanceColor.needsUpdate = true;
      setLeg(a, 0);
    }

    function stepFolk(dt, t) {
      let top = 0;
      for (let a = 0; a < MAX_FOLK; a++) {
        if (!A.on[a]) continue;
        let standing = false;
        if (A.standing[a] > 0) {
          A.standing[a] -= dt; standing = true;
          if (A.standing[a] <= 0) { A.standing[a] = 0; standing = false; setLeg(a, 1); }
        } else {
          A.t[a] += (A.speed[a] * dt) / A.len[a]; A.dist[a] += A.speed[a] * dt;
          if (A.t[a] >= 1) {
            if (A.leg[a] === 0) {
              if (A.stand[a] > 0) { A.standing[a] = A.stand[a]; A.stand[a] = 0; A.t[a] = 1; standing = true; }
              else setLeg(a, 1);
            } else { A.on[a] = 0; hide(folkMesh, a); continue; }
          }
        }
        top = a + 1;
        const leg = A.leg[a], i = a * 3 + leg, k = Math.min(1, A.t[a]);
        const x = A.wx[i] + (A.wx[i + 1] - A.wx[i]) * k, z = A.wz[i] + (A.wz[i + 1] - A.wz[i]) * k, y = A.wy[i] + (A.wy[i + 1] - A.wy[i]) * k;
        const along = k * A.len[a];
        let vis = 1;
        if (leg === 0) vis = Math.min(1, along / A.fadeIn[a]);
        else vis = Math.max(0, Math.min(1, (A.len[a] - along) / A.fadeOut[a]));
        const stride = standing ? 0 : Math.sin(A.phase[a] + A.dist[a] * 7.5);
        const lean = standing ? Math.sin(t * 1.4 + A.phase[a]) * 0.05 : stride * 0.06;
        qa.setFromEuler(eul.set(lean, standing ? A.faceYaw[a] : A.yaw[a], 0));
        const sc = A.size[a] * vis;
        m4.compose(p3.set(x, y + Math.abs(stride) * 0.04 * A.size[a], z), qa, s3.set(sc, sc, sc));
        folkMesh.setMatrixAt(a, m4);
      }
      folkTop = top;
      folkMesh.count = top;
      folkMesh.instanceMatrix.needsUpdate = true;
    }

    return {
      quality(rs) { effects = rs.effects; crowd = rs.crowd; },
      frame(f) {
        const rev = town.lifeRev() + (sys('lots') ? sys('lots').lifeRev() : 0);
        if (rev !== seenRev) { seenRev = rev; build(); }
        const dt = f.dt, hour = f.state.hour, night = f.sky ? f.sky.night : 0, season = f.state.season, wk = f.state.weatherKind;
        if (hour < lastHour - 6) day++;
        lastHour = hour;
        const v = camera.view, r = (v.half / v.zoom) * 2.2 + 4, r2 = r * r;
        const live = f.state.popLive, fill = live ? live.fill : 0.5;

        // who has washing out: re-read as the hour moves on
        if (Math.abs(hour - lastStep) > 0.1 || hour < lastStep) {
          lastStep = hour;
          for (let h = 0; h < H.n; h++) H.washWant[h] = effects >= 1 && H.clothN[h] && homeOccupied(H.seed[h], fill) && washDay(H.seed[h], day, hour, season, wk) ? 1 : 0;
        }

        const rate = effects > 0 && night < 0.6 && !(f.sky && f.sky.rain > 0.3)
          ? outingRate(hour) * (0.35 + 1.1 * fill) * crowd * (effects < 1 ? 0.5 : 1) : 0;
        const wind = wk === 'leaves' ? 0.5 : 0.16;
        let clothDirty = false, catDirty = false;

        for (let h = 0; h < H.n; h++) {
          const dx = H.x[h] - v.tx, dz = H.z[h] - v.tz;
          if (dx * dx + dz * dz > r2) continue;

          // an outing, now and then
          if (rate > 0 && homeOccupied(H.seed[h], fill)) {
            H.nextAt[h] -= dt;
            if (H.nextAt[h] <= 0) { spawn(h, outingKind(Math.random(), hour)); H.nextAt[h] = -Math.log(1 - Math.random()) / rate; }
          }

          // washing: unfurls on a washing day, furls away after; sways in the wind
          if (H.clothN[h]) {
            const want = H.washWant[h];
            if (H.wash[h] !== want) { H.wash[h] += (want - H.wash[h]) * Math.min(1, dt * 1.6); if (Math.abs(H.wash[h] - want) < 0.02) H.wash[h] = want; }
            const u = H.wash[h];
            if (u > 0 || H.washDrawn[h]) {
              const c = Math.cos(H.rot[h]), s = Math.sin(H.rot[h]);
              for (let n = 0; n < H.clothN[h]; n++) {
                const k = H.cloth0[h] + n;
                if (u <= 0) { hide(clothMesh, k); continue; }
                qa.setFromAxisAngle(UP, H.rot[h]);
                qa.multiply(qb.setFromAxisAngle(FWD, Math.sin(f.t * 2.1 + cl.ph[k]) * wind * u));
                p3.set(H.x[h] + cl.lx[k] * c + cl.lz[k] * s, H.y[h] + cl.ly[k], H.z[h] - cl.lx[k] * s + cl.lz[k] * c);
                m4.compose(p3, qa, s3.set(cl.sx[k], u, 1));
                clothMesh.setMatrixAt(k, m4);
              }
              H.washDrawn[h] = u > 0 ? 1 : 0; clothDirty = true;
            }
          }

          // the cat comes out in fair weather and goes in when it is wet, cold or dark
          const k = H.cat[h];
          if (k >= 0) {
            const want = effects >= 1 && catOut(H.seed[h], hour, night, wk, season) ? 1 : 0;
            if (H.catShow[h] !== want) { H.catShow[h] += (want - H.catShow[h]) * Math.min(1, dt * 2); if (Math.abs(H.catShow[h] - want) < 0.02) H.catShow[h] = want; }
            const u = H.catShow[h];
            if (u > 0 || H.catDrawn[h]) {
              if (u <= 0) hide(catMesh, k);
              else {
                const ph = unit(H.seed[h], 85) * 6.28, stretch = Math.max(0, Math.sin(f.t * 0.23 + ph) - 0.93) * 12;
                qa.setFromAxisAngle(UP, H.rot[h] + (unit(H.seed[h], 86) < 0.5 ? 0 : Math.PI) + 0.4 * Math.sin(f.t * 0.17 + ph));
                const sz = 1.35 * u;
                s3.set(sz * (1 + 0.3 * stretch), sz * (1 + 0.025 * Math.sin(f.t * 1.9 + ph) - 0.15 * stretch), sz);
                catMesh.setMatrixAt(k, m4.compose(p3.set(H.cx[h], H.cy[h], H.cz[h]), qa, s3));
              }
              H.catDrawn[h] = u > 0 ? 1 : 0; catDirty = true;
            }
          }
        }

        stepFolk(dt, f.t);
        if (clothDirty) clothMesh.instanceMatrix.needsUpdate = true;
        if (catDirty) catMesh.instanceMatrix.needsUpdate = true;
        folkMesh.visible = folkTop > 0;
        clothMesh.visible = effects >= 1 && clothCount > 0; catMesh.visible = effects >= 1 && catCount > 0;
      },
    };
  },
};
