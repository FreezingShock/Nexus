// String lights for the festive seasons (core/events.js): along the eaves of homes, shops and civic buildings, and wound
// round trees. They go up a building at a time as the event's cover grows (state.eventCover), each building popping its
// bulbs in along the string, and come down when the event is over. By day the bulbs are little coloured beads; after dusk
// they glow, twinkle softly and wear a halo. Three draw calls (bulbs, halos, cable), built only while an event is on.
// Graphics: Off draws no halos, Light dims them.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { heightAt } from '../../world/terrain.js';
import { eventById } from '../../core/events.js';
import { dressShare, isDark, lightsFor } from '../../core/festive.js';
import { kindOf } from '../life/rules.js';
import { bodyStrings, luck, spiral } from '../festive/strings.js';
import { allocInstanceColors } from '../geom.js';
import { createLandWatch } from '../land-watch.js';

export const MAX_BULBS = 16000;
const MAX_TREE_BULBS = 5000;
const MAX_GROUPS = 3000;
const POP = 2.2;      // how fast a building's bulbs pop in, per second (staggered along the string)
const HALO = 0.55;    // halo size, world units
const CABLE = 0x3A332B;
const STAGGER = 4;    // seconds: the longest a building waits before its lights go up

// Bulbs: a flat colour that brightens and twinkles at night, scaled by aOn so a bulb pops in from nothing.
function bulbMaterial(u) {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = u.uTime; sh.uniforms.uNight = u.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aOn;\nattribute float aPhase;\nuniform float uTime;\nuniform float uNight;\nvarying float vTw;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed *= aOn;\n\tvTw = mix(0.78, 1.15 + 0.25 * sin(uTime * 2.3 + aPhase * 6.2832), uNight);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTw;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb *= vTw;');
  };
  m.customProgramCacheKey = () => 'nexus-festive-bulb';
  return m;
}

// Halos: a soft round glow that always faces the camera, additive, only after dusk.
function haloMaterial(u) {
  return new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aOn; attribute float aPhase; uniform float uTime; uniform float uNight; uniform float uSize;
      varying vec2 vUv; varying vec3 vCol; varying float vA;
      void main() {
        vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        c.xy += position.xy * uSize;
        c.z += 0.4; // a touch towards the camera, so a wall does not cut the glow in half
        gl_Position = projectionMatrix * c;
        vUv = uv;
        #ifdef USE_INSTANCING_COLOR
        vCol = instanceColor;
        #else
        vCol = vec3(1.0);
        #endif
        vA = aOn * uNight * (0.7 + 0.3 * sin(uTime * 2.3 + aPhase * 6.2832));
      }`,
    fragmentShader: `uniform float uGain; varying vec2 vUv; varying vec3 vCol; varying float vA;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = 1.0 - smoothstep(0.0, 1.0, d);
        gl_FragColor = vec4(vCol, a * a * vA * uGain);
      }`,
  });
}

export default {
  id: 'festive-lights',
  create({ world, town, sys }) {
    const u = { uTime: { value: 0 }, uNight: { value: 0 }, uSize: { value: HALO }, uGain: { value: 0.6 } };
    const on = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BULBS), 1).setUsage(THREE.DynamicDrawUsage);
    const phase = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BULBS), 1);
    const bulbGeo = new THREE.OctahedronGeometry(0.075, 0);
    bulbGeo.setAttribute('aOn', on); bulbGeo.setAttribute('aPhase', phase);
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMaterial(u), MAX_BULBS);
    bulbs.frustumCulled = false; bulbs.count = 0; bulbs.visible = false; bulbs.renderOrder = 2;
    allocInstanceColors(bulbs);
    const haloGeo = new THREE.PlaneGeometry(1, 1);
    haloGeo.setAttribute('aOn', on); haloGeo.setAttribute('aPhase', phase);
    const halos = new THREE.InstancedMesh(haloGeo, haloMaterial(u), MAX_BULBS);
    halos.instanceMatrix = bulbs.instanceMatrix; halos.instanceColor = bulbs.instanceColor; // the same bulbs, glowing
    halos.frustumCulled = false; halos.count = 0; halos.visible = false; halos.renderOrder = 3;
    const wirePos = new Float32Array(MAX_BULBS * 6);
    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute('position', new THREE.BufferAttribute(wirePos, 3).setUsage(THREE.DynamicDrawUsage));
    const wire = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: CABLE }));
    wire.frustumCulled = false; wire.visible = false;
    world.add(bulbs, halos, wire);

    // per bulb: its group (a building or a tree) and its place along the string (for the pop-in stagger)
    const group = new Uint16Array(MAX_BULBS), along = new Float32Array(MAX_BULBS), pal = new Uint8Array(MAX_BULBS);
    // per group: its luck (decorates once the cover passes it), whether it is a tree, its eased reveal
    const gLuck = new Float32Array(MAX_GROUPS), gTree = new Uint8Array(MAX_GROUPS), gDark = new Uint8Array(MAX_GROUPS), gWant = new Uint8Array(MAX_GROUPS), gT = new Float32Array(MAX_GROUPS);
    // the cable: full positions per segment, and the group each belongs to
    const wireFull = new Float32Array(MAX_BULBS * 6), wireGroup = new Uint16Array(MAX_BULBS);
    let count = 0, groups = 0, segs = 0;
    let seenRev = -1, seenTrees = null, seenEvent = '', seenCover = -1, seenFestive = null, effects = 1, settling = false;
    const land = createLandWatch();
    const m = new THREE.Matrix4(), v = new THREE.Vector3(), w0 = new THREE.Vector3(), c = new THREE.Color();

    // a rebuild (a new house, a felled tree) keeps every lit group lit: only new ones pop in
    let keys = [], ids = [], before = new Map();
    function addGroup(l, tree, key) {
      if (groups >= MAX_GROUPS) return -1;
      const was = before.get(key) || 0;
      gLuck[groups] = l; gTree[groups] = tree ? 1 : 0; gWant[groups] = was > 0 ? 1 : 0; gT[groups] = Math.max(0, was);
      keys[groups] = key; ids[groups] = '';
      return groups++;
    }
    const putter = (g, xf, offset) => (x, y, z, i) => {
      if (count >= MAX_BULBS) return;
      v.set(x, y, z); if (xf) v.applyMatrix4(xf);
      m.makeTranslation(v.x, v.y, v.z);
      bulbs.setMatrixAt(count, m);
      group[count] = g; along[count] = i; pal[count] = (i + offset) & 255;
      phase.array[count] = luck(count, 3);
      on.array[count] = 0;
      count++;
    };
    const wirer = (g, xf) => (x0, y0, z0, x1, y1, z1) => {
      if (segs >= MAX_BULBS) return;
      v.set(x0, y0, z0); w0.set(x1, y1, z1); if (xf) { v.applyMatrix4(xf); w0.applyMatrix4(xf); }
      wireFull.set([v.x, v.y, v.z, w0.x, w0.y, w0.z], segs * 6);
      wireGroup[segs++] = g;
    };

    function build(state) {
      before = new Map();
      for (let g = 0; g < groups; g++) before.set(keys[g], gT[g]);
      count = 0; groups = 0; segs = 0; keys = []; ids = [];
      const lots = sys('lots');
      for (const e of town.lifeEntries().concat(lots ? lots.lifeEntries() : [])) {
        const k = kindOf(e.b), sites = e.parts.sites;
        if (!k || !sites || !sites.bodies.length) continue;
        const g = addGroup(luck(e.b.seed | 0, 11), false, 'b' + (e.b.id ?? e.b.seed));
        if (g < 0) break;
        ids[g] = typeof e.b.id === 'string' ? e.b.id : '';
        const offset = Math.floor(luck(e.b.seed | 0, 12) * 8);
        for (const body of sites.bodies) bodyStrings(body, putter(g, e.world, offset), wirer(g, e.world), true);
      }
      const trees = state.trees || [];
      const cap = count + MAX_TREE_BULBS;
      for (const t of trees) {
        if (count >= Math.min(cap, MAX_BULBS)) break;
        const l = luck(Math.round(t.x * 31) * 7919 + Math.round(t.z * 17), 21);
        if (l > 0.65) continue; // past the most any event winds round trees: skip building it at all
        const g = addGroup(l, true, 't' + t.id);
        if (g < 0) break;
        const h = heightAt(t.x, t.z), sc = t.s, a0 = l * 6.2832;
        if (t.k === 'p') spiral(t.x, t.z, h + 0.5 * sc, h + 4.0 * sc, 1.3 * sc, 0.18 * sc, 3, a0, putter(g, null, 0), wirer(g, null));
        else { const cy = h + 1.15 * sc + 0.5; spiral(t.x, t.z, cy - 0.75 * sc, cy + 0.7 * sc, 1.12 * sc, 0.5 * sc, 2, a0, putter(g, null, 0), wirer(g, null)); }
      }
      bulbs.count = halos.count = count;
      bulbs.instanceMatrix.needsUpdate = true;
      phase.needsUpdate = true;
      seenEvent = ''; seenCover = -1; // recolour and re-read who is dressed
      wirePos.fill(0);
    }

    function recolour(L) {
      for (let i = 0; i < count; i++) bulbs.setColorAt(i, c.setHex(L[pal[i] % L.length]));
      if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
    }

    // Who is dressed today: a building once the day's share passes its luck (unless its owner switched it off), a tree
    // once the trees' share does. Shares come from the month's build-up and the town's festive amount (core/festive.js).
    function reread(share, festive) {
      for (let g = 0; g < groups; g++) {
        const want = gLuck[g] < (gTree[g] ? share.trees : share.buildings) && !(ids[g] && isDark(festive, ids[g])) ? 1 : 0;
        // a group that goes up waits its turn first (up to a few seconds), so the street lights up house by house
        if (want && !gWant[g] && gT[g] <= 0) gT[g] = -STAGGER * luck(g, 5);
        gWant[g] = want;
      }
      for (let s = 0; s < segs; s++) {
        const o = s * 6;
        if (gWant[wireGroup[s]]) for (let j = 0; j < 6; j++) wirePos[o + j] = wireFull[o + j];
        else for (let j = 0; j < 6; j++) wirePos[o + j] = 0;
      }
      wireGeo.setDrawRange(0, segs * 2);
      wireGeo.attributes.position.needsUpdate = true;
      settling = true;
    }

    function hide() { bulbs.visible = halos.visible = wire.visible = false; }

    return {
      quality(rs) { effects = rs.effects; },
      frame(f) {
        const state = f.state, ev = eventById(state.event);
        if (!ev) { if (bulbs.visible) hide(); seenRev = -1; seenTrees = null; groups = 0; return; }
        const rev = town.lifeRev() + (sys('lots') ? sys('lots').lifeRev() : 0);
        if (land.poll() || rev !== seenRev || state.trees !== seenTrees) { seenRev = rev; seenTrees = state.trees; build(state); settling = true; }
        if (ev.id !== seenEvent || state.festive !== seenFestive) { seenEvent = ev.id; recolour(lightsFor(ev.id, state.festive)); seenCover = -1; }
        if (state.eventCover !== seenCover || state.festive !== seenFestive) {
          seenCover = state.eventCover; seenFestive = state.festive;
          reread(dressShare(ev.id, seenCover, state.festive), state.festive);
        }
        const night = f.sky ? f.sky.night : 0;
        u.uTime.value = f.t; u.uNight.value = night;
        u.uGain.value = 0.6 * effects;
        bulbs.visible = wire.visible = count > 0;
        halos.visible = count > 0 && night > 0.02 && effects > 0;
        if (!settling) return;
        // ease each group in (or out), and pop its bulbs along the string one after another
        let moving = false;
        const dt = Math.min(0.1, f.dt);
        for (let g = 0; g < groups; g++) {
          const t = gWant[g] ? 1 : 0, cur = gT[g];
          if (cur === t) continue;
          const span = gTree[g] ? 4 : 3;
          const nt = t > cur ? Math.min(t, cur + dt * (cur < 0 ? 1 : POP / span)) : Math.max(t, cur - dt * POP);
          gT[g] = nt; moving = true;
        }
        const a = on.array;
        for (let i = 0; i < count; i++) {
          const g = group[i], tt = Math.max(0, gT[g]);
          // bulb i comes on as the reveal passes its place along the string (strings are ~ 10 to 40 bulbs long)
          const span = gTree[g] ? 40 : 30, x = tt * (span + 4) - (along[i] % span);
          a[i] = x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x) * (1 + 0.6 * Math.sin(x * Math.PI)); // a little overshoot: a pop
        }
        on.needsUpdate = true;
        settling = moving;
      },
    };
  },
};
