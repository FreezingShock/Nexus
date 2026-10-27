// Open-space builders: greens, plazas, playgrounds, ponds, rose gardens, town squares and orchards. Parks are ground, not
// buildings, so every one reads only the footprint (k.w x k.dep) and its fixed traits, never a level. One builder draws every
// size it offers: furniture counts and the middle piece (fountain, bandstand, sundial) grow with the lot.
// Colours come from the kit's palette (C); trees and benches share small helpers so the family looks like one hand drew it.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { AWNINGS } from '../../world/palettes.js';
import { LANG } from '../../world/models.js';
import { makeRng } from '../../world/rng.js';
import { C } from './kit.js';

const { PLINTH } = LANG;
const G = PLINTH + 0.06;                       // top of a lawn or paving slab
const TILE_W = 3;
const tilesOf = (k) => [Math.max(1, Math.round(k.w / TILE_W)), Math.max(1, Math.round(k.dep / TILE_W))];
const BLOOM = [0xD98C7A, 0xF1DFA8, 0xCBC3DC, 0xE9C1B8, 0xFAF3E4];
const BLOSSOM = 0xE7B9B0, APPLE = 0xB8574A;

// where a point in the park's own frame faces the middle: a bench's front
const faceMiddle = (x, z) => Math.atan2(-x, -z);
// a point (lx, lz) in a group's own frame, turned by `a` quarter... radians, then moved to (x, z)
const spin = (a, lx, lz) => [lx * Math.cos(a) + lz * Math.sin(a), -lx * Math.sin(a) + lz * Math.cos(a)];

const lawn = (k, color = C.leaf) => k.box(k.w, 0.06, k.dep, 0, PLINTH, 0, color, { edge: false });
const rngOf = (k) => makeRng((k.d.seed ^ 0x51ED270B) | 0);
// a rectangle of the lot that furniture keeps out of: { x, z, hw, hd }
const clear = (list, x, z, hw, hd) => list.push({ x, z, hw, hd });
const hit = (list, x, z, r) => list.some((a) => Math.abs(x - a.x) < a.hw + r && Math.abs(z - a.z) < a.hd + r);

// up to n points on the lot, at least minDist apart and `margin` from the edge, off the cleared rectangles
function scatter(rng, n, k, margin, minDist, avoid, r = 0.4) {
  const out = [], hw = k.w / 2 - margin, hd = k.dep / 2 - margin;
  for (let i = 0; i < n * 40 && out.length < n; i++) {
    const x = (rng() * 2 - 1) * hw, z = (rng() * 2 - 1) * hd;
    if (hit(avoid, x, z, r) || out.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < minDist)) continue;
    out.push([x, z]);
  }
  return out;
}

// A low-poly crown: a flat-shaded icosahedron, 20 triangles, so a big park can hold a dozen trees.
const puff = (k, x, y, z, r, color, rng) => k.part(new THREE.IcosahedronGeometry(r, 0), color, x, y + r * 0.85, z, { sy: 0.85, ry: rng ? rng() * 6 : 0 });

// kind 0 round, 1 conifer, 2 blossom; y0 is where the trunk starts
function tree(k, x, z, s = 1, kind = 0, rng, y0 = G) {
  k.cyl(0.06 * s, 0.09 * s, 0.6 * s, 5, x, y0, z, C.wood, { edge: false });
  if (kind === 1) {
    k.cyl(0, 0.5 * s, 0.85 * s, 6, x, y0 + 0.35 * s, z, C.moss);
    k.cyl(0, 0.36 * s, 0.65 * s, 6, x, y0 + 0.95 * s, z, C.leaf);
  } else puff(k, x, y0 + 0.4 * s, z, 0.55 * s, kind === 2 ? BLOSSOM : s > 0.9 ? C.leaf : C.moss, rng);
}

// a bench whose front faces direction `a` (see faceMiddle); y0 is the surface it stands on
function bench(k, x, z, a, y0 = G) {
  const p = (lx, lz) => { const [dx, dz] = spin(a, lx, lz); return [x + dx, z + dz]; }, bk = ([bx, bz]) => [bx, y0 + 0.25, bz];
  k.box(0.9, 0.05, 0.3, x, y0 + 0.2, z, C.wood, { ry: a, edge: false });
  k.box(0.9, 0.2, 0.05, ...bk(p(0, -0.13)), C.wood, { ry: a, edge: false });
  k.box(0.7, 0.2, 0.18, x, y0, z, C.slate, { ry: a, edge: false });
}

const lampAt = (k, x, z, h = 1.0, y0 = G) => {
  k.cyl(0.045, 0.05, h, 4, x, y0, z, C.slate, { edge: false });
  k.box(0.2, 0.24, 0.2, x, y0 + h, z, C.lamp, { edge: false });
};

// a flower bed: a moss border and a block of blooms. `n` of tiny blooms scattered on top for the larger ones
function bed(k, x, z, w, d, rng, blooms = 0) {
  k.box(w, 0.12, d, x, G, z, C.moss, { edge: false });
  const c = BLOOM[Math.floor(rng() * BLOOM.length)];
  k.box(w - 0.14, 0.08, d - 0.14, x, G + 0.12, z, c, { edge: false });
  const put = [];
  for (let i = 0; i < blooms * 6 && put.length < blooms; i++) {   // blooms keep apart, so none shares a face with another
    const bx = x + (rng() - 0.5) * (w - 0.3), bz = z + (rng() - 0.5) * (d - 0.3);
    if (put.some(([ox, oz]) => Math.hypot(ox - bx, oz - bz) < 0.26)) continue;
    put.push([bx, bz]);
    k.box(0.14, 0.12, 0.14, bx, G + 0.2, bz, BLOOM[Math.floor(rng() * BLOOM.length)], { edge: false });
  }
}

// A stone basin with water proud of its rim, a pedestal and a bowl with a jet. r is the basin's radius.
function fountain(k, x, z, r, y0 = G) {
  const rim = 0.24;
  k.cyl(r, r + 0.05, rim, 10, x, y0, z, C.stone);
  k.cyl(r - 0.15, r - 0.15, 0.04, 10, x, y0 + rim - 0.02, z, C.water, { edge: false });
  const ped = 0.4 + r * 0.25;
  k.cyl(0.1, 0.15, ped, 6, x, y0 + rim, z, C.stone);
  k.cyl(r * 0.42, 0.16, 0.14, 8, x, y0 + rim + ped - 0.04, z, C.stone);
  k.cyl(r * 0.42 - 0.1, r * 0.42 - 0.1, 0.03, 8, x, y0 + rim + ped + 0.08, z, C.water, { edge: false });
  k.spire(0.09, 0.35, x, y0 + rim + ped + 0.1, z, C.water, { edge: false });
}

// a square planter with a tree in it
function planter(k, x, z, rng, s = 0.8, kind = 0) {
  k.box(0.95, 0.26, 0.95, x, G, z, C.stone);
  k.box(0.8, 0.04, 0.8, x, G + 0.25, z, C.moss, { edge: false });
  tree(k, x, z, s, kind, rng, G + 0.28);
}

// hedge strip, sized in the park's frame; the cap is inset so crossing hedges never share a plane
function hedge(k, w, d, x, z) {
  k.box(w, 0.42, d, x, G, z, C.moss, { edge: false });
  k.box(w - 0.08, 0.08, d - 0.08, x, G + 0.42, z, C.leaf, { edge: false });
}

// paving: a slab with a stone kerb round its edge and a lighter inlay
function paving(k, inlay = true) {
  k.box(k.w - 0.04, 0.06, k.dep - 0.04, 0, PLINTH, 0, C.paper, { edge: false });   // a hair inside the kerb, so no side face is shared
  const b = 0.2, h = 0.075;
  k.box(k.w, h, b, 0, PLINTH, -(k.dep - b) / 2, C.stone, { edge: false });
  k.box(k.w, h, b, 0, PLINTH, (k.dep - b) / 2, C.stone, { edge: false });
  k.box(b, h, k.dep - 2 * b, -(k.w - b) / 2, PLINTH, 0, C.stone, { edge: false });
  k.box(b, h, k.dep - 2 * b, (k.w - b) / 2, PLINTH, 0, C.stone, { edge: false });
  if (inlay && k.w > 3 && k.dep > 3) k.box(k.w - 1.2, 0.015, k.dep - 1.2, 0, G, 0, C.cream, { edge: false });
}

export const PARK_BUILDERS = {
  // ---- Green: lawn, a path, trees and a bench; a bigger lot gets stripes, a cross path, beds and more trees ----
  green(k) {
    const [A, B] = tilesOf(k), n = A * B, rng = rngOf(k), avoid = [];
    lawn(k);
    if (n >= 4) for (let i = 1; i < A * 2; i += 2) k.box(k.w / (A * 2), 0.015, k.dep, -k.w / 2 + (i + 0.5) * k.w / (A * 2), G, 0, 0xB4CB86, { edge: false }); // mown stripes
    let px = 0;
    if (n >= 2) {
      px = (rng() - 0.5) * k.w * 0.25;
      k.box(0.55, 0.025, k.dep - 0.2, px, G, 0, C.paper, { edge: false });
      clear(avoid, px, 0, 0.45, k.dep / 2);
      if (n >= 4) {
        const pz = (rng() - 0.5) * k.dep * 0.25, l = px - 0.275 - (-k.w / 2 + 0.1), r = k.w / 2 - 0.1 - (px + 0.275);
        k.box(l, 0.025, 0.55, -k.w / 2 + 0.1 + l / 2, G, pz, C.paper, { edge: false });
        k.box(r, 0.025, 0.55, px + 0.275 + r / 2, G, pz, C.paper, { edge: false });
        clear(avoid, 0, pz, k.w / 2, 0.45);
      }
    }
    const benches = n >= 6 ? 3 : n >= 3 ? 2 : 1;
    for (let i = 0; i < benches; i++) {
      const side = i % 2 ? -1 : 1, z = n >= 2 ? (-0.55 + i * 0.5) * k.dep * 0.5 : -k.dep * 0.3;
      const x = n >= 2 ? px + side * 0.62 : k.w * 0.1;
      bench(k, x, z, n >= 2 ? -side * Math.PI / 2 : 0);
      clear(avoid, x, z, 0.5, 0.4);
    }
    const nb = n >= 4 ? 2 : 1;
    for (const [x, z] of scatter(rng, nb, k, 0.7, 1.3, avoid, 0.4)) { bed(k, x, z, 0.8, 0.6, rng, n >= 4 ? 3 : 0); clear(avoid, x, z, 0.5, 0.4); }
    const trees = Math.min(9, Math.round(n * 0.9) + 1);
    for (const [x, z] of scatter(rng, trees, k, 0.6, n >= 4 ? 1.1 : 1.0, avoid, 0.5)) {
      const r = rng(); tree(k, x, z, 0.65 + rng() * 0.45, r < 0.6 ? 0 : r < 0.8 ? 1 : 2, rng);
    }
  },

  // ---- Plaza: paving with a kerb. One tile gets a planter, a bench and a lamp; bigger ones a fountain with benches and lamps round it ----
  plaza(k) {
    const [A, B] = tilesOf(k), n = A * B, rng = rngOf(k);
    paving(k, n >= 4);
    if (n === 1) {
      planter(k, 0, -0.45, rng, 0.8);
      bench(k, 0, 0.7, Math.PI);
      lampAt(k, k.w / 2 - 0.4, 0.55, 0.9);
      return;
    }
    const R = Math.min(2.0, Math.min(k.w, k.dep) * 0.2 + (n >= 9 ? 0.25 : 0));
    fountain(k, 0, 0, R);
    const lx = k.w / 2 - 0.45, lz = k.dep / 2 - 0.45;
    for (const [sx, sz] of [[-1, 1], [1, 1], ...(n >= 6 ? [[-1, -1], [1, -1]] : [])]) lampAt(k, sx * lx, sz * lz, 1.0);
    const bx = k.w / 2 - 0.9;
    for (const sx of [-1, 1]) bench(k, sx * bx, 0, faceMiddle(sx * bx, 0));
    if (n >= 6) for (const sz of [-1, 1]) { const z = sz * (k.dep / 2 - 0.85); bench(k, 0, z, faceMiddle(0, z)); }
    planter(k, -(k.w / 2 - 1.0), -(k.dep / 2 - 1.0), rng, 0.85, 2);
    planter(k, k.w / 2 - 1.0, -(k.dep / 2 - 1.0), rng, 0.85, 0);
    if (n >= 6) { planter(k, -(k.w / 2 - 1.0), (k.dep / 2 - 1.2) * (n >= 9 ? 0.5 : 0.35), rng, 0.8, 0); planter(k, k.w / 2 - 1.0, (k.dep / 2 - 1.2) * (n >= 9 ? 0.5 : 0.35), rng, 0.8, 2); }
  },

  // ---- Playground: swings first (the town's children use them), then a sandbox, a slide, a seesaw and a roundabout as the lot grows ----
  playground(k) {
    const [A, B] = tilesOf(k), n = A * B, rng = rngOf(k);
    lawn(k);
    const sz = -k.dep / 2 + (n === 1 ? 0.95 : 0.9), top = PLINTH + 1.2, sw = n >= 4 ? 0.8 : 0.7;
    const sx0 = n >= 4 ? -k.w * 0.2 : 0;
    for (const sx of [-1, 1]) k.cyl(0.05, 0.05, 1.2, 5, sx0 + sx * sw, PLINTH, sz, C.slate, { edge: false });
    k.box(sw * 2 + 0.2, 0.08, 0.1, sx0, top, sz, C.slate, { edge: false });
    for (const sx of [-0.25, 0.25]) {
      k.box(0.28, 0.05, 0.18, sx0 + sx, PLINTH + 0.55, sz, C.wood, { edge: false });
      for (const c of [-0.1, 0.1]) k.box(0.02, 0.6, 0.02, sx0 + sx + c, PLINTH + 0.6, sz, C.slate, { edge: false });
      k.sites.swings.push({ x: sx0 + sx, z: sz, top });
    }
    // sandbox: a wood frame with the sand proud of it
    const sbx = n === 1 ? 0 : -k.w * 0.22, sbz = n === 1 ? 0.62 : k.dep / 2 - 1.0;
    k.box(1.3, 0.14, 1.0, sbx, G, sbz, C.wood, { edge: false });
    k.box(1.1, 0.04, 0.8, sbx, G + 0.12, sbz, C.gold, { edge: false });
    if (n >= 2) {   // a slide: a wooden tower and a yellow chute running down toward the front
      const tx = n >= 4 ? k.w * 0.18 : 0.4, tz = n >= 4 ? -k.dep * 0.05 : -0.1, th = 0.85;
      k.box(0.6, th, 0.6, tx, G, tz, C.wood);
      k.box(0.7, 0.07, 0.7, tx, G + th, tz, C.terracotta, { edge: false });
      const ang = Math.atan2(th, 1.25), len = Math.hypot(th, 1.25);
      k.box(0.42, 0.05, len, tx, G + th * 0.5, tz + 0.3 + 0.625, C.gold, { rx: ang, edge: false });
    }
    if (n >= 4) {   // a seesaw and a roundabout, and a low hedge round the lot with a gap at the front
      k.box(0.12, 0.28, 0.2, k.w * 0.18, G, k.dep * 0.28, C.slate, { edge: false });
      k.box(0.3, 0.07, 1.5, k.w * 0.18, G + 0.34, k.dep * 0.28, C.terracotta, { rx: 0.18, edge: false });
      k.cyl(0.07, 0.07, 0.25, 5, -k.w * 0.2, G, k.dep * 0.03, C.slate, { edge: false });
      k.cyl(0.62, 0.62, 0.08, 8, -k.w * 0.2, G + 0.25, k.dep * 0.03, C.rose);
      k.cyl(0.1, 0.1, 0.1, 5, -k.w * 0.2, G + 0.33, k.dep * 0.03, C.cream, { edge: false });
      hedge(k, k.w - 0.5, 0.3, 0, -k.dep / 2 + 0.2);
      for (const s of [-1, 1]) hedge(k, 0.3, k.dep - 1.4, s * (k.w / 2 - 0.2), -0.1);
      bench(k, k.w / 2 - 0.9, k.dep / 2 - 0.9, faceMiddle(k.w / 2 - 0.9, k.dep / 2 - 0.9));
    } else if (n >= 2) {
      tree(k, -k.w * 0.3, k.dep * 0.35, 0.75, 0, rng);
    } else tree(k, k.w / 2 - 0.55, -0.1, 0.65, 0, rng);
  },

  // ---- Pond: an oval of water in a stone rim with pads, reeds, ducks and a bench; a big one gets a jetty ----
  pond(k) {
    const [A, B] = tilesOf(k), n = A * B, rng = rngOf(k);
    lawn(k);
    const rx = k.w * 0.36, rz = k.dep * 0.36, top = PLINTH + 0.16;
    k.cyl(1, 1, 0.14, 18, 0, PLINTH, 0, C.stone, { sx: rx + 0.14, sz: rz + 0.14 });          // stone rim
    k.cyl(1, 1, 0.04, 18, 0, PLINTH + 0.12, 0, C.water, { sx: rx, sz: rz, edge: false });    // proud of the rim's top by 0.02
    const pads = [];
    for (let i = 0; i < 40 && pads.length < (n >= 6 ? 5 : 3); i++) {   // lily pads, some in flower, never touching
      const a = rng() * 6.283, d = 0.25 + rng() * 0.45, x = Math.cos(a) * rx * d, z = Math.sin(a) * rz * d;
      if (pads.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < 0.5)) continue;
      pads.push([x, z]);
      k.cyl(0.2, 0.2, 0.02, 6, x, top, z, C.leaf, { edge: false });
      if (rng() < 0.5) k.box(0.1, 0.07, 0.1, x + 0.03, top + 0.02, z, C.rose, { edge: false });
    }
    const jetty = n >= 6 ? { x: -rx * 0.45, z: -rz + 1.0 } : null;   // reeds keep clear of the jetty
    for (let i = 0; i < (n >= 6 ? 4 : 3); i++) {   // reed clumps on the bank
      const a = 3.6 + i * (n >= 6 ? 0.55 : 0.9) + rng() * 0.2, x = Math.cos(a) * (rx + 0.3), z = Math.sin(a) * (rz + 0.3);
      if (jetty && Math.abs(x - jetty.x) < 0.9 && Math.abs(z - jetty.z) < 1.4) continue;
      for (const [ox, oz, h] of [[0, 0, 0.62], [0.1, 0.06, 0.5]]) {
        k.cyl(0.025, 0.025, h, 3, x + ox, PLINTH + 0.1, z + oz, C.leaf, { edge: false });
        k.cyl(0.045, 0.045, 0.16, 4, x + ox, PLINTH + 0.1 + h - 0.04, z + oz, C.wood, { edge: false });
      }
    }
    for (let i = 0; i < (n >= 9 ? 3 : n >= 4 ? 2 : 1); i++) {   // ducks
      const a = 0.6 + i * 2.1 + rng(), d = 0.35 + rng() * 0.3, x = Math.cos(a) * rx * d, z = Math.sin(a) * rz * d, ry = rng() * 6;
      const [hx, hz] = spin(ry, 0, 0.17), [bx, bz] = spin(ry, 0, 0.27);
      k.part(new THREE.IcosahedronGeometry(0.15, 0), C.cream, x, top + 0.1, z, { sz: 1.4, ry });
      k.part(new THREE.IcosahedronGeometry(0.08, 0), C.cream, x + hx, top + 0.2, z + hz, { ry });
      k.box(0.06, 0.03, 0.08, x + bx, top + 0.19, z + bz, C.gold, { ry, edge: false });
    }
    for (const [fx, fz, r] of [[0.8, -0.95, 0.2], [-0.95, 0.5, 0.16]]) k.box(r * 1.8, r, r * 1.5, fx * (rx + 0.1), PLINTH + 0.1, fz * (rz + 0.1), C.stone, { ry: fx * 3 });   // rocks on the bank
    bench(k, k.w * 0.18, k.dep / 2 - 0.4, 0, PLINTH + 0.06);
    if (jetty) {   // a jetty from the bank out over the water
      const jx = jetty.x;
      k.box(0.8, 0.07, 2.0, jx, PLINTH + 0.24, -rz + 1.0, C.wood, { edge: false });
      for (const s of [-1, 1]) for (const z of [-rz + 0.1, -rz + 1.9]) k.cyl(0.05, 0.05, 0.3, 4, jx + s * 0.32, PLINTH + 0.05, z, C.slate, { edge: false });
    }
    tree(k, -k.w / 2 + 0.7, k.dep / 2 - 0.7, 1.05, 0, rng, G);
    if (n >= 6) tree(k, k.w / 2 - 0.7, -k.dep / 2 + 0.7, 0.9, 2, rng, G);
  },

  // ---- Rose garden: a hedge ring open at the front with a rose arch, cross paths, four beds and a sundial or a gazebo ----
  garden(k) {
    const [A, B] = tilesOf(k), n = A * B, rng = rngOf(k);
    lawn(k, 0xA0BA6F);
    const hw = k.w / 2, hd = k.dep / 2, gap = 1.1, big = n >= 9;
    hedge(k, k.w - 0.3, 0.38, 0, -hd + 0.28);
    const sideLen = k.dep - 0.94, fw = hw - 0.47 - gap / 2;
    for (const s of [-1, 1]) { hedge(k, 0.38, sideLen, s * (hw - 0.28), 0); hedge(k, fw, 0.38, s * (gap / 2 + fw / 2), hd - 0.28); }
    // paths: from the gate to the middle and across; the middle is a stone disc the paths run under
    const mid = big ? 1.25 : 0.7, gz = hd - 0.2;
    k.box(0.55, 0.025, gz - mid, 0, G, (gz + mid) / 2, C.paper, { edge: false });
    const arm = hw - 0.45 - mid;
    for (const s of [-1, 1]) k.box(arm, 0.025, 0.55, s * (mid + arm / 2), G, 0, C.paper, { edge: false });
    k.cyl(mid, mid, 0.05, 8, 0, G, 0, C.paper, { edge: false });
    // four beds, one in each quarter, inside the hedge
    const b0 = big ? 1.3 : 0.55, bw = hw - 0.67 - b0, bd = hd - 0.67 - b0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bed(k, sx * (b0 + bw / 2), sz * (b0 + bd / 2), bw, bd, rng, 3 + Math.floor(bw * bd * 1.2));
    if (big) {   // a gazebo over the middle
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.1, 1.3, 0.1, sx * 0.85, G + 0.05, sz * 0.85, C.wood, { edge: false });
      k.cyl(0.02, 1.4, 0.65, 8, 0, G + 1.35, 0, k.P.roof);
      k.box(0.1, 0.3, 0.1, 0, G + 2.0, 0, C.gold, { edge: false });
      bench(k, 0, -0.55, 0, G + 0.05);
    } else {   // a sundial
      k.cyl(0.12, 0.16, 0.5, 6, 0, G + 0.05, 0, C.stone);
      k.cyl(0.28, 0.28, 0.06, 8, 0, G + 0.55, 0, C.stone);
      k.box(0.04, 0.2, 0.3, 0, G + 0.61, 0, C.gold, { rx: -0.5, edge: false });
    }
    // a rose arch at the gate
    for (const s of [-1, 1]) { k.box(0.09, 1.35, 0.09, s * 0.6, G, hd - 0.28, C.wood, { edge: false }); k.box(0.22, 0.4, 0.22, s * 0.6, G + 0.4, hd - 0.28, C.leaf, { edge: false }); }
    k.box(1.4, 0.09, 0.12, 0, G + 1.35, hd - 0.28, C.wood, { edge: false });
    k.box(0.7, 0.12, 0.2, 0, G + 1.44, hd - 0.28, C.rose, { edge: false });
  },

  // ---- Town square: a big paved floor. Three tiles across get a bandstand; narrower ones a clock column and two stalls ----
  square(k) {
    const [A, B] = tilesOf(k), rng = rngOf(k), wide = Math.min(A, B) >= 3;
    paving(k, true);
    const px = k.w / 2 - 1.0, pz = k.dep / 2 - 1.0;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lampAt(k, sx * (k.w / 2 - 0.45), sz * (k.dep / 2 - 0.45), 1.05);
    if (wide) {
      // the bandstand: an eight-sided stage, six posts, a conical roof with a flag
      k.cyl(1.55, 1.6, 0.24, 8, 0, G, 0, C.stone);
      k.cyl(1.4, 1.4, 0.03, 8, 0, G + 0.24, 0, C.wood, { edge: false });
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; k.box(0.1, 1.2, 0.1, Math.cos(a) * 1.25, G + 0.27, Math.sin(a) * 1.25, C.cream, { edge: false }); }
      k.cyl(0.02, 1.75, 0.75, 8, 0, G + 1.47, 0, k.P.roof);
      k.flag(0, G + 2.1, 0);
      k.box(1.0, 0.12, 0.35, 0, G, 1.75, C.stone, { edge: false });   // steps
      for (const [sx, sz, kind] of [[-1, -1, 0], [1, -1, 2], [-1, 1, 2], [1, 1, 0]]) planter(k, sx * px, sz * pz, rng, 0.85, kind);
      for (const sx of [-1, 1]) bench(k, sx * (px - 0.1), 0, faceMiddle(sx * (px - 0.1), 0));
      bench(k, 0, -pz, faceMiddle(0, -pz));
    } else {
      // a clock column in the middle with two stalls under striped awnings at the back
      k.box(0.8, 0.45, 0.8, 0, G, 0, C.stone);
      k.cyl(0.2, 0.26, 1.7, 8, 0, G + 0.45, 0, C.cream);
      k.disc(0.3, 0, G + 1.85, 0.12, C.cream, { thick: 0.1 });
      k.disc(0.22, 0, G + 1.85, 0.18, C.glass, { thick: 0.06, edge: false });
      k.cyl(0.14, 0.2, 0.28, 6, 0, G + 2.15, 0, C.lamp, { edge: false });
      for (const sx of [-1, 1]) {
        const x = sx * (k.w / 2 - 1.3), z = -k.dep / 2 + 1.1, col = AWNINGS[(Math.floor(k.t[5] * AWNINGS.length) + (sx > 0 ? 1 : 0)) % AWNINGS.length];
        k.box(1.3, 0.55, 0.6, x, G, z, C.wood);
        for (const dx of [-0.6, 0.6]) k.box(0.06, 1.25, 0.06, x + dx, G, z - 0.3, C.slate, { edge: false });
        k.box(1.5, 0.07, 1.0, x, G + 1.2, z + 0.05, col, { rx: 0.2 });
        k.box(0.3, 0.2, 0.3, x - 0.3, G + 0.55, z, C.gold, { edge: false });
      }
      for (const sx of [-1, 1]) planter(k, sx * (k.w / 2 - 1.0), k.dep / 2 - 1.3, rng, 0.8, sx > 0 ? 2 : 0);
      for (const sx of [-1, 1]) bench(k, sx * 1.5, 1.6, faceMiddle(sx * 1.5, 1.6));
    }
  },

  // ---- Orchard: rows of fruit trees with mown lanes between them and a beehive in the corner ----
  orchard(k) {
    const [A, B] = tilesOf(k), rng = rngOf(k), spring = k.t[3] < 0.5;
    lawn(k, 0xA8BE78);
    const nx = Math.max(2, Math.round(k.w / 2.0)), nz = Math.max(2, Math.round(k.dep / 2.0));
    const sx = (k.w - 1.2) / (nx - 1), sz = (k.dep - 2.3) / (nz - 1);   // the front row stays clear of the hive
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = -k.w / 2 + 0.6 + i * sx + (j % 2 ? sx * 0.12 : -sx * 0.12), z = -k.dep / 2 + 0.7 + j * sz, s = 0.8 + rng() * 0.3;
      k.cyl(0.06 * s, 0.09 * s, 0.6 * s, 5, x, G, z, C.wood, { edge: false });
      puff(k, x, G + 0.38 * s, z, 0.52 * s, spring ? BLOSSOM : C.leaf, rng);
      if (!spring && (i + j) % 2 === 0) for (const [fx, fz] of [[0.3, 0.25], [-0.25, 0.3]]) k.box(0.1, 0.1, 0.1, x + fx * s, G + 0.5 * s, z + fz * s, APPLE, { edge: false });
    }
    // a beehive and a crate of apples at the front corner, a bench on the other
    const hx = k.w / 2 - 0.6, hz = k.dep / 2 - 0.5;
    k.box(0.5, 0.3, 0.5, hx, G, hz, C.gold);
    k.box(0.58, 0.07, 0.58, hx, G + 0.3, hz, C.terracotta, { edge: false });
    k.box(0.5, 0.25, 0.4, hx - 0.8, G, hz, C.wood);
    k.box(0.4, 0.04, 0.3, hx - 0.8, G + 0.23, hz, APPLE, { edge: false });
  },
};
