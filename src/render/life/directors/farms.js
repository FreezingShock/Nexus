// Farms: crops that grow and ripen with the seasons (and bare in winter), a tractor working the lane behind the yard on dry
// days, sheep wandering the gap between the house and the barn, and farm hands walking out to a field and back. The farmhouse
// chimney smokes through the smoke system. Only farms near the camera are worked on.
import * as THREE from '../../../../vendor/three/three.module.min.js';
import { sheepGeometry, tractorGeometry, tuftGeometry } from '../figures.js';
import { ZERO } from '../pools.js';
import { toWorld } from '../routes.js';
import { CROP_TINT, dayBusy, farmHandRate, growthTarget, kindOf, tractorWorking } from '../rules.js';
import { unit } from '../../../sim/schedule.js';
import { COATS } from './homes.js';

export const MAX_FARMS = 120, MAX_TUFTS = 4000, PER_FARM = 320, MAX_SHEEP = 300;
const UP = new THREE.Vector3(0, 1, 0);
const WOOL = [0xFAF3E4, 0xEFE6D2, 0xCFC6B8];
const TRACTORS = [0xB8574A, 0x6D9A8C, 0xE6BC62, 0x8DBEDD, 0xC8694F, 0x9DB37C, 0xA7856A];

export function createFarms(pools) {
  const tufts = pools.make('tufts', tuftGeometry(), MAX_TUFTS, { cast: false });
  const tractor = pools.make('tractor', tractorGeometry(), MAX_FARMS), sheep = pools.make('sheep', sheepGeometry(), MAX_SHEEP);
  const m4 = new THREE.Matrix4(), p3 = new THREE.Vector3(), qa = new THREE.Quaternion(), s3 = new THREE.Vector3(), col = new THREE.Color();
  const F = {
    n: 0, x: new Float32Array(MAX_FARMS), z: new Float32Array(MAX_FARMS), y: new Float32Array(MAX_FARMS), rot: new Float32Array(MAX_FARMS),
    seed: new Int32Array(MAX_FARMS), base: new Float32Array(MAX_FARMS), beds: [],
    t0: new Int32Array(MAX_FARMS), tN: new Int16Array(MAX_FARMS), stamp: new Float32Array(MAX_FARMS).fill(-1),
    lane: [], hasTractor: new Uint8Array(MAX_FARMS), tx: new Float32Array(MAX_FARMS), tdir: new Float32Array(MAX_FARMS), tpause: new Float32Array(MAX_FARMS), tshow: new Float32Array(MAX_FARMS),
    gap: [], s0: new Int32Array(MAX_FARMS), sN: new Int8Array(MAX_FARMS), nextAt: new Float32Array(MAX_FARMS),
  };
  // tufts: local position and personal lag
  const T = { lx: new Float32Array(MAX_TUFTS), lz: new Float32Array(MAX_TUFTS), lag: new Float32Array(MAX_TUFTS), jit: new Float32Array(MAX_TUFTS) };
  // sheep: local position, target, pause, heading
  const P = { x: new Float32Array(MAX_SHEEP), z: new Float32Array(MAX_SHEEP), tx: new Float32Array(MAX_SHEEP), tz: new Float32Array(MAX_SHEEP), wait: new Float32Array(MAX_SHEEP), yaw: new Float32Array(MAX_SHEEP), farm: new Int16Array(MAX_SHEEP) };
  let tuftCount = 0, sheepCount = 0, growth = -1, tintSeason = '';

  const pickGap = (f, rnd) => { const g = F.gap[f]; return [g.x0 + (g.x1 - g.x0) * rnd(), g.z0 + (g.z1 - g.z0) * rnd()]; };

  return {
    build(entries) {
      F.n = 0; tuftCount = 0; sheepCount = 0; F.beds.length = 0; F.lane.length = 0; F.gap.length = 0; tintSeason = '';
      for (const e of entries) {
        if (kindOf(e.b) !== 'farm' || F.n >= MAX_FARMS) continue;
        const fm = e.parts.sites && e.parts.sites.farm;
        if (!fm || !fm.house) continue;
        const f = F.n++, b = e.b, seed = b.seed | 0;
        F.x[f] = b.x; F.y[f] = b.y; F.z[f] = b.z; F.rot[f] = b.rotY; F.seed[f] = seed; F.base[f] = fm.base; F.beds.push(fm.beds); F.lane.push(fm.lane);
        F.stamp[f] = -1;
        // plants: two rows down each wide bed, one down a narrow one
        F.t0[f] = tuftCount; let n = 0;
        for (const [x0, z0, x1, z1] of fm.beds) {
          const rows = x1 - x0 > 1 ? 2 : 1;
          for (let r = 0; r < rows; r++) for (let z = z0 + 0.25; z < z1 - 0.15 && n < PER_FARM && tuftCount < MAX_TUFTS; z += 0.42) {
            const k = tuftCount++; n++;
            T.lx[k] = x0 + (x1 - x0) * ((r + 0.5) / rows); T.lz[k] = z; T.lag[k] = unit(seed, 160 + (k % 97)); T.jit[k] = 0.85 + 0.3 * unit(seed, 300 + (k % 89));
            tufts.setMatrixAt(k, ZERO);
          }
        }
        F.tN[f] = n;
        F.hasTractor[f] = unit(seed, 161) < 0.6 && fm.lane.x1 - fm.lane.x0 > 2 ? 1 : 0;
        F.tdir[f] = unit(seed, 166) < 0.5 ? 1 : -1; F.tx[f] = fm.lane.x0 + 0.5 + (fm.lane.x1 - fm.lane.x0 - 1) * unit(seed, 167); F.tpause[f] = 12 * unit(seed, 162); F.tshow[f] = 0;
        tractor.setColorAt(f, col.setHex(TRACTORS[Math.floor(unit(seed, 163) * TRACTORS.length)])); tractor.setMatrixAt(f, ZERO);
        // the gap between the house and the barn, where the sheep graze
        const hl = fm.house.x - fm.house.hw / 2, hr = fm.house.x + fm.house.hw / 2, bl = fm.barn.x - fm.barn.hw, br = fm.barn.x + fm.barn.hw;
        const x0 = Math.min(hr, br) <= Math.max(hl, bl) ? Math.min(hr, br) + 0.12 : 0, x1 = Math.min(hr, br) <= Math.max(hl, bl) ? Math.max(hl, bl) - 0.12 : 0;
        F.gap.push({ x0, x1, z0: fm.house.z - fm.house.hd / 2 + 0.2, z1: fm.house.z + fm.house.hd / 2 + 0.1 });
        F.sN[f] = 0; F.s0[f] = sheepCount;
        if (x1 - x0 > 0.25) {
          const cnt = 1 + Math.floor(unit(seed, 164) * 2.99 * (x1 - x0 > 0.9 ? 1 : 0.4));
          for (let i = 0; i < cnt && sheepCount < MAX_SHEEP; i++) {
            const k = sheepCount++; F.sN[f]++;
            [P.x[k], P.z[k]] = pickGap(f, Math.random); P.tx[k] = P.x[k]; P.tz[k] = P.z[k]; P.wait[k] = Math.random() * 4; P.yaw[k] = Math.random() * 6.28; P.farm[k] = f;
            sheep.setColorAt(k, col.setHex(WOOL[Math.floor(unit(seed, 170 + i) * WOOL.length)])); sheep.setMatrixAt(k, ZERO);
          }
        }
        F.nextAt[f] = 3 + 15 * unit(seed, 165);
      }
      tufts.count = tuftCount; tractor.count = F.n; sheep.count = sheepCount;
      tufts.visible = tuftCount > 0; tractor.visible = F.n > 0; sheep.visible = sheepCount > 0;
      tufts.instanceMatrix.needsUpdate = tractor.instanceMatrix.needsUpdate = sheep.instanceMatrix.needsUpdate = true;
      tractor.instanceColor.needsUpdate = sheep.instanceColor.needsUpdate = true;
    },

    frame(c) {
      const { dt, hour, season, wk, effects, day } = c;
      if (!F.n) return;
      // crops grow towards the season's level, slowly enough to watch
      const target = growthTarget(season);
      if (growth < 0) growth = target;
      if (growth !== target) { growth += Math.sign(target - growth) * Math.min(Math.abs(target - growth), dt * 0.12); }
      if (tintSeason !== season) {
        tintSeason = season;
        for (let f = 0; f < F.n; f++) for (let i = 0; i < F.tN[f]; i++) tufts.setColorAt(F.t0[f] + i, col.setHex(CROP_TINT[season] || CROP_TINT.spring).offsetHSL(0, 0, (unit(F.seed[f], 400 + i) - 0.5) * 0.08));
        tufts.instanceColor.needsUpdate = true;
        for (let f = 0; f < F.n; f++) F.stamp[f] = -1;
      }
      let tDirty = false, vDirty = false, sDirty = false;
      for (let f = 0; f < F.n; f++) {
        if (!c.near(F.x[f], F.z[f])) continue;
        const cs = Math.cos(F.rot[f]), sn = Math.sin(F.rot[f]), y0 = F.y[f] + F.base[f] + 0.1;
        if (effects > 0 && F.stamp[f] !== growth) {
          F.stamp[f] = growth;
          for (let i = 0; i < F.tN[f]; i++) {
            const k = F.t0[f] + i, gr = Math.max(0, Math.min(1, growth * 1.4 - T.lag[k] * 0.4)), sc = gr * T.jit[k];
            qa.identity();
            p3.set(F.x[f] + T.lx[k] * cs + T.lz[k] * sn, y0, F.z[f] - T.lx[k] * sn + T.lz[k] * cs);
            tufts.setMatrixAt(k, sc < 0.02 ? ZERO : m4.compose(p3, qa, s3.set(sc, sc * (0.5 + 0.9 * gr), sc)));
          }
          tDirty = true;
        }

        // tractor
        if (F.hasTractor[f]) {
          const want = effects >= 1 && tractorWorking(season, hour, wk, F.seed[f], day) ? 1 : 0;
          F.tshow[f] += (want - F.tshow[f]) * Math.min(1, dt * 1.5); if (Math.abs(F.tshow[f] - want) < 0.02) F.tshow[f] = want;
          const u = F.tshow[f], lane = F.lane[f];
          if (u > 0) {
            if (F.tpause[f] > 0) F.tpause[f] -= dt;
            else {
              F.tx[f] += F.tdir[f] * 0.45 * dt;
              if (F.tx[f] >= lane.x1 - 0.5) { F.tx[f] = lane.x1 - 0.5; F.tdir[f] = -1; F.tpause[f] = 2 + 3 * Math.random(); }
              else if (F.tx[f] <= lane.x0 + 0.5) { F.tx[f] = lane.x0 + 0.5; F.tdir[f] = 1; F.tpause[f] = 2 + 3 * Math.random(); }
            }
            qa.setFromAxisAngle(UP, F.rot[f] + (F.tdir[f] > 0 ? 0 : Math.PI));
            p3.set(F.x[f] + F.tx[f] * cs + lane.z * sn, y0, F.z[f] - F.tx[f] * sn + lane.z * cs);
            tractor.setMatrixAt(f, m4.compose(p3, qa, s3.set(u, u, u))); vDirty = true;
          } else if (F.tshow[f] === 0) { tractor.setMatrixAt(f, ZERO); vDirty = true; }
        }

        // sheep wander the gap
        if (effects >= 1) for (let i = 0; i < F.sN[f]; i++) {
          const k = F.s0[f] + i;
          if (P.wait[k] > 0) P.wait[k] -= dt;
          else {
            const dx = P.tx[k] - P.x[k], dz = P.tz[k] - P.z[k], d = Math.hypot(dx, dz);
            if (d < 0.03) { P.wait[k] = 2 + 5 * Math.random(); [P.tx[k], P.tz[k]] = pickGap(f, Math.random); }
            else { const st = Math.min(d, 0.12 * dt); P.x[k] += (dx / d) * st; P.z[k] += (dz / d) * st; P.yaw[k] = Math.atan2(-dz, dx); }
          }
          const graze = P.wait[k] > 0 ? Math.sin(c.t * 2 + k) * 0.04 : 0;
          qa.setFromAxisAngle(UP, F.rot[f] + P.yaw[k]);
          p3.set(F.x[f] + P.x[k] * cs + P.z[k] * sn, y0, F.z[f] - P.x[k] * sn + P.z[k] * cs);
          sheep.setMatrixAt(k, m4.compose(p3, qa, s3.set(0.85, 0.85 + graze, 0.85))); sDirty = true;
        }

        // a farm hand walks out between the house and the barn to a field and back
        const rate = effects > 0 ? farmHandRate(hour) * dayBusy(F.seed[f], day) * c.crowd * (effects < 1 ? 0.5 : 1) : 0;
        if (rate > 0 && F.beds[f].length && F.gap[f].x1 > F.gap[f].x0) {
          F.nextAt[f] -= dt;
          if (F.nextAt[f] <= 0) {
            const g = F.gap[f], bed = F.beds[f][Math.floor(Math.random() * F.beds[f].length)];
            const gx = (g.x0 + g.x1) / 2, gz = g.z0 + 0.3;
            const pts = [toWorld({ x: F.x[f], z: F.z[f], rot: F.rot[f] }, gx, gz), toWorld({ x: F.x[f], z: F.z[f], rot: F.rot[f] }, (bed[0] + bed[2]) / 2, (bed[1] + bed[3]) / 2), toWorld({ x: F.x[f], z: F.z[f], rot: F.rot[f] }, gx, gz)].map((p) => ({ ...p, door: false }));
            pools.folk.spawn({ pts, doorY: y0, stand: 6 + Math.random() * 6, fadeIn: 0.6, fadeOut: 0.6, face: F.rot[f], color: COATS[Math.floor(Math.random() * COATS.length)] });
            F.nextAt[f] = -Math.log(1 - Math.random()) / rate;
          }
        }
      }
      if (tDirty) tufts.instanceMatrix.needsUpdate = true;
      if (vDirty) tractor.instanceMatrix.needsUpdate = true;
      if (sDirty) sheep.instanceMatrix.needsUpdate = true;
      tufts.visible = effects > 0 && tuftCount > 0; tractor.visible = effects >= 1 && F.n > 0; sheep.visible = effects >= 1 && sheepCount > 0;
    },
  };
}
