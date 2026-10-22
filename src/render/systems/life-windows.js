// Lit windows. At night the town's walls have dark panes (models/materials.js, dimStyle); this system lays a warm glow
// over each window that is lit. Every window has its own luck and its own moment at dusk, so they come on one by one,
// and a house goes dim room by room at bedtime. Homes light up only when lived in (population fill); shops, offices,
// workshops and services keep their own hours (life/rules.js). One instanced mesh, one draw call; a window is on or off
// through a per-instance scale, so the glow never needs a matrix rewrite after the build.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { forEachWindow } from '../life/window-sites.js';
import { KINDS, dusk, homeOccupied, kindIndex, kindOf, lightShare, householdShift, windowRoll } from '../life/rules.js';
import { unit } from '../../sim/schedule.js';
import { allocInstanceColors } from '../geom.js';

export const MAX_WINDOWS = 16000;
const GLOWS = [0xFFD98A, 0xFFC96B, 0xFFE3A6, 0xF6B866, 0xFFD98A, 0xFFE3A6];
const TV = 0xBFD8F0;     // now and then a flickering blue screen instead
const EASE = 6;          // how quickly a glow settles (per second)
const HOUR_STEP = 0.06;  // town hours between re-reads of who is awake
const SHIFT_BUCKETS = 6;

export function glowMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed *= aLit;');
  };
  m.customProgramCacheKey = () => 'nexus-life-glow';
  return m;
}

export default {
  id: 'life-windows',
  create({ world, town, sys }) {
    const lit = new THREE.InstancedBufferAttribute(new Float32Array(MAX_WINDOWS), 1).setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute('aLit', lit);
    const mesh = new THREE.InstancedMesh(geo, glowMaterial(), MAX_WINDOWS);
    mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false; mesh.count = 0; mesh.visible = false;
    mesh.renderOrder = 2;
    allocInstanceColors(mesh); // before the first setColorAt: the buffer is sized from the mesh's full capacity
    world.add(mesh);

    // per window: what kind of building, its own luck, when at dusk it comes on, its household (for occupancy and bedtime)
    const kind = new Uint8Array(MAX_WINDOWS), roll = new Float32Array(MAX_WINDOWS), thr = new Float32Array(MAX_WINDOWS);
    const hseed = new Int32Array(MAX_WINDOWS), bucket = new Uint8Array(MAX_WINDOWS), want = new Uint8Array(MAX_WINDOWS);
    const local = new THREE.Matrix4(), inst = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color();
    const Y = new THREE.Vector3(0, 1, 0);
    let count = 0, seenRev = -1, lastHour = -99, lastFill = -1, lastDark = -1, settling = true;
    const share = new Float32Array(KINDS.length * SHIFT_BUCKETS);

    function build() {
      const lots = sys('lots');
      const entries = town.lifeEntries().concat(lots ? lots.lifeEntries() : []);
      count = 0;
      for (const e of entries) {
        const k = kindOf(e.b), sites = e.parts.sites;
        if (!k || !sites) continue;
        const ki = kindIndex(k), seed = e.b.seed | 0, shift = householdShift(seed);
        const sb = Math.max(0, Math.min(SHIFT_BUCKETS - 1, Math.floor(((shift + 1) / 2.5) * SHIFT_BUCKETS)));
        let w = 0;
        for (const body of sites.bodies) {
          forEachWindow(body, (x, y, z, yaw, ww, hh) => {
            if (count >= MAX_WINDOWS) return;
            p.set(x, y, z); q.setFromAxisAngle(Y, yaw); s.set(ww, hh, 1);
            local.compose(p, q, s);
            inst.multiplyMatrices(e.world, local);
            mesh.setMatrixAt(count, inst);
            const rr = unit(seed, 1000 + w);
            c.setHex(rr < 0.07 ? TV : GLOWS[Math.floor(unit(seed, 1500 + w) * GLOWS.length)]);
            mesh.setColorAt(count, c);
            kind[count] = ki; hseed[count] = seed; bucket[count] = sb;
            roll[count] = windowRoll(seed, w); thr[count] = dusk(seed, w);
            lit.array[count] = 0;
            count++; w++;
          });
        }
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      lastHour = -99; settling = true;
    }

    // Who is awake, lit this hour: one read per window, repeated only when the hour moves on or the town's population does.
    function reread(hour, fill) {
      for (let k = 0; k < KINDS.length; k++) for (let b = 0; b < SHIFT_BUCKETS; b++) {
        const sh = -1 + 2.5 * ((b + 0.5) / SHIFT_BUCKETS);
        share[k * SHIFT_BUCKETS + b] = lightShare(KINDS[k], hour, sh);
      }
      const homeK = kindIndex('home'), farmK = kindIndex('farm');
      for (let i = 0; i < count; i++) {
        let on = roll[i] < share[kind[i] * SHIFT_BUCKETS + bucket[i]];
        if (on && (kind[i] === homeK || kind[i] === farmK)) on = homeOccupied(hseed[i], fill);
        want[i] = on ? 1 : 0;
      }
    }

    return {
      frame(f) {
        const rev = town.lifeRev() + (sys('lots') ? sys('lots').lifeRev() : 0);
        if (rev !== seenRev) { seenRev = rev; build(); }
        if (!count) { mesh.visible = false; return; }
        const night = f.sky ? f.sky.night : 0, hour = f.state.hour, live = f.state.popLive, fill = live ? live.fill : 0.5;
        if (Math.abs(hour - lastHour) > HOUR_STEP || hour < lastHour || Math.abs(fill - lastFill) > 0.01) { reread(hour, fill); lastHour = hour; lastFill = fill; settling = true; }
        if (Math.abs(night - lastDark) > 0.002) { lastDark = night; settling = true; }
        if (!settling) return;
        const k = Math.min(1, f.dt * EASE);
        let moving = false, anyOn = false;
        const a = lit.array;
        for (let i = 0; i < count; i++) {
          const target = want[i] && night > thr[i] ? 1 : 0, v = a[i];
          if (v === target) { if (v) anyOn = true; continue; }
          const nv = v + (target - v) * k;
          a[i] = Math.abs(nv - target) < 0.02 ? target : nv;
          moving = true; if (a[i] > 0) anyOn = true;
        }
        lit.needsUpdate = true;
        mesh.visible = anyOn;
        settling = moving;
      },
    };
  },
};
