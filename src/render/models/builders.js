// One builder per model. A builder reads a kit (see kit.js) and adds parts; it never rolls its own random numbers,
// it reads the building's fixed traits (k.t), so the same seed always builds the same house.
// Level details (window boxes, chimneys, dormers, bunting) come from decorate(), except where a model has its own.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { AWNINGS, CROPS } from '../../world/palettes.js';
import { LANG, modelById } from '../../world/models.js';
import { PARK_BUILDERS } from './parks.js';
import { createKit, decorate, finishSites, hipGeo, prismGeo, C } from './kit.js';

// Blends two 0xRRGGBB colours: t of the way from a to b.
const mixHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

const { FLOOR_H: FH, PLINTH } = LANG;
const awn = (k, i = 0) => AWNINGS[(Math.floor(k.t[5] * AWNINGS.length) + i) % AWNINGS.length];
const units = (k) => Math.max(1, k.d.cw);
const clampRise = (w, lo, hi, f) => Math.max(lo, Math.min(hi, w * f));
// Which of n looks this building wears, from a fixed trait slot: the same seed always gives the same variant.
const look = (k, n) => Math.floor(k.t[7] * n);

// Flat upward quads merged into one geometry: q is [x0, z0, x1, z1, y, ...] for each quad.
function quadsGeo(q) {
  const n = q.length / 5, pos = new Float32Array(n * 12), nor = new Float32Array(n * 12), idx = new Uint32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const [x0, z0, x1, z1, y] = q.slice(i * 5, i * 5 + 5), o = i * 12;
    pos.set([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], o);
    for (let j = 0; j < 4; j++) nor[o + j * 3 + 1] = 1;
    idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

const B = {
  // Three roofs: hipped, gable end to the street, or long eaves to the street.
  cottage(k) {
    k.body(); k.door();
    const v = look(k, 3), rise = clampRise(k.w, 1.0, 1.5, 0.5);
    if (v === 0) k.hipRoof(rise); else if (v === 1) k.gableRoof(rise + 0.1, 'z'); else k.gableRoof(rise, 'x');
    k.box(1.3, 0.1, 0.7, k.doorX, PLINTH + 1.2, k.dep / 2 + 0.3, k.P.accent, { rx: 0.2 }); // porch hood
    decorate(k, { hearth: true });
  },

  terrace(k) {
    const n = units(k), uw = k.w / n, v = look(k, 3);   // v: a gable per house, one long eave roof with dormers, or a mansard cap
    k.body();
    const rises = [];
    for (let i = 0; i < n; i++) {
      const x = -k.w / 2 + (i + 0.5) * uw, rise = 1.3 + k.t[(i + 2) % 12] * 0.4;  // each gable a touch different
      if (v === 0) k.part(prismGeo([[-uw / 2 - 0.05, 0], [uw / 2 + 0.05, 0], [0, rise]], k.dep + 0.3), k.P.roof, x, k.top, 0);
      rises.push({ x, rise });
    }
    if (v === 0) k.roof = { kind: 'gable', rise: rises[0].rise, along: 'z', y: k.top, span: uw, len: k.dep };
    else if (v === 1) { k.gableRoof(1.3, 'x'); k.dormers(Math.min(4, n + 1)); }
    else { k.mansardRoof(1.2, 0.5); k.dormers(Math.min(4, n + 1)); }
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? k.doorX : -k.w / 2 + (i + 0.5) * uw + (k.t[4] - 0.5) * uw * 0.25;
      k.door(x, k.dep / 2, i % 2 ? k.P.accent : awn(k, i));
      if (n > 1) k.box(0.9, 0.08, 0.5, x, PLINTH + 1.2, k.dep / 2 + 0.25, awn(k, i + 1), { rx: 0.2 });
    }
    decorate(k, v === 0 ? { units: rises, hearth: true } : { hearth: true, skip: ['dormers'] });
  },

  // Crown: a slate mansard, or a steep hip roof with dormers.
  mansard(k) {
    k.body(); k.door();
    if (k.t[5] > 0.35) k.awning(k.doorX, k.dep / 2, Math.min(k.w - 0.6, 2.2), awn(k));
    if (look(k, 3) === 2) k.hipRoof(1.7); else k.mansardRoof(1.5, 0.55);
    k.dormers(k.w > 4.5 ? 3 : 2);
    k.bay(3, k.bayX(Math.floor((k.bx - 1) / 2)));   // one oriel above the balconies, so it never clashes with them
    if (k.level >= 4) for (let i = 0; i < Math.min(2, k.bx); i++) k.balcony(2, k.bayX(i === 0 ? 0 : k.bx - 1));
    decorate(k, { skip: ['dormers'] });
  },

  tower(k) {
    k.body(); k.door();
    k.awning(k.doorX, k.dep / 2, Math.min(k.w - 0.6, 2.2), awn(k));
    const v = look(k, 3);   // crown: flat roof with a stair house, a stepped penthouse, or a pointed cap
    if (v === 2) k.hipRoof(1.5, C.slate); else k.flatRoof(0.4);
    k.bay(5, k.bayX(Math.floor((k.bx - 1) / 2)), 1.0);   // an oriel up the tower, above the floor-3 balcony
    if (v === 0) {   // stair house and water tank: the little things every flat roof has
      k.box(k.w * 0.35, 0.8, k.dep * 0.35, k.w * 0.15, k.top + 0.4, -k.dep * 0.1, C.stone);
      if (k.level >= 3) k.cyl(0.3, 0.3, 0.7, 8, -k.w * 0.25, k.top + 0.4, k.dep * 0.15, C.wood);
    } else if (v === 1) {   // one smaller storey set back, with its own cap
      const cw = k.w * 0.62, cd = k.dep * 0.62;
      k.body(cw, cd, 1, 0, -k.dep * 0.08, k.top + 0.4, C.stone);
      k.box(cw + 0.12, 0.16, cd + 0.12, 0, k.top + 0.4 + FH, -k.dep * 0.08, C.charcoal);
      k.roof = { kind: 'flat', rise: 0.4 + FH + 0.16, along: 'z', y: k.top + 0.4 + FH + 0.16 };
    }
    if (k.level >= 4 && v < 2) for (const sx of [-1, 1]) k.box(k.w * 0.22, 0.28, 0.4, sx * k.w * 0.28, k.top + 0.4, k.dep * 0.32, C.leaf, { edge: false });
    if (k.level >= 4 && k.floors >= 8) k.balcony(3, k.bayX(0), 1.2);
    decorate(k, { skip: ['cornice', 'gableWindow'] });
  },

  // Tall and narrow, with a round Dutch gable on the street: a short wall topped by a half-round, in front of the roof's end.
  // The face is one convex prism (a rectangle and an arch), with a slightly larger, deeper one behind it as a stone coping.
  townhouse(k) {
    k.body(); k.door();
    const rise = clampRise(k.w, 1.1, 1.4, 0.5), gw = k.w + 0.1, r = gw / 2, h0 = 0.35, flat = 0.82;   // flat: how squashed the arch is
    k.gableRoof(rise, 'z');
    const outline = (rr, hh) => {
      const pts = [[-rr, 0], [rr, 0], [rr, hh]];
      for (let a = 1; a <= 7; a++) { const t = (a / 8) * Math.PI; pts.push([rr * Math.cos(t), hh + rr * flat * Math.sin(t)]); }
      pts.push([-rr, hh]);
      return pts;
    };
    const zc = k.dep / 2 + 0.12, front = zc + 0.12;
    k.part(prismGeo(outline(r + 0.09, h0), 0.24), C.stone, 0, k.top, zc - 0.05);          // coping: wider, and its face 0.05 behind
    k.part(prismGeo(outline(r, h0), 0.24), k.P.wallHex, 0, k.top, zc);                      // the gable face
    if (k.level >= 3) { k.disc(0.26, 0, k.top + h0 + r * flat * 0.45, front + 0.02, C.cream, { thick: 0.08 }); k.disc(0.17, 0, k.top + h0 + r * flat * 0.45, front + 0.05, C.glass, { thick: 0.06, edge: false }); }
    k.box(0.9, 0.1, 0.5, k.doorX, PLINTH + 1.2, k.dep / 2 + 0.25, awn(k), { rx: 0.2 });                                                  // door hood
    if (k.floors >= 3) k.bay(2, k.bayX(k.bx - 1), 0.95);
    decorate(k, { hearth: true, skip: ['gableWindow'], units: [{ x: 0, rise }] });
  },

  // A grand house: corner turrets, a hip roof and a two-column portico under a pediment.
  manor(k) {
    k.doorX = 0;
    k.body(); k.door(0, k.dep / 2, k.P.accent, 1.0, 1.25);
    k.hipRoof(clampRise(Math.min(k.w, k.dep), 1.5, 2.0, 0.34));
    // turrets at the two front corners, taller than the eaves, each with a slate cone
    const tr = 0.55, th = k.floors * FH + 0.55;
    for (const sx of [-1, 1]) {
      const tx = sx * (k.w / 2 - 0.05), tz = k.dep / 2 - 0.05;
      k.cyl(tr, tr, th, 8, tx, PLINTH, tz, k.P.wallHex);
      k.spire(tr * 1.35, 1.1, tx, PLINTH + th, tz, C.slate);
    }
    // portico: slab, two columns, pediment
    const pz = k.dep / 2 + 0.3;
    k.box(2.1, 0.1, 0.62, 0, PLINTH + 1.5, pz, C.cream);
    for (const sx of [-1, 1]) k.cyl(0.1, 0.12, 1.5 - 0.0, 6, sx * 0.8, PLINTH, pz + 0.12, C.cream, { edge: false });
    k.part(prismGeo([[-1.1, 0], [1.1, 0], [0, 0.5]], 0.62), C.cream, 0, PLINTH + 1.6, pz);
    k.box(2.4, 0.14, 0.9, 0, 0, k.dep / 2 + 0.4, C.stone, { edge: false });   // wide step
    k.sites.doors.push([0, k.dep / 2 + 0.12]);
    decorate(k, { skip: ['boxes', 'lamp', 'chimney'], hearth: false });
    if (k.level >= 2) k.windowBoxes(1);
    // two tall chimneys on the ridge ends, from level 3
    if (k.level >= 3) for (const sx of [-1, 1]) k.chimneyAt(sx * k.w * 0.3, 0);
  },

  // A long flat-roofed block: a stair core on the front, balconies on a few bays, planters and solar panels on the roof.
  apartments(k) {
    k.doorX = 0;
    k.body();
    k.flatRoof(0.35, C.stone);
    const cw = 1.5, ch = k.floors * FH + 0.5;
    k.box(cw, ch, 0.45, 0, PLINTH, k.dep / 2 + 0.2, k.P.wallHex);                                  // the stair core, front 0.42 out
    k.box(0.5, ch * 0.62, 0.05, 0, PLINTH + ch * 0.3, k.dep / 2 + 0.45, C.glass, { edge: false });   // its tall window slit
    k.box(cw + 0.2, 0.1, 0.12, 0, PLINTH + ch, k.dep / 2 + 0.2, C.charcoal);                       // its cap, a hair wider
    k.door(0, k.dep / 2 + 0.43, C.glass, 0.8, 1.05);
    k.box(1.1, 0.08, 0.4, 0, PLINTH + 1.3, k.dep / 2 + 0.6, awn(k), { rx: 0.2 });
    // balconies: two bays either side of the core, on two storeys
    const left = 0, right = k.bx - 1;
    for (const f of [2, 3]) if (f < k.floors) for (const b of [left, right]) k.balcony(f, k.bayX(b), 1.0);
    // the roof: a lift house over the stair core, then raised planters and solar panels on stands behind it
    const roofY = k.top + 0.35, fz = k.dep / 2 - 0.75;
    k.box(cw, 0.8, 1.1, 0, roofY, fz, k.P.wallHex);
    k.box(cw + 0.16, 0.08, 1.26, 0, roofY + 0.8, fz, C.charcoal);
    if (k.level >= 2) for (const sx of [-1, 1]) {
      const px = sx * (k.w / 2 - 0.9);
      k.box(1.1, 0.26, 0.55, px, roofY, fz, C.stone);
      k.box(0.96, 0.14, 0.42, px, roofY + 0.26, fz, C.leaf, { edge: false });
    }
    if (k.level >= 3) for (let i = 0; i < 2; i++) {
      const px = (i - 0.5) * 1.5, pz = -k.dep * 0.2;
      k.box(1.2, 0.14, 0.12, px, roofY, pz, C.stone, { edge: false });                       // the stand
      k.box(1.2, 0.07, 0.8, px, roofY + 0.14, pz, C.water, { rx: -0.42, edge: false });      // the panel, tilted to the sun
    }
    if (k.level >= 4) k.cyl(0.32, 0.32, 0.6, 8, k.w / 2 - 0.9, roofY, -k.dep / 2 + 0.8, C.wood);   // a water tank
    k.roof = { kind: 'flat', rise: 0.35, along: 'z', y: roofY };
    decorate(k, { skip: ['chimney', 'cornice', 'gableWindow', 'dormers', 'garden', 'lamp', 'boxes', 'crown'] });
    if (k.level >= 2) k.windowBoxes(1);
  },

  // Three roofs, picked by the seed: a flat parapet with skylights and chimney pots, a row of small terracotta gables, or a slate
  // mansard cap with dormers. The shopfronts below are the same in every case.
  'shop-row'(k) {
    const n = units(k), uw = k.w / n, v = Math.floor(k.t[3] * 3);
    k.body();
    const xs = Array.from({ length: n }, (_, i) => -k.w / 2 + (i + 0.5) * uw);
    let roofUnits = null;
    if (v === 0) {
      k.flatRoof(0.5, C.paper);
      const ry = k.top + 0.5;
      xs.forEach((x, i) => {
        k.box(0.95, 0.12, 0.7, x, ry, -k.dep * 0.08, C.cream);
        k.box(0.75, 0.05, 0.5, x, ry + 0.12, -k.dep * 0.08, C.glass, { edge: false });                    // a skylight
        if (i % 2 === (k.t[4] < 0.5 ? 0 : 1)) { k.box(0.3, 0.55, 0.3, x + uw * 0.28, ry, -k.dep * 0.3, C.brick); k.box(0.4, 0.07, 0.4, x + uw * 0.28, ry + 0.55, -k.dep * 0.3, C.stone, { edge: false }); k.sites.chimneys.push([x + uw * 0.28, ry + 0.62, -k.dep * 0.3]); }
      });
    } else if (v === 1) {
      const rise = 0.85 + k.t[5] * 0.3;
      roofUnits = xs.map((x) => ({ x, rise }));
      for (const x of xs) k.part(prismGeo([[-uw / 2 - 0.05, 0], [uw / 2 + 0.05, 0], [0, rise]], k.dep + 0.3), k.P.roof, x, k.top, 0);
      k.roof = { kind: 'gable', rise, along: 'z', y: k.top, span: uw, len: k.dep };
      xs.forEach((x, i) => { if (i % 2 === (k.t[4] < 0.5 ? 0 : 1)) k.chimneyAt(x + uw * 0.25, -k.dep * 0.2, rise); });
    } else {
      k.mansardRoof(1.1, 0.5, C.slate);
      k.dormers(Math.min(3, n + 1));
    }
    for (let i = 0; i < n; i++) {
      const x = xs[i], col = awn(k, i);
      k.shopfront(uw, k.dep / 2, col, x);
      k.door(x + uw * 0.28, k.dep / 2, k.P.accent, 0.55, 1.0);   // taller than the glass beside it, so their tops differ
      k.box(Math.min(uw - 0.5, 1.5), 0.26, 0.1, x, k.top - 0.55, k.dep / 2 + 0.06, col, { edge: false }); // a sign board, no lettering
      if (k.level >= 2) { k.box(0.4, 0.3, 0.4, x - uw * 0.38, PLINTH, k.dep / 2 + 0.35, C.wood, { edge: false }); k.box(0.32, 0.22, 0.32, x - uw * 0.38, PLINTH + 0.3, k.dep / 2 + 0.35, C.leaf, { edge: false }); }
    }
    decorate(k, { skip: ['boxes', 'cornice', 'gableWindow', 'garden', 'dormers', 'chimney'], units: roofUnits || undefined });
    if (k.level >= 2) k.windowBoxes(1);
  },

  // A corner bakery: a striped awning, a loaf on the signboard and an oven chimney that smokes.
  bakery(k) {
    k.body();
    k.gableRoof(clampRise(k.dep, 1.0, 1.3, 0.4), 'x');
    k.shopfront(k.w - 0.2, k.dep / 2, awn(k), 0);
    k.door(k.w * 0.28, k.dep / 2, k.P.accent, 0.55, 1.0);
    k.box(Math.min(k.w - 0.6, 1.5), 0.26, 0.1, -k.w * 0.1, k.top - 0.55, k.dep / 2 + 0.06, awn(k, 1), { edge: false });   // signboard
    k.disc(0.15, -k.w * 0.1, k.top - 0.42, k.dep / 2 + 0.14, C.gold, { thick: 0.06, edge: false });                      // the loaf
    k.chimneyAt(k.w * 0.3, -k.dep * 0.2, 1.0, C.brick);
    for (let i = 0; i < 2; i++) k.box(0.34, 0.26, 0.3, -k.w * 0.38 + i * 0.4, PLINTH, k.dep / 2 + 0.3, C.wood, { edge: false });   // bread crates
    decorate(k, { skip: ['boxes', 'garden', 'chimney', 'lamp', 'cornice', 'bunting'] });   // no bunting or window boxes: they would cover the signboard
    if (k.level >= 2) for (const sx of [-1, 1]) { k.cyl(0.12, 0.1, 0.22, 7, sx * (k.w / 2 - 0.12), PLINTH, k.dep / 2 + 0.2, C.terracotta, { edge: false }); k.box(0.26, 0.18, 0.26, sx * (k.w / 2 - 0.12), PLINTH + 0.22, k.dep / 2 + 0.2, C.leaf, { edge: false }); }
    if (k.level >= 4) k.lamp(k.w * 0.45, k.dep / 2 + 0.55);
  },

  // The big shop: an arcade of awnings, a signboard with a gold medallion, flagpoles and a glass dome on the roof.
  department(k) {
    const n = 3, uw = k.w / n;
    k.body(); k.flatRoof(0.5, C.paper);
    for (let i = 0; i < n; i++) {
      const x = -k.w / 2 + (i + 0.5) * uw, col = awn(k, i);
      if (i === 1) continue;                                                                           // the middle bay is the entrance
      k.shopfront(uw, k.dep / 2, col, x);
      k.box(Math.min(uw - 0.5, 1.3), 0.26, 0.1, x, k.top - 0.55, k.dep / 2 + 0.06, col, { edge: false });
    }
    k.doorX = 0;
    k.door(0, k.dep / 2, C.glass, 1.1, 1.15);
    for (const sx of [-1, 1]) k.box(0.18, 1.5, 0.16, sx * 0.78, PLINTH, k.dep / 2 + 0.08, C.cream, { edge: false });   // pilasters
    k.box(1.7, 0.12, 0.5, 0, PLINTH + 1.55, k.dep / 2 + 0.25, C.cream, { rx: 0.15 });                  // entrance canopy, clear of the awnings
    k.disc(0.3, 0, k.top - 0.4, k.dep / 2 + 0.1, C.gold, { thick: 0.06, edge: false });               // sign medallion
    // glass dome on a drum, over the middle of the roof
    const dr = Math.min(k.w, k.dep) * 0.2;
    k.cyl(dr, dr, 0.4, 10, 0, k.top + 0.5, 0, C.cream);
    k.dome(dr * 0.9, 0, k.top + 0.9, 0, C.glass);
    k.sites.chimneys.push([dr, k.top + 0.5, 0]);
    if (k.level >= 3) for (const sx of [-1, 1]) k.flag(sx * (k.w / 2 - 0.5), k.top + 0.5, k.dep / 2 - 0.4);
    decorate(k, { skip: ['boxes', 'cornice', 'gableWindow', 'garden', 'chimney', 'crown', 'bunting'] });
    if (k.level >= 2) k.windowBoxes(1);
  },

  cafe(k) {
    k.body(); k.door();
    const v = look(k, 3), rise = clampRise(k.w, 1.1, 1.5, 0.5);   // hipped, long-eave gable, or slate mansard cap
    if (v === 0) k.hipRoof(rise); else if (v === 1) k.gableRoof(rise, 'x'); else k.mansardRoof(1.0, 0.45);
    k.shopfront(k.w - 0.2, k.dep / 2, awn(k), 0);
    // terrace: a stone patio, two round tables, four stools
    k.box(k.w - 0.4, 0.06, 0.55, 0, 0, k.dep / 2 + 0.45, C.stone, { edge: false });
    for (const sx of [-1, 1]) {
      const x = sx * k.w * 0.24, z = k.dep / 2 + 0.5;
      k.cyl(0.04, 0.04, 0.5, 5, x, 0.06, z, C.slate, { edge: false });
      k.cyl(0.26, 0.26, 0.05, 10, x, 0.56, z, C.cream, { edge: false });
      for (const s2 of [-1, 1]) k.box(0.16, 0.22, 0.16, x + s2 * 0.38, 0.06, z, k.P.accent, { edge: false });
      k.sites.tables.push([x, z]);
    }
    decorate(k, { skip: ['garden', 'lamp'] });
    if (k.level >= 4) k.lamp(k.w * 0.45, k.dep / 2 + 0.55);
  },

  market(k) {
    const arch = Math.max(1, Math.round(k.w / 1.5));
    k.body(k.w, k.dep, 1, 0, 0, PLINTH, C.terracotta);
    k.hipRoof(clampRise(Math.min(k.w, k.dep), 1.3, 1.9, 0.38), k.P.roof);
    // lantern roof: the glass box that lets light into the hall
    const lh = k.top + k.roof.rise * 0.75, lw = Math.min(k.w, k.dep) * 0.32;
    k.box(lw, 0.55, lw, 0, lh, 0, k.P.wallHex);
    k.box(lw * 0.8, 0.3, lw + 0.02, 0, lh + 0.12, 0, C.glass, { edge: false });
    k.part(new THREE.ConeGeometry(lw * 0.85, 0.5, 4).rotateY(Math.PI / 4).translate(0, 0.25, 0), k.P.roof, 0, lh + 0.55, 0);
    // stalls along the front, each under its own striped awning
    const stalls = Math.max(1, Math.round(k.w / 1.7));
    for (let i = 0; i < stalls; i++) {
      const x = -k.w / 2 + (i + 0.5) * (k.w / stalls);
      k.box(0.8, 0.45, 0.5, x, 0, k.dep / 2 + 0.2, C.wood, { edge: false });
      k.box(0.95, 0.08, 0.7, x, 0.95, k.dep / 2 + 0.25, awn(k, i), { rx: 0.3 });
      k.box(0.06, 0.95, 0.06, x - 0.4, 0, k.dep / 2 + 0.5, C.wood, { edge: false }); k.box(0.06, 0.95, 0.06, x + 0.4, 0, k.dep / 2 + 0.5, C.wood, { edge: false });
    }
    void arch;
    decorate(k, { skip: ['chimney', 'gableWindow', 'boxes', 'garden', 'dormers'] });
  },

  office(k) {
    k.body(); k.door(k.doorX, k.dep / 2, C.glass, 0.95, 1.05);
    k.awning(k.doorX, k.dep / 2, 1.5, C.cream);
    k.flatRoof(0.3, C.stone);
    k.bay(2, k.bayX(Math.floor((k.bx - 1) / 2)), 1.1);   // a glass oriel on the middle bay
    // crown: a smaller storey stepped back, or (one look in three) a glass penthouse with roof units
    const cw = k.w * 0.58, cd = k.dep * 0.58;
    if (look(k, 3) === 2) {
      k.box(cw, FH, cd, 0, k.top + 0.3, -k.dep * 0.08, C.glass);
      for (const sx of [-1, 1]) k.box(0.5, 0.3, 0.5, sx * k.w * 0.3, k.top + 0.3, -k.dep * 0.3, C.charcoal, { edge: false });
    } else k.body(cw, cd, 1, 0, -k.dep * 0.08, k.top + 0.3, C.charcoal);
    k.box(cw + 0.12, 0.2, cd + 0.12, 0, k.top + 0.3 + FH, -k.dep * 0.08, C.charcoal);
    k.cyl(0.03, 0.03, 0.9, 5, k.w * 0.15, k.top + 0.3 + FH + 0.2, -k.dep * 0.08, C.slate, { edge: false });
    if (k.level >= 3) for (const sx of [-1, 1]) k.box(0.5, 0.25, 0.5, sx * k.w * 0.36, k.top + 0.3, k.dep * 0.28, C.leaf, { edge: false });
    k.roof = { kind: 'flat', rise: 0.3 + FH + 0.2, along: 'z', y: k.top + 0.3 + FH + 0.2 };
    decorate(k, { skip: ['cornice', 'gableWindow', 'chimney', 'boxes'] });
  },

  workshop(k) {
    k.body(); 
    const teeth = Math.max(2, Math.round(k.w / 1.8));
    k.sawtooth(teeth, 0.9, k.P.roof);
    k.box(1.3, 1.3, 0.14, k.doorX, PLINTH, k.dep / 2 + 0.05, C.wood);   // the big work door
    const sx = k.w * 0.34;
    k.cyl(0.38, 0.5, 3.4, 8, sx, k.top, -k.dep * 0.25, C.brick);
    k.cyl(0.5, 0.5, 0.12, 8, sx, k.top + 3.4, -k.dep * 0.25, C.stone, { edge: false });
    k.sites.stacks.push([sx, k.top + 3.55, -k.dep * 0.25]);
    k.sites.doors.push([k.doorX, k.dep / 2 + 0.12]);
    if (k.level >= 3) { k.sites.stacks.push([sx - 1.0, k.top + 2.75, -k.dep * 0.25]); k.cyl(0.3, 0.42, 2.6, 8, sx - 1.0, k.top, -k.dep * 0.25, C.brick); k.cyl(0.4, 0.4, 0.1, 8, sx - 1.0, k.top + 2.6, -k.dep * 0.25, C.stone, { edge: false }); }
    for (let i = 0; i < 3; i++) k.box(0.45, 0.4, 0.4, -k.w * 0.4 + i * 0.5, 0, k.dep / 2 + 0.3, i === 1 ? C.stone : C.wood, { edge: false }); // crates
    decorate(k, { skip: ['chimney', 'cornice', 'gableWindow', 'dormers', 'crown', 'garden'] });
    if (k.level >= 5) k.flag(-k.w * 0.38, k.top + 0.9, -k.dep * 0.1);
  },

  warehouse(k) {
    k.body();
    k.gableRoof(clampRise(k.dep, 0.9, 1.4, 0.3), 'x', C.charcoal);
    const n = Math.max(1, Math.round(k.w / 2.4));
    for (let i = 0; i < n; i++) { const bx = -k.w / 2 + (i + 0.5) * (k.w / n); k.box(1.3, 1.4, 0.14, bx, PLINTH, k.dep / 2 + 0.05, C.wood); k.sites.doors.push([bx, k.dep / 2 + 0.12]); }
    k.box(k.w * 0.7, 0.18, 0.7, 0, 0, k.dep / 2 + 0.45, C.stone, { edge: false }); // loading ramp
    decorate(k, { skip: ['chimney', 'gableWindow', 'dormers', 'garden'] });
  },

  clinic(k) {
    k.body(); k.door();
    k.gableRoof(clampRise(k.dep, 1.0, 1.5, 0.45), 'x');
    // a calm green cross on a cream plaque above the door
    const y = k.floorY(1) + 0.62, x = k.doorX;   // above the porch hood, so the cross never touches it
    k.disc(0.36, x, y, k.dep / 2 + 0.12, C.cream, { thick: 0.08 });
    k.box(0.5, 0.14, 0.05, x, y - 0.07, k.dep / 2 + 0.2, C.leaf, { edge: false });
    k.box(0.14, 0.5, 0.06, x, y - 0.25, k.dep / 2 + 0.2, C.leaf, { edge: false });   // a hair deeper than the bar, so the cross has no shared face
    k.box(1.1, 0.1, 0.6, x, PLINTH + 1.25, k.dep / 2 + 0.3, C.leaf, { rx: 0.2 });
    decorate(k);
  },

  school(k) {
    k.body(); k.door(k.doorX, k.dep / 2, k.P.accent, 0.95, 1.1);
    k.gableRoof(clampRise(k.dep, 1.0, 1.5, 0.4), 'x');
    // bell tower on the ridge
    const tx = k.w * 0.12, ty = k.top + k.roof.rise * 0.8;
    k.box(0.9, 1.1, 0.9, tx, ty, 0, k.P.wallHex);
    k.box(0.5, 0.4, 0.06, tx, ty + 0.4, 0.46, C.glass, { edge: false });
    k.spire(0.75, 0.9, tx, ty + 1.1, 0, C.slate);
    // a small yard fence line
    k.box(k.w * 0.7, 0.3, 0.06, 0, PLINTH, k.dep / 2 + 0.43, C.wood, { edge: false });
    decorate(k, { skip: ['chimney', 'garden', 'crown'] });
    if (k.level >= 3) k.flag(-k.w * 0.4, k.top + 0.2, 0);
    if (k.level >= 5) k.weathervane(tx, ty + 1.95, 0);   // on the bell tower's spire, not buried in it
  },

  'fire-station'(k) {
    k.body();
    k.hipRoof(clampRise(Math.min(k.w, k.dep), 1.0, 1.4, 0.4), k.P.roof);
    const n = Math.max(1, Math.round(k.w / 2.2));
    for (let i = 0; i < n; i++) {
      const x = -k.w / 2 + (i + 0.5) * (k.w / n) + (n === 1 ? k.w * 0.18 : 0);
      k.box(1.1, 1.3, 0.14, x, PLINTH, k.dep / 2 + 0.05, C.fire);
      k.sites.doors.push([x, k.dep / 2 + 0.12]);
      k.box(1.25, 0.12, 0.2, x, PLINTH + 1.3, k.dep / 2 + 0.06, C.cream, { edge: false });
    }
    // hose tower at the corner
    const tw = 0.95, tx = -k.w / 2 + tw / 2 + 0.05;
    k.body(tw, tw, k.floors + 1, tx, -k.dep / 2 + tw / 2 + 0.25, PLINTH, C.fire, 'sash');
    k.spire(tw * 0.85, 0.9, tx, PLINTH + (k.floors + 1) * FH, -k.dep / 2 + tw / 2 + 0.25, C.slate);
    decorate(k, { skip: ['dormers', 'garden', 'chimney'] });
  },

  police(k) {
    k.body(); k.door();
    k.hipRoof(clampRise(k.w, 1.1, 1.5, 0.48), C.charcoal);
    const x = k.doorX;
    k.box(0.3, 0.3, 0.3, x, PLINTH + 1.2, k.dep / 2 + 0.2, C.water);   // the blue lamp
    k.box(1.16, 0.1, 0.6, x, PLINTH + 1.4, k.dep / 2 + 0.3, C.slate, { rx: 0.2, edge: false });
    decorate(k, { skip: ['chimney'] });
    if (k.level >= 3) k.flag(k.w * 0.38, k.top + 0.1, k.dep * 0.1);
  },

  'town-hall'(k) {
    k.body(); k.door(0, k.dep / 2, k.P.accent, 1.0, 1.25);
    k.mansardRoof(1.5, 0.55);
    for (let i = -1; i <= 1; i += 2) k.box(0.7, 0.6, 0.5, i * k.w * 0.3, k.top + 0.35, k.dep * 0.28, k.P.accent);
    // clock tower rising out of the roof
    const tw = Math.min(2, k.w * 0.34), td = Math.min(2, k.dep * 0.7), top = k.top;
    k.box(tw, 4.2, td, 0, top, 0, C.paper);
    k.disc(0.7 * Math.min(1, tw / 2), 0, top + 3.2, td / 2 + 0.05, C.cream, { thick: 0.12 });
    k.box(0.06, 0.4 * Math.min(1, tw / 2), 0.04, 0, top + 3.2, td / 2 + 0.12, C.slate, { edge: false });
    k.spire(tw * 0.8, 2.6, 0, top + 4.2, 0, C.slate);
    // steps up to the door
    k.box(2.2, 0.12, 0.5, 0, 0, k.dep / 2 + 0.2, C.stone, { edge: false });
    k.box(1.8, 0.11, 0.4, 0, 0.11, k.dep / 2 + 0.18, C.stone, { edge: false });   // top at 0.22, under the door pots' rims
    k.roof = { kind: 'mansard', rise: 1.5, along: 'x', y: top, inset: 0.55 };
    decorate(k, { skip: ['chimney', 'dormers', 'cornice'] });
    if (k.level >= 5) k.weathervane(0, top + 6.8, 0);
  },

  church(k) {
    const tw = Math.min(1.9, k.w * 0.62);
    const tz = k.dep / 2 - tw / 2 + 0.19, th = 7.4;   // front 0.19 out: the gable end is at 0.15, and a shared plane would flicker
    k.body(); 
    k.gableRoof(clampRise(k.w, 1.4, 1.9, 0.5), 'z');
    // west tower with a spire; it reaches for the sky
    k.box(tw, th, tw, 0, PLINTH, tz, k.P.wallHex);
    k.spire(tw * 0.8, 3.6, 0, PLINTH + th, tz, k.P.roof);
    k.box(0.06, 0.55, 0.06, 0, PLINTH + th + 3.6, tz, C.gold, { edge: false });
    k.box(0.3, 0.06, 0.07, 0, PLINTH + th + 3.95, tz, C.gold, { edge: false });
    k.disc(0.5, 0, k.top + 1.4, tz + tw / 2 + 0.02, C.glass, { thick: 0.1 });
    k.box(0.9, 1.5, 0.14, 0, PLINTH, tz + tw / 2 + 0.03, C.wood);                  // great door
    k.roof = { kind: 'gable', rise: k.roof.rise, along: 'z', y: k.top, span: k.w, len: k.dep };
    decorate(k, { skip: ['chimney', 'gableWindow', 'garden', 'lamp', 'bunting', 'crown', 'boxes'] });
    if (k.level >= 4) for (const sx of [-1, 1]) { k.cyl(0.05, 0.05, 0.7, 5, sx * (tw / 2 + 0.5), 0, tz + tw / 2 + 0.2, C.slate, { edge: false }); k.box(0.16, 0.2, 0.16, sx * (tw / 2 + 0.5), 0.7, tz + tw / 2 + 0.2, C.lamp, { edge: false }); }
    if (k.level >= 5) k.box(0.9, 0.9, 0.12, 0, k.top + 0.2, k.dep / 2 + 0.04, C.glass, { edge: false });
  },

  // A farm fills its whole lot, at any size. The front is fixed: a hedge with a gate, a farmhouse and a barn in a yard
  // 2.6 deep. Behind it the fields repeat to fill what is left: beds side by side in blocks of up to six, split by dirt
  // paths into blocks no deeper than about seven, so a bigger lot just gets more rows. The beds are flat quads merged
  // per colour (two triangles each), so a 24 x 24 farm stays a few thousand triangles and a handful of parts.
  farm(k) {
    const base = PLINTH + 0.06, w = k.w, dep = k.dep, hex = (c) => parseInt(c.slice(1), 16);
    k.box(w, 0.06, dep, 0, PLINTH, 0, hex(CROPS[3].row), { edge: false });                  // soil under everything
    const YARD = 2.6, PATH = 0.5, BED = 1.3;
    const fx = w - 0.9, fz0 = -dep / 2 + 0.45, fz1 = dep / 2 - YARD - 0.1, fd = fz1 - fz0;
    const nb = Math.max(2, Math.round(fx / BED)), gx = Math.ceil(nb / 6), bw = (fx - (gx - 1) * PATH) / nb;
    const gz = Math.max(1, Math.round(fd / 7)), bd = (fd - (gz - 1) * PATH) / gz;
    const first = Math.floor(k.t[2] * 3), quads = new Map(), centers = [], bedList = [];
    const quad = (c, x0, z0, x1, z1, y) => { let q = quads.get(c); if (!q) quads.set(c, q = []); q.push(x0, z0, x1, z1, y); };
    for (let bz = 0; bz < gz; bz++) {
      const z0 = fz0 + bz * (bd + PATH);
      let x = -fx / 2;
      for (let i = 0; i < nb; i++) {
        const g = Math.floor(i / 6), left = i - g * 6, inGroup = Math.min(6, nb - g * 6);
        if (left === 0 && g > 0) x += PATH;
        const crop = CROPS[(first + i + g * 2 + bz) % 3], x0 = x, x1 = x + bw - 0.05;
        quad(hex(crop.base), x0, z0, x1, z0 + bd, base + 0.1);
        bedList.push([x0, z0, x1, z0 + bd]);
        if (bw > 1.0) quad(hex(crop.row), (x0 + x1) / 2 - 0.07, z0 + 0.1, (x0 + x1) / 2 + 0.07, z0 + bd - 0.1, base + 0.12); // a row down the bed
        if (left === Math.floor(inGroup / 2) && (g + bz) % 2 === 0) centers.push([(x0 + x1) / 2, z0 + bd / 2]);
        x += bw;
      }
    }
    for (const [c, q] of quads) k.part(quadsGeo(q), c, 0, 0, 0, { edge: false });
    // for the farm's life (render/life/directors/farms.js): the beds, the lane the tractor takes behind the yard, the yard
    k.sites.farm = { base, beds: bedList, lane: { z: fz1 + 0.25, x0: -fx / 2, x1: fx / 2 }, yard: { z0: dep / 2 - YARD + 0.1, z1: dep / 2 - 0.3 } };
    // hedge round the lot, open at the gate
    const side = k.t[4] < 0.5 ? -1 : 1, hx = side * Math.min(w / 2 - 1.55, 1.5), bx = -side * Math.min(w / 2 - 1.4, 1.55);
    const hz = dep / 2 - 0.2, ex = w / 2 - 0.2;
    k.hedge(w - 0.4, 0, -dep / 2 + 0.2);
    for (const sx of [-1, 1]) k.box(0.36, 0.42, dep - 0.4, sx * ex, base, 0, C.moss, { edge: false });
    const left = (hx - 0.6) - (-ex), right = ex - (hx + 0.6);
    if (left > 0.3) k.hedge(left, -ex + left / 2, hz);
    if (right > 0.3) k.hedge(right, ex - right / 2, hz);
    // farmhouse
    const hw = Math.min(2.2, w * 0.4), hd = YARD - 0.9, hzc = dep / 2 - 0.5 - hd / 2;
    k.box(hw, 1.1, hd, hx, base, hzc, k.P.wallHex);          // the farmhouse wears the wall paint
    k.part(hipGeo(hw + 0.3, hd + 0.3, 0.8), k.P.roof, hx, base + 1.1, hzc);
    k.box(0.45, 0.7, 0.1, hx, base, hzc + hd / 2 + 0.04, k.P.accent);
    k.sites.doors.push([hx, hzc + hd / 2 + 0.1]);
    k.sites.chimneys.push([hx + hw * 0.28, base + 1.8, hzc - hd * 0.1]);
    k.sites.farm.house = { x: hx, z: hzc, hw, hd }; k.sites.farm.barn = { x: -side * Math.min(w / 2 - 1.4, 1.55), hw: Math.min(1.7, w * 0.3) / 2 };
    for (const sx of [-1, 1]) k.box(0.4, 0.34, 0.06, hx + sx * (hw * 0.32), base + 0.5, hzc + hd / 2 + 0.03, C.glass, { edge: false });
    k.box(0.32, 0.6, 0.32, hx + hw * 0.28, base + 1.1, hzc - hd * 0.1, C.brick);
    // barn on the other side
    const bwid = Math.min(1.7, w * 0.3);
    k.box(bwid, 1.2, hd, bx, base, hzc, mixHex(k.P.wallHex, C.terracotta, 0.55)); // the barn: the wall colour leaning red
    k.part(prismGeo([[-bwid / 2 - 0.1, 0], [bwid / 2 + 0.1, 0], [0, 0.7]], hd + 0.2), k.P.roof, bx, base + 1.2, hzc);
    k.box(0.8, 0.85, 0.08, bx, base, hzc + hd / 2 + 0.04, C.wood);
    // level details
    if (k.level >= 2) for (let i = 0; i < 2; i++) k.box(0.45, 0.38, 0.38, bx + (i ? 0.25 : -0.25), base, hzc + hd / 2 + 0.45, C.gold, { edge: false }); // hay bales
    if (k.level >= 3) { k.cyl(0.22, 0.22, 0.3, 8, hx - hw / 2 - 0.35, base, hzc + 0.1, C.stone); k.cyl(0.03, 0.03, 0.6, 4, hx - hw / 2 - 0.35, base + 0.3, hzc + 0.1, C.wood, { edge: false }); } // a well
    if (k.level >= 4) { const sx = bx + side * (bwid / 2 + 0.4), sz = hzc - hd * 0.2; k.cyl(0.36, 0.36, 1.9, 8, sx, base, sz, C.stone); k.cyl(0, 0.42, 0.45, 8, sx, base + 1.9, sz, k.P.roof); } // a silo
    if (k.level >= 5) {
      k.weathervane(bx, base + 1.9, hzc);
      for (const [x, z] of centers.slice(0, 24)) {                                           // a scarecrow in every other block
        k.cyl(0.04, 0.04, 0.95, 3, x, base + 0.1, z, C.wood, { edge: false });
        k.box(0.7, 0.07, 0.07, x, base + 0.75, z, C.wood, { edge: false });
      }
    }
  },

  ...PARK_BUILDERS,
};

export const builderIds = () => Object.keys(B);

// Builds the parts of one building. Pure in `desc`: the same description gives the same parts.
export function buildParts(desc) {
  const fn = B[desc.model];
  if (!fn) throw new Error('no builder for model "' + desc.model + '"');
  if (!modelById(desc.model)) throw new Error('unknown model "' + desc.model + '"');
  const k = createKit(desc);
  fn(k);
  k.parts.sites = finishSites(k); // where life can happen on this building (render/life)
  return k.parts;
}

export function trianglesOf(parts) {
  let n = 0;
  for (const p of parts) {
    if (p.body) n += p.splits.reduce((a, sp) => a + sp.geo.index.count / 3, 0);
    else n += (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3;
  }
  return n;
}
