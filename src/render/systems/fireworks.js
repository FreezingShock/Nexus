// Fireworks on the Fourth of July and New Year's Eve (state.fireworks): after dark rockets climb from around the middle of
// town and burst into peonies, rings, gold willows and crackles in the event's colours, with a finale near midnight.
// One Points object with additive glow, one draw call while anything is in the air. Graphics: Off launches none, Light
// halves the sparks. Each burst plays a soft distant boom (audio cue 'firework').
import * as THREE from '../../../vendor/three/three.module.min.js';
import { heightAt } from '../../world/terrain.js';
import { eventById } from '../../core/events.js';
import { launch, makePool, showRate, stepPool, SHELLS } from '../festive/fireworks.js';
import { playCue } from '../../audio/cuehub.js';

const VERT = `
attribute float aSize; attribute float aAlpha; attribute vec3 aCol;
uniform float uScale;
varying float vA; varying vec3 vC;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale;
  vA = aAlpha; vC = aCol;
}`;
const FRAG = `
precision mediump float;
varying float vA; varying vec3 vC;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.0, 0.35, d), glow = 1.0 - smoothstep(0.2, 1.0, d);
  float a = (core + glow * 0.55) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(mix(vC, vec3(1.0), core * 0.6), a);
}`;

export default {
  id: 'fireworks',
  create({ world, town, sys }) {
    let effects = 1, acc = 0, alive = 0, sites = null, seenRev = -1;
    const pool = makePool();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pool.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCol', new THREE.BufferAttribute(pool.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(pool.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(pool.outSize, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: Math.min(2, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1) } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false; points.renderOrder = 5; points.visible = false;
    world.add(points);

    // Where rockets go up from: the middle of the town's buildings, spread over a disc that grows with the town.
    function siteOf() {
      const lots = sys('lots');
      const list = town.lifeEntries().concat(lots ? lots.lifeEntries() : []);
      if (!list.length) return { x: 0, z: 0, r: 8 };
      let sx = 0, sz = 0;
      for (const e of list) { sx += e.world.elements[12]; sz += e.world.elements[14]; }
      const x = sx / list.length, z = sz / list.length;
      let r2 = 0;
      for (const e of list) r2 += (e.world.elements[12] - x) ** 2 + (e.world.elements[14] - z) ** 2;
      return { x, z, r: Math.max(6, Math.min(30, Math.sqrt(r2 / list.length))) };
    }

    return {
      quality(rs) { effects = rs.effects; },
      frame(f) {
        const s = f.state, ev = eventById(s.event), night = f.sky ? f.sky.night : 0;
        const rate = s.fireworks && ev && effects > 0 ? showRate(s.hour, night) : 0;
        if (!rate && !alive) { if (points.visible) points.visible = false; acc = 0; return; }
        const dt = Math.min(f.dt, 0.1);
        if (rate) {
          const rev = town.lifeRev() + (sys('lots') ? sys('lots').lifeRev() : 0);
          if (rev !== seenRev || !sites) { seenRev = rev; sites = siteOf(); }
          acc += dt * rate;
          while (acc >= 1) {
            acc -= 1 + (Math.random() - 0.5) * 0.6; // a little uneven, like people lighting fuses
            const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * sites.r;
            const x = sites.x + Math.cos(a) * d, z = sites.z + Math.sin(a) * d;
            const colours = ev.lights.concat([0xF2D27A]);
            launch(pool, x, heightAt(x, z) + 1, z, 16 + Math.random() * 12, colours[Math.floor(Math.random() * colours.length)], Math.floor(Math.random() * SHELLS.length));
            playCue('firework-launch');
          }
        }
        const r = stepPool(pool, dt, Math.random, effects, f.t);
        alive = r.alive;
        if (r.bursts) playCue('firework', { n: r.bursts });
        for (const k of ['position', 'aCol', 'aAlpha', 'aSize']) geo.attributes[k].needsUpdate = true;
        points.visible = alive > 0;
      },
    };
  },
};
