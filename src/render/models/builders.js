// One builder per model. A builder reads a kit (see kit.js) and adds parts; it never rolls its own random numbers,
// it reads the building's fixed traits (k.t), so the same seed always builds the same house.
// Level details (window boxes, chimneys, dormers, bunting) come from decorate(), except where a model has its own.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { AWNINGS } from '../../world/palettes.js';
import { LANG, modelById } from '../../world/models.js';
import { createKit, decorate, prismGeo, C } from './kit.js';

const { FLOOR_H: FH, PLINTH } = LANG;
const awn = (k, i = 0) => AWNINGS[(Math.floor(k.t[5] * AWNINGS.length) + i) % AWNINGS.length];
const units = (k) => Math.max(1, k.d.legacy ? 1 : k.d.cw);
const clampRise = (w, lo, hi, f) => Math.max(lo, Math.min(hi, w * f));

// Park helpers: a lawn slab, a little tree, and a position given as fractions of the footprint (-1..1 each way).
const lawn = (k, color = C.leaf) => k.box(k.w, 0.06, k.dep, 0, PLINTH, 0, color, { edge: false });
const at = (k, fx, fz) => [fx * k.w / 2, fz * k.dep / 2];
const tree = (k, x, z, s = 1) => {
  k.cyl(0.07 * s, 0.09 * s, 0.7 * s, 6, x, PLINTH, z, C.wood, { edge: false });
  k.dome(0.55 * s, x, PLINTH + 0.55 * s, z, s > 0.9 ? C.leaf : C.moss);
};

const B = {
  cottage(k) {
    k.body(); k.door();
    k.hipRoof(clampRise(k.w, 1.0, 1.5, 0.5));
    k.box(1.3, 0.1, 0.7, k.doorX, PLINTH + 1.2, k.dep / 2 + 0.3, k.P.accent, { rx: 0.2 }); // porch hood
    decorate(k);
  },

  terrace(k) {
    const n = units(k), uw = k.w / n;
    k.body();
    const rises = [];
    if (n === 1 && k.d.roofKind === 'hip') { k.hipRoof(clampRise(k.w, 1.2, 1.6, 0.45)); rises.push({ x: 0, rise: k.roof.rise }); }
    else if (n === 1 && k.d.roofKind === 'gable') { k.gableRoof(1.5, 'z'); rises.push({ x: 0, rise: 1.5 }); }
    else {
      for (let i = 0; i < n; i++) {
        const x = -k.w / 2 + (i + 0.5) * uw, rise = 1.3 + k.t[(i + 2) % 12] * 0.4;  // each gable a touch different
        k.part(prismGeo([[-uw / 2 - 0.05, 0], [uw / 2 + 0.05, 0], [0, rise]], k.dep + 0.3), k.P.roof, x, k.top, 0);
        rises.push({ x, rise });
      }
      k.roof = { kind: 'gable', rise: rises[0].rise, along: 'z', y: k.top, span: uw, len: k.dep };
    }
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? k.doorX : -k.w / 2 + (i + 0.5) * uw + (k.t[4] - 0.5) * uw * 0.25;
      k.door(x, k.dep / 2, i % 2 ? k.P.accent : awn(k, i));
      if (k.d.awning >= 0 && n === 1 && k.floors <= 3) k.awning(x, k.dep / 2, Math.min(k.w - 0.6, 2.2), AWNINGS[k.d.awning]);
      else if (n > 1) k.box(0.9, 0.08, 0.5, x, PLINTH + 1.2, k.dep / 2 + 0.25, awn(k, i + 1), { rx: 0.2 });
    }
    if (k.d.legacy && k.d.roofKind) k.chimneyAt(k.w * 0.22, -k.dep * 0.2, k.roof.rise); // the town's own houses always had one
    decorate(k, { units: rises, skip: k.d.legacy && k.d.roofKind ? ['chimney'] : [] });
    if (k.d.legacy && k.d.roofKind && k.level >= 3) k.chimneyAt(-k.w * 0.22, -k.dep * 0.2, k.roof.rise);
  },

  mansard(k) {
    k.body(); k.door();
    if (k.d.legacy ? k.d.awning >= 0 : k.t[5] > 0.35) k.awning(k.doorX, k.dep / 2, Math.min(k.w - 0.6, 2.2), awn(k));
    k.mansardRoof(1.5, 0.55);
    k.dormers(k.w > 4.5 ? 3 : 2);
    if (k.level >= 4) for (let i = 0; i < Math.min(2, k.bx); i++) k.balcony(2, k.bayX(i === 0 ? 0 : k.bx - 1));
    decorate(k, { skip: ['dormers'] });
  },

  tower(k) {
    k.body(); k.door();
    if (k.d.legacy ? k.d.awning >= 0 : true) k.awning(k.doorX, k.dep / 2, Math.min(k.w - 0.6, 2.2), awn(k));
    k.flatRoof(0.4);
    // stair house and water tank: the little things every flat roof has
    k.box(k.w * 0.35, 0.8, k.dep * 0.35, k.w * 0.15, k.top + 0.4, -k.dep * 0.1, C.stone);
    if (k.level >= 3) k.cyl(0.3, 0.3, 0.7, 8, -k.w * 0.25, k.top + 0.4, k.dep * 0.15, C.wood);
    if (k.level >= 4) for (const sx of [-1, 1]) k.box(k.w * 0.22, 0.28, 0.4, sx * k.w * 0.28, k.top + 0.4, k.dep * 0.32, C.leaf, { edge: false });
    if (k.level >= 4 && k.floors >= 8) k.balcony(3, k.bayX(0), 1.2);
    decorate(k, { skip: ['cornice', 'gableWindow'] });
  },

  'shop-row'(k) {
    const n = units(k), uw = k.w / n;
    k.body(); k.flatRoof(0.5, C.paper);
    for (let i = 0; i < n; i++) {
      const x = -k.w / 2 + (i + 0.5) * uw, col = awn(k, i);
      k.shopfront(uw, k.dep / 2, col, x);
      k.door(x + uw * 0.28, k.dep / 2, k.P.accent, 0.55, 0.95);
      k.box(Math.min(uw - 0.5, 1.5), 0.26, 0.1, x, k.top - 0.55, k.dep / 2 + 0.06, col, { edge: false }); // a sign board, no lettering
      if (k.level >= 2) { k.box(0.4, 0.3, 0.4, x - uw * 0.38, PLINTH, k.dep / 2 + 0.35, C.wood, { edge: false }); k.box(0.32, 0.22, 0.32, x - uw * 0.38, PLINTH + 0.3, k.dep / 2 + 0.35, C.leaf, { edge: false }); }
    }
    decorate(k, { skip: ['boxes', 'cornice', 'gableWindow', 'garden'] });
    if (k.level >= 2) k.windowBoxes(1);
  },

  cafe(k) {
    k.body(); k.door();
    k.hipRoof(clampRise(k.w, 1.1, 1.5, 0.5));
    k.shopfront(k.w - 0.2, k.dep / 2, awn(k), 0);
    // terrace: a stone patio, two round tables, four stools
    k.box(k.w - 0.4, 0.06, 0.55, 0, 0, k.dep / 2 + 0.45, C.stone, { edge: false });
    for (const sx of [-1, 1]) {
      const x = sx * k.w * 0.24, z = k.dep / 2 + 0.5;
      k.cyl(0.04, 0.04, 0.5, 5, x, 0.06, z, C.slate, { edge: false });
      k.cyl(0.26, 0.26, 0.05, 10, x, 0.56, z, C.cream, { edge: false });
      for (const s2 of [-1, 1]) k.box(0.16, 0.22, 0.16, x + s2 * 0.38, 0.06, z, k.P.accent, { edge: false });
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
    k.box(lw, 0.55, lw, 0, lh, 0, C.cream);
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
    // stepped crown: one smaller storey on top
    const cw = k.w * 0.58, cd = k.dep * 0.58;
    k.body(cw, cd, 1, 0, -k.dep * 0.08, k.top + 0.3, C.charcoal);
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
    k.box(1.3, 1.3, 0.14, k.d.legacy ? -k.w * 0.25 : k.doorX, PLINTH, k.dep / 2 + 0.05, C.wood);   // the big work door
    const sx = k.w * 0.34;
    k.cyl(0.38, 0.5, 3.4, 8, sx, k.top, -k.dep * 0.25, C.brick);
    k.cyl(0.5, 0.5, 0.12, 8, sx, k.top + 3.4, -k.dep * 0.25, C.stone, { edge: false });
    if (k.level >= 3) { k.cyl(0.3, 0.42, 2.6, 8, sx - 1.0, k.top, -k.dep * 0.25, C.brick); k.cyl(0.4, 0.4, 0.1, 8, sx - 1.0, k.top + 2.6, -k.dep * 0.25, C.stone, { edge: false }); }
    for (let i = 0; i < 3; i++) k.box(0.45, 0.4, 0.4, -k.w * 0.4 + i * 0.5, 0, k.dep / 2 + 0.3, i === 1 ? C.stone : C.wood, { edge: false }); // crates
    decorate(k, { skip: ['chimney', 'cornice', 'gableWindow', 'dormers', 'crown', 'garden'] });
    if (k.level >= 5) k.flag(-k.w * 0.38, k.top + 0.9, -k.dep * 0.1);
  },

  warehouse(k) {
    k.body();
    k.gableRoof(clampRise(k.dep, 0.9, 1.4, 0.3), 'x', C.charcoal);
    const n = Math.max(1, Math.round(k.w / 2.4));
    for (let i = 0; i < n; i++) k.box(1.3, 1.4, 0.14, -k.w / 2 + (i + 0.5) * (k.w / n), PLINTH, k.dep / 2 + 0.05, C.wood);
    k.box(k.w * 0.7, 0.18, 0.7, 0, 0, k.dep / 2 + 0.45, C.stone, { edge: false }); // loading ramp
    decorate(k, { skip: ['chimney', 'gableWindow', 'dormers', 'garden'] });
  },

  clinic(k) {
    k.body(); k.door();
    k.gableRoof(clampRise(k.dep, 1.0, 1.5, 0.45), 'x');
    // a calm green cross on a cream plaque above the door
    const y = k.floorY(1) + 0.5, x = k.doorX;
    k.disc(0.36, x, y, k.dep / 2 + 0.12, C.cream, { thick: 0.08 });
    k.box(0.5, 0.14, 0.05, x, y - 0.07, k.dep / 2 + 0.2, C.leaf, { edge: false });
    k.box(0.14, 0.5, 0.05, x, y - 0.25, k.dep / 2 + 0.2, C.leaf, { edge: false });
    k.box(1.1, 0.1, 0.6, x, PLINTH + 1.25, k.dep / 2 + 0.3, C.leaf, { rx: 0.2 });
    decorate(k);
  },

  school(k) {
    k.body(); k.door(k.doorX, k.dep / 2, k.P.accent, 0.95, 1.1);
    k.gableRoof(clampRise(k.dep, 1.0, 1.5, 0.4), 'x');
    // bell tower on the ridge
    const tx = k.w * 0.12, ty = k.top + k.roof.rise * 0.8;
    k.box(0.9, 1.1, 0.9, tx, ty, 0, C.cream);
    k.box(0.5, 0.4, 0.06, tx, ty + 0.4, 0.46, C.glass, { edge: false });
    k.spire(0.75, 0.9, tx, ty + 1.1, 0, C.slate);
    // a small yard fence line
    k.box(k.w * 0.7, 0.3, 0.06, 0, PLINTH, k.dep / 2 + 0.4, C.wood, { edge: false });
    decorate(k, { skip: ['chimney', 'garden'] });
    if (k.level >= 3) k.flag(-k.w * 0.4, k.top + 0.2, 0);
  },

  'fire-station'(k) {
    k.body();
    k.hipRoof(clampRise(Math.min(k.w, k.dep), 1.0, 1.4, 0.4), C.terracotta);
    const n = Math.max(1, Math.round(k.w / 2.2));
    for (let i = 0; i < n; i++) {
      const x = -k.w / 2 + (i + 0.5) * (k.w / n) + (n === 1 ? k.w * 0.18 : 0);
      k.box(1.1, 1.3, 0.14, x, PLINTH, k.dep / 2 + 0.05, C.fire);
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
    k.box(1.1, 0.1, 0.6, x, PLINTH + 1.4, k.dep / 2 + 0.3, C.slate, { rx: 0.2, edge: false });
    decorate(k, { skip: ['chimney'] });
    if (k.level >= 3) k.flag(k.w * 0.38, k.top + 0.1, k.dep * 0.1);
  },

  'town-hall'(k) {
    const legacy = k.d.legacy;
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
    k.box(1.8, 0.12, 0.4, 0, 0.12, k.dep / 2 + 0.18, C.stone, { edge: false });
    k.roof = { kind: 'mansard', rise: 1.5, along: 'x', y: top, inset: 0.55 };
    decorate(k, { skip: legacy ? ['chimney', 'dormers', 'garden', 'lamp', 'cornice'] : ['chimney', 'dormers', 'cornice'] });
    if (k.level >= 5) k.weathervane(0, top + 6.8, 0);
  },

  church(k) {
    const legacy = k.d.legacy, tw = Math.min(1.9, k.w * 0.62);
    const tz = legacy ? 3.4 : k.dep / 2 - tw / 2 + 0.15, th = 7.4;
    k.body(); 
    k.gableRoof(clampRise(k.w, 1.4, 1.9, 0.5), 'z');
    // west tower with a spire; it reaches for the sky
    k.box(tw, th, tw, 0, PLINTH, tz, C.cream);
    k.spire(tw * 0.8, 3.6, 0, PLINTH + th, tz, C.terracotta);
    k.box(0.06, 0.55, 0.06, 0, PLINTH + th + 3.6, tz, C.gold, { edge: false });
    k.box(0.3, 0.06, 0.06, 0, PLINTH + th + 3.95, tz, C.gold, { edge: false });
    k.disc(0.5, 0, k.top + 1.4, tz + tw / 2 + 0.02, C.glass, { thick: 0.1 });
    k.box(0.9, 1.5, 0.14, 0, PLINTH, tz + tw / 2 + 0.03, C.wood);                  // great door
    k.roof = { kind: 'gable', rise: k.roof.rise, along: 'z', y: k.top, span: k.w, len: k.dep };
    decorate(k, { skip: ['chimney', 'gableWindow', 'garden', 'lamp', 'bunting', 'crown', 'boxes'] });
    if (k.level >= 4) for (const sx of [-1, 1]) { k.cyl(0.05, 0.05, 0.7, 5, sx * (tw / 2 + 0.5), 0, tz + tw / 2 + 0.2, C.slate, { edge: false }); k.box(0.16, 0.2, 0.16, sx * (tw / 2 + 0.5), 0.7, tz + tw / 2 + 0.2, C.lamp, { edge: false }); }
    if (k.level >= 5) k.box(0.9, 0.9, 0.12, 0, k.top + 0.2, k.dep / 2 + 0.04, C.glass, { edge: false });
  },

  // ---- parks: ground, not buildings. The lawn or paving sits on the plinth; trees, lamps and water are the details ----
  green(k) {
    lawn(k);
    tree(k, ...at(k, -0.45, -0.4), 1.0); tree(k, ...at(k, 0.5, 0.25), 0.8); tree(k, ...at(k, -0.1, 0.6), 0.6);
    k.box(0.9, 0.06, 0.28, ...at(k, 0.35, -0.7), C.wood, { edge: false });                        // a bench on the path
  },

  plaza(k) {
    k.box(k.w - 0.3, 0.06, k.dep - 0.3, 0, PLINTH, 0, C.paper, { edge: false });                 // paving
    k.cyl(0.85, 0.9, 0.22, 12, 0, PLINTH + 0.06, 0, C.stone);                                    // fountain basin
    k.cyl(0.66, 0.66, 0.05, 12, 0, PLINTH + 0.18, 0, C.water, { edge: false });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.lamp(sx * (k.w / 2 - 0.3), sz * (k.dep / 2 - 0.3), 1.0);
  },

  playground(k) {
    lawn(k);
    const bz = -0.4 * k.dep / 2;                                                                  // swing set toward the back
    for (const sx of [-1, 1]) k.cyl(0.05, 0.05, 1.2, 5, sx * 0.55, PLINTH, bz, C.slate, { edge: false });
    k.box(1.2, 0.08, 0.1, 0, PLINTH + 1.2, bz, C.slate, { edge: false });
    for (const sx of [-0.2, 0.2]) k.box(0.28, 0.05, 0.18, sx, PLINTH + 0.6, bz, C.wood, { edge: false });
    k.box(0.4, 0.06, 1.0, 0.45, PLINTH + 0.45, 0.5 * k.dep / 2, C.gold, { rx: -0.45 });            // a little slide
    tree(k, ...at(k, -0.7, 0.7), 0.7);
  },

  pond(k) {
    const r = k.w * 0.36;
    lawn(k);
    k.cyl(r + 0.14, r + 0.14, 0.14, 16, 0, PLINTH, 0, C.stone);                                  // stone rim
    k.cyl(r, r, 0.04, 16, 0, PLINTH + 0.1, 0, C.water, { edge: false });
    for (const [fx, fz] of [[-0.7, 0.3], [0.55, -0.45], [0.2, 0.7]]) k.cyl(0.03, 0.03, 0.5, 4, fx * r, PLINTH + 0.14, fz * r, C.leaf, { edge: false });
    k.box(0.9, 0.08, 0.3, 0, PLINTH + 0.3, k.dep / 2 - 0.3, C.wood, { edge: false });               // a bench by the water
  },
};

export const builderIds = () => Object.keys(B);

// Builds the parts of one building. Pure in `desc`: the same description gives the same parts.
export function buildParts(desc) {
  const fn = B[desc.model];
  if (!fn) throw new Error('no builder for model "' + desc.model + '"');
  if (!modelById(desc.model)) throw new Error('unknown model "' + desc.model + '"');
  const k = createKit(desc);
  fn(k);
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
