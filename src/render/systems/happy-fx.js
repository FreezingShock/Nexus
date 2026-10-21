// Little hearts and sparkles that rise from the homes a new service, park or shop has made happier. One Points object,
// a fixed pool of particles stepped on the CPU, and one draw call while anything is rising (none when idle).
// Cosmetic only: it reads nothing from the sim and never writes to it. The UI decides when to burst (see ui/modules/services.js).
//
// API for UI modules (scene.sys('happy-fx')):
//   burst(gains)   gains is a list of [gx, gz, gain] (grid tiles). Each home rises a heart, and some a sparkle too.
//   clear()        drops everything at once
import * as THREE from '../../../vendor/three/three.module.min.js';
import { TILE, GRID_HALF } from '../../world/grid.js';
import { heightAt } from '../../world/terrain.js';

export const POOL = 40;        // particles alive at once; the oldest is reused when a burst needs room
export const LIFE_S = 2.2;     // seconds a particle lives
const MAX_HOMES = 18;          // homes that get a heart from one burst, the biggest gains first
const STAGGER_S = 0.07;        // gap between homes, so the hearts ripple outward rather than appear together
const SPARKLE_CHANCE = 0.35;

const VERT = `
attribute float aSize;
attribute float aAlpha;
attribute float aKind;
uniform float uScale;
varying float vA;
varying float vK;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale;
  vA = aAlpha; vK = aKind;
}`;

const FRAG = `
precision mediump float;
varying float vA;
varying float vK;
// Inigo Quilez's 2D heart, with the tip pointing down. Inside the shape the distance is negative.
float sdHeart(vec2 p){
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return length(p - vec2(0.25, 0.75)) - sqrt(2.0) / 4.0;
  float h = max(p.x + p.y, 0.0) * 0.5;
  return sqrt(min(dot(p - vec2(0.0, 1.0), p - vec2(0.0, 1.0)), dot(p - vec2(h), p - vec2(h)))) * sign(p.x - p.y);
}
void main(){
  vec2 p = (gl_PointCoord - 0.5) * 2.2;
  p.y = -p.y;
  float heart = 1.0 - smoothstep(-0.02, 0.08, sdHeart(p));
  vec2 q = abs(p);
  float arm = max(smoothstep(0.14, 0.0, q.x) * (1.0 - q.y), smoothstep(0.14, 0.0, q.y) * (1.0 - q.x));
  float sparkle = clamp(arm + smoothstep(0.34, 0.0, length(p)), 0.0, 1.0);
  float shape = mix(heart, sparkle, vK);
  vec3 col = mix(vec3(0.851, 0.451, 0.357), vec3(0.949, 0.757, 0.306), vK); // terracotta hearts, warm gold sparkles
  float a = shape * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
}`;

// The pool as plain arrays. age < 0 means a free slot. Pure: no THREE, so the tests can step it.
export function makePool(n = POOL) {
  return {
    n, next: 0,
    age: new Float32Array(n).fill(-1), life: new Float32Array(n),
    bx: new Float32Array(n), by: new Float32Array(n), bz: new Float32Array(n),
    sway: new Float32Array(n), phase: new Float32Array(n), rise: new Float32Array(n),
    kind: new Float32Array(n), size: new Float32Array(n),
    pos: new Float32Array(n * 3), alpha: new Float32Array(n), outSize: new Float32Array(n), outKind: new Float32Array(n),
  };
}

// Puts one particle at (x, y, z). Takes a free slot, or reuses the oldest when the pool is full.
export function emitInto(pool, x, y, z, kind, rnd = Math.random) {
  let slot = -1, oldest = -1, oldestAge = -1;
  for (let k = 0; k < pool.n; k++) {
    const i = (pool.next + k) % pool.n;
    if (pool.age[i] < 0) { slot = i; break; }
    if (pool.age[i] > oldestAge) { oldestAge = pool.age[i]; oldest = i; }
  }
  const i = slot >= 0 ? slot : oldest;
  pool.next = (i + 1) % pool.n;
  pool.age[i] = 0;
  pool.life[i] = LIFE_S * (0.85 + 0.3 * rnd());
  pool.bx[i] = x + (rnd() - 0.5) * 1.0;
  pool.by[i] = y + rnd() * 0.8;
  pool.bz[i] = z + (rnd() - 0.5) * 1.0;
  pool.sway[i] = 0.5 + rnd() * 0.6;
  pool.phase[i] = rnd() * Math.PI * 2;
  pool.rise[i] = 1.4 + rnd() * 0.8;
  pool.kind[i] = kind;
  pool.size[i] = kind > 0.5 ? 11 : 15;
}

// Moves every live particle by dt seconds and fills the output arrays. Returns how many are alive.
export function stepPool(pool, dt) {
  let alive = 0;
  for (let i = 0; i < pool.n; i++) {
    if (pool.age[i] < 0) { pool.alpha[i] = 0; pool.outSize[i] = 0; continue; }
    const a = pool.age[i] + dt;
    if (a >= pool.life[i]) { pool.age[i] = -1; pool.alpha[i] = 0; pool.outSize[i] = 0; continue; }
    pool.age[i] = a;
    alive++;
    const left = pool.life[i] - a;
    pool.pos[i * 3] = pool.bx[i] + pool.sway[i] * Math.sin(a * 2.4 + pool.phase[i]);
    pool.pos[i * 3 + 1] = pool.by[i] + pool.rise[i] * a;
    pool.pos[i * 3 + 2] = pool.bz[i];
    pool.alpha[i] = Math.min(a / 0.25, 1) * Math.min(left / 0.6, 1);
    pool.outSize[i] = pool.size[i] * (0.7 + 0.3 * Math.min(a / 0.2, 1));
    pool.outKind[i] = pool.kind[i];
  }
  return alive;
}

export default {
  id: 'happy-fx',
  create({ world }) {
    const pool = makePool();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pool.pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(pool.outSize, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(pool.alpha, 1));
    geo.setAttribute('aKind', new THREE.BufferAttribute(pool.outKind, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: Math.min(2, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1) } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false; points.renderOrder = 4; points.visible = false;
    world.add(points);

    let pending = [];   // { t, x, y, z, kind } waiting for their stagger to pass
    let alive = 0;

    return {
      burst(gains) {
        const homes = gains.slice(0, MAX_HOMES);
        homes.forEach(([gx, gz], k) => {
          const x = (gx - GRID_HALF) * TILE, z = (gz - GRID_HALF) * TILE;
          const y = heightAt(x, z) + 4.5;
          pending.push({ t: k * STAGGER_S, x, y, z, kind: 0 });
          if (Math.random() < SPARKLE_CHANCE) pending.push({ t: k * STAGGER_S + 0.15, x, y: y + 0.6, z, kind: 1 });
        });
        points.visible = true;
      },
      clear() { pending = []; alive = 0; points.visible = false; },
      frame(f) {
        if (!pending.length && !alive) return;
        const dt = Math.min(f.dt, 0.1);
        for (const p of pending) p.t -= dt;
        pending = pending.filter((p) => {
          if (p.t > 0) return true;
          emitInto(pool, p.x, p.y, p.z, p.kind);
          return false;
        });
        alive = stepPool(pool, dt);
        geo.attributes.position.needsUpdate = true;
        geo.attributes.aSize.needsUpdate = true;
        geo.attributes.aAlpha.needsUpdate = true;
        geo.attributes.aKind.needsUpdate = true;
        points.visible = alive > 0 || pending.length > 0;
      },
    };
  },
};
