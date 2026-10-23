// Chimney smoke. Every chimney on a lived-in home puffs now and then: thickest on winter mornings and evenings, hardly
// at all on a summer afternoon. A fixed pool of soft puffs rises, spreads and fades; chimneys out of view are skipped, so
// the pool is spent where the camera is. One instanced mesh, no allocation per frame. Graphics: Off draws none, Light half.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { toonUncached } from '../materials.js';
import { allocInstanceColors } from '../geom.js';
import { homeOccupied, hearthRate, kindOf, stackRate } from '../life/rules.js';
import { unit } from '../../sim/schedule.js';

const MAX = 200, MAX_EMITTERS = 600;
const DEAD = 99; // age of a free slot
const LIFE = 2.8, RISE = 0.62, SIZE0 = 0.1, SIZE1 = 0.36;
const DAY = new THREE.Color(0xEFE8DA), DUSK = new THREE.Color(0xB9B3C4), SOOT = new THREE.Color(0x8F8A86), tmp = new THREE.Color();

export default {
  id: 'life-smoke',
  create({ world, town, camera, sys }) {
    let effects = 1; // graphics setting: 0 off, 0.5 light, 1 full
    const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), toonUncached(0xffffff), MAX);
    mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false; mesh.visible = false; mesh.count = MAX;
    allocInstanceColors(mesh);
    world.add(mesh);
    for (let i = 0; i < MAX; i++) mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); // free slots draw nothing

    // the pool
    const age = new Float32Array(MAX).fill(DEAD), px = new Float32Array(MAX), py = new Float32Array(MAX), pz = new Float32Array(MAX);
    const stackOf = new Uint8Array(MAX), vx = new Float32Array(MAX), grow = new Float32Array(MAX), phase = new Float32Array(MAX);
    let next = 0, alive = 0;
    // the chimneys
    const ex = new Float32Array(MAX_EMITTERS), ey = new Float32Array(MAX_EMITTERS), ez = new Float32Array(MAX_EMITTERS);
    const estack = new Uint8Array(MAX_EMITTERS), eseed = new Int32Array(MAX_EMITTERS), eacc = new Float32Array(MAX_EMITTERS), egain = new Float32Array(MAX_EMITTERS);
    let emitters = 0, seenRev = -1;

    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color();
    const world3 = new THREE.Vector3();

    function build() {
      const lots = sys('lots');
      emitters = 0;
      for (const e of town.lifeEntries().concat(lots ? lots.lifeEntries() : [])) {
        const k = kindOf(e.b), sites = e.parts.sites;
        if (!sites || (k !== 'home' && k !== 'farm' && k !== 'work')) continue;
        const seed = e.b.seed | 0, stack = k === 'work' ? 1 : 0;
        (stack ? sites.stacks : sites.chimneys).forEach((ch, i) => {
          if (emitters >= MAX_EMITTERS) return;
          world3.set(ch[0], ch[1], ch[2]).applyMatrix4(e.world);
          ex[emitters] = world3.x; ey[emitters] = world3.y; ez[emitters] = world3.z;
          eseed[emitters] = seed; estack[emitters] = stack; eacc[emitters] = unit(seed, 60 + i); egain[emitters] = 0.7 + 0.6 * unit(seed, 70 + i);
          emitters++;
        });
      }
    }

    function spawn(i, t) {
      const k = next; next = (next + 1) % MAX;
      px[k] = ex[i] + (Math.random() - 0.5) * 0.12; py[k] = ey[i]; pz[k] = ez[i] + (Math.random() - 0.5) * 0.12;
      vx[k] = 0.18 + 0.12 * Math.sin(t * 0.21 + i); grow[k] = (0.8 + 0.5 * Math.random()) * (estack[i] ? 1.5 : 1); stackOf[k] = estack[i]; phase[k] = Math.random() * 6.28;
      if (age[k] === DEAD) alive++;
      age[k] = 0;
    }

    return {
      quality(rs) { effects = rs.effects; },
      frame(f) {
        const rev = town.lifeRev() + (sys('lots') ? sys('lots').lifeRev() : 0);
        if (rev !== seenRev) { seenRev = rev; build(); }
        const dt = f.dt, night = f.sky ? f.sky.night : 0;
        if (effects > 0 && emitters) {
          const v = camera.view, r = (v.half / v.zoom) * 2.2 + 4, r2 = r * r;
          const live = f.state.popLive, fill = live ? live.fill : 0.5;
          const hearth = hearthRate(f.state.season, f.state.hour) * effects, stacks = stackRate(f.state.hour) * effects;
          if (hearth > 0.001 || stacks > 0.001) {
            for (let i = 0; i < emitters; i++) {
              const dx = ex[i] - v.tx, dz = ez[i] - v.tz;
              if (dx * dx + dz * dz > r2 || (!estack[i] && !homeOccupied(eseed[i], fill))) continue;
              eacc[i] += dt * (estack[i] ? stacks : hearth) * egain[i];
              if (eacc[i] >= 1) { eacc[i] -= 1; spawn(i, f.t); }
            }
          }
        }
        if (!alive) { mesh.visible = false; return; }
        c.copy(DAY).lerp(DUSK, night);
        let live = 0;
        for (let i = 0; i < MAX; i++) {
          if (age[i] === DEAD) continue;
          age[i] += dt;
          const k = age[i] / LIFE;
          if (k >= 1) { alive--; age[i] = DEAD; s.set(0, 0, 0); mesh.setMatrixAt(i, m.compose(p.set(0, -50, 0), q, s)); continue; }
          live++;
          py[i] += RISE * (1 - 0.55 * k) * dt;
          px[i] += vx[i] * dt * (0.4 + k) + Math.sin(f.t * 1.3 + phase[i]) * 0.03 * dt;
          const sz = (SIZE0 + (SIZE1 - SIZE0) * Math.sqrt(k)) * grow[i] * (k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1);
          s.set(sz, sz * 0.9, sz);
          m.compose(p.set(px[i], py[i], pz[i]), q, s);
          mesh.setMatrixAt(i, m);
          mesh.setColorAt(i, stackOf[i] ? tmp.copy(c).lerp(SOOT, 0.5) : c);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.visible = live > 0;
      },
    };
  },
};
