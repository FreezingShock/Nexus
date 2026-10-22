// The building kit: small, consistent parts that every model is assembled from.
// Conventions (see docs/BUILDINGS.md): x is across the front, z is depth with the front at +z, y is up.
// Every helper takes a position whose y is the BOTTOM of the part. Colors come from one small palette (C) plus
// the district palette (k.P), and ride on vertex colors so plain parts share a single material.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { PAL, ROOFS, TRIMS, AWNINGS } from '../../world/palettes.js';
import { LANG } from '../../world/models.js';
import { toon } from '../materials.js';
import { scaleUV, splitGroups, xf } from '../geom.js';
import { wallStyle } from './materials.js';

const { FLOOR_H: FH, PLINTH, BAY } = LANG;

// The whole kit's shared colors. Keep this list short: a new color is a new idea in the design language.
export const C = {
  stone: 0xB9AD97, brick: 0x854E3C, slate: 0x4D3B2B, cream: 0xFAF3E4, paper: 0xEAE1D5, glass: 0x7F98A6,
  lamp: 0xF3D58A, wood: 0x8A6A4F, gold: 0xE6BC62, leaf: 0xA8C179, moss: 0x7D8A5E, terracotta: 0x97553E,
  rose: 0xD98C7A, fire: 0xB8574A, water: 0x7FA3B8, charcoal: 0x6B6B5A,
};
export const BUNTING = [0xD98C7A, 0xEBD9A0, 0xBFD8C4, 0xCBC3DC];

// ---- geometry ----

// Flat-shaded geometry from triangles. Faces are wound to point away from `inside`, so convex shapes cannot come out inside-out.
function solid(tris, inside) {
  const pos = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
  for (const [p, q, r] of tris) {
    a.set(...p); b.set(...q); c.set(...r);
    n.subVectors(b, a).cross(m.subVectors(c, a));
    const mid = m.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(new THREE.Vector3(...inside));
    const f = n.dot(mid) >= 0;
    pos.push(...(f ? [...p, ...q, ...r] : [...p, ...r, ...q]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// A convex polygon in the xy plane (bottom at y = 0), extruded along z. Gable ends, sawtooth teeth, belfry roofs.
export function prismGeo(poly, len) {
  const n = poly.length, z = len / 2, tris = [];
  for (let i = 1; i < n - 1; i++) { tris.push([[poly[0][0], poly[0][1], -z], [poly[i][0], poly[i][1], -z], [poly[i + 1][0], poly[i + 1][1], -z]]); tris.push([[poly[0][0], poly[0][1], z], [poly[i][0], poly[i][1], z], [poly[i + 1][0], poly[i + 1][1], z]]); }
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    tris.push([[p[0], p[1], -z], [q[0], q[1], -z], [q[0], q[1], z]], [[p[0], p[1], -z], [q[0], q[1], z], [p[0], p[1], z]]);
  }
  const cx = poly.reduce((s, p) => s + p[0], 0) / n, cy = poly.reduce((s, p) => s + p[1], 0) / n;
  return solid(tris, [cx, cy, 0]);
}

// Hipped roof: ridge along the longer side, sloping on all four. A square footprint gives a pyramid.
export function hipGeo(w, d, rise) {
  const hw = w / 2, hd = d / 2, r = Math.min(hw, hd), ex = hw - r, ez = hd - r;
  const A = [-hw, 0, -hd], B = [hw, 0, -hd], Cc = [hw, 0, hd], D = [-hw, 0, hd];
  const R0 = [-ex, rise, -ez], R1 = [ex, rise, ez];
  const tris = [[A, B, R0], [B, Cc, R1], [Cc, D, R1], [D, A, R0], [B, R1, R0], [D, R0, R1]];
  if (ex > 0) { tris.length = 0; tris.push([A, B, [ex, rise, 0]], [A, [ex, rise, 0], [-ex, rise, 0]], [B, Cc, [ex, rise, 0]], [Cc, D, [-ex, rise, 0]], [Cc, [-ex, rise, 0], [ex, rise, 0]], [D, A, [-ex, rise, 0]]); }
  else if (ez > 0) { tris.length = 0; tris.push([A, B, [0, rise, -ez]], [B, Cc, [0, rise, ez]], [B, [0, rise, ez], [0, rise, -ez]], [Cc, D, [0, rise, ez]], [D, A, [0, rise, -ez]], [D, [0, rise, -ez], [0, rise, ez]]); }
  else { tris.length = 0; tris.push([A, B, [0, rise, 0]], [B, Cc, [0, rise, 0]], [Cc, D, [0, rise, 0]], [D, A, [0, rise, 0]]); }
  return solid(tris, [0, rise / 3, 0]);
}

// Mansard crown: a steep frustum. `inset` is how far the top steps in from the walls.
export function frustumGeo(w, d, inset, h) {
  const hw = w / 2, hd = d / 2, iw = Math.max(0.1, hw - inset), id = Math.max(0.1, hd - inset);
  const b = [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd]], t = [[-iw, h, -id], [iw, h, -id], [iw, h, id], [-iw, h, id]], tris = [];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; tris.push([b[i], b[j], t[j]], [b[i], t[j], t[i]]); }
  tris.push([t[0], t[1], t[2]], [t[0], t[2], t[3]]);
  return solid(tris, [0, h / 3, 0]);
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
const cyl = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, h / 2, 0);
const spire = (r, h, seg = 4) => new THREE.ConeGeometry(r, h, seg, 1).rotateY(Math.PI / 4).translate(0, h / 2, 0);
const dome = (r) => new THREE.SphereGeometry(r, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);

// ---- the kit ----

// Starts a model: description in, helper object out. `k.parts` is what the renderer merges.
export function createKit(d) {
  const P = { ...PAL[d.pal], wallHex: parseInt(PAL[d.pal].wall.slice(1), 16) }, h = d.floors * FH, parts = [];
  if (d.roof) P.roof = ROOFS[d.roof].hex;     // a repaint wins over the scheme's own roof and trim
  if (d.trim) P.accent = TRIMS[d.trim].hex;
  const bx = Math.max(1, Math.round(d.w / BAY)), bz = Math.max(1, Math.round(d.d / BAY));
  const bayXs = [];   // x of each oriel, so trim can leave its column alone
  // Where the town can show life, in the building's own frame (see render/life). Recorded as the builder places things,
  // so a chimney, door or awning that moves in a builder moves its smoke, its visitors and its flutter with it.
  const sites = { bodies: [], chimneys: [], doors: [], awnings: [], stacks: [], fronts: [], tables: [], swings: [], farm: null };
  const k = {
    d, P, w: d.w, dep: d.d, floors: d.floors, h, level: d.level, t: d.t, parts, bx, bz, sites,
    top: PLINTH + h,           // y of the wall top
    roof: { kind: 'flat', rise: 0, along: 'z', y: PLINTH + h },   // filled in by a roof helper; decorations read it
    doorX: d.dx ?? (d.t[4] - 0.5) * d.w * 0.3,
    bayX: (i) => -d.w / 2 + (i + 0.5) * d.w / bx,
    bayZ: (i) => -d.d / 2 + (i + 0.5) * d.d / bz,
    floorY: (f) => PLINTH + f * FH,

    // place any geometry; y is the bottom of the part
    part(geo, color, x = 0, y = 0, z = 0, o = {}) {
      parts.push({ geo, mat: toon(color), color: new THREE.Color(color), local: xf(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.sx || 1, o.sy || 1, o.sz || 1), edge: o.edge !== false });
      return geo;
    },
    box(w, hh, dd, x, y, z, color, o) { return k.part(box(w, hh, dd), color, x, y, z, o); },
    cyl(rt, rb, hh, seg, x, y, z, color, o) { return k.part(cyl(rt, rb, hh, seg), color, x, y, z, o); },
    spire(r, hh, x, y, z, color, o) { return k.part(spire(r, hh), color, x, y, z, o); },
    dome(r, x, y, z, color, o) { return k.part(dome(r), color, x, y, z, o); },
    // a disc facing the front (clock faces, round windows)
    disc(r, x, y, z, color, o = {}) { return k.part(new THREE.CylinderGeometry(r, r, o.thick || 0.1, 14), color, x, y, z, { rx: Math.PI / 2, edge: o.edge }); },

    // the walls: textured box. Window rhythm comes from the style texture repeated per bay and storey.
    body(w = d.w, dd = d.d, floors = d.floors, x = 0, z = 0, y0 = PLINTH, roofColor = P.roof, style = d.style) {
      const hh = floors * FH, geo = new THREE.BoxGeometry(w, hh, dd);
      const nx = Math.max(1, Math.round(w / BAY)), nz = Math.max(1, Math.round(dd / BAY));
      scaleUV(geo, 0, 8, nz, floors); scaleUV(geo, 16, 8, nx, floors);
      parts.push({ geo, splits: splitGroups(geo), mat: toon(roofColor), color: new THREE.Color(roofColor), facadeMat: wallStyle(d.pal, style, d.trim), local: xf(x, y0 + hh / 2, z), edge: true, body: true });
      sites.bodies.push({ x, z, y0, w, d: dd, floors, style });
      return geo;
    },
    plinth(w = d.w, dd = d.d, x = 0, z = 0) {
      k.box(w + 0.15, PLINTH, dd + 0.15, x, 0, z, C.stone);
      k.box(w + 0.1, 0.7, dd + 0.1, x, -0.7, z, C.stone, { edge: false }); // foundation: hides the gap on a slope
    },

    // ---- openings and street level ----
    door(x = k.doorX, z = d.d / 2, color = P.accent, w = 0.75, hh = 1.05) { k.box(w, hh, 0.14, x, PLINTH, z + 0.05, color); sites.doors.push([x, z + 0.12]); return x; },
    awning(x, z, w, color, y = PLINTH + 1.45) { k.box(w, 0.1, 0.8, x, y, z + 0.4, color, { rx: 0.28 }); sites.awnings.push({ x, y: y - 0.15, z: z + 0.78, w, color }); },
    // a shopfront band: big glass under an awning on the ground floor
    shopfront(w, z, color, x = 0) {
      k.box(w - 0.5, 0.85, 0.1, x, PLINTH + 0.1, z + 0.04, C.glass, { edge: false });
      sites.fronts.push({ x, y: PLINTH + 0.52, z: z + 0.1, w: w - 0.6, h: 0.7 });
      k.awning(x, z, w - 0.3, color, PLINTH + 1.05);
    },

    // ---- roofs (each records k.roof so decorations know where the slope is) ----
    // ridge along z means the narrow gable end faces the street; along x means the long eave does.
    gableRoof(rise, along = 'z', color = P.roof, o = {}) {
      const span = along === 'z' ? d.w : d.d, len = along === 'z' ? d.d : d.w, over = 0.15;
      const geo = prismGeo([[-span / 2 - over, 0], [span / 2 + over, 0], [0, rise]], len + 0.3);
      k.part(geo, color, o.x || 0, k.top, o.z || 0, { ry: along === 'x' ? Math.PI / 2 : 0 });
      k.roof = { kind: 'gable', rise, along, y: k.top, span, len };
    },
    hipRoof(rise, color = P.roof) {
      k.part(hipGeo(d.w + 0.3, d.d + 0.3, rise), color, 0, k.top, 0);
      k.roof = { kind: 'hip', rise, along: d.w >= d.d ? 'x' : 'z', y: k.top, span: Math.min(d.w, d.d), len: Math.max(d.w, d.d) };
    },
    mansardRoof(rise = 1.5, inset = 0.55, color = P.roof) {
      k.part(frustumGeo(d.w + 0.24, d.d + 0.24, inset, rise), color, 0, k.top, 0);
      k.roof = { kind: 'mansard', rise, along: 'x', y: k.top, inset, span: d.d, len: d.w };
    },
    // flat roof with a low parapet in a stone tone
    flatRoof(parapet = 0.4, color = C.charcoal) {
      k.box(d.w + 0.12, parapet, d.d + 0.12, 0, k.top, 0, color);
      k.roof = { kind: 'flat', rise: parapet, along: 'z', y: k.top + parapet };
    },
    sawtooth(teeth, rise, color = P.roof) {
      const tw = d.w / teeth;
      for (let i = 0; i < teeth; i++) k.part(prismGeo([[0, 0], [tw, 0], [0, rise]], d.d + 0.2), color, -d.w / 2 + i * tw, k.top, 0);
      k.roof = { kind: 'sawtooth', rise, along: 'z', y: k.top };
    },

    // ---- roof furniture ----
    chimney(sx = 1, sz = -1) { k.chimneyAt(sx * d.w * 0.22, sz * d.d * 0.22); },
    chimneyAt(x, z, rise = k.roof.rise, color = C.brick) {
      const r = k.roof, y = r.kind === 'flat' ? r.y : k.top + rise * 0.4, topY = (r.kind === 'flat' ? r.y : k.top + rise) + 0.55;
      k.box(0.4, topY - y, 0.4, x, y, z, color);
      k.box(0.52, 0.08, 0.52, x, topY, z, C.stone, { edge: false });
      sites.chimneys.push([x, topY + 0.1, z]);
    },
    // an oriel bay: a window box that juts out of the front wall, with glass on its face and a small cap.
    // Plain parts only (no texture), so it costs no extra material.
    bay(floor, x, w = 1.0, color = C.cream) {
      // box() centres on x and z and puts y at the bottom. The body sinks 0.03 into the wall so it never shows a gap.
      const depth = 0.35, y = k.floorY(floor) + 0.15, hh = 0.7, zc = d.d / 2 + depth / 2 - 0.03, front = zc + depth / 2;
      bayXs.push(x);
      k.box(w, hh, depth, x, y, zc, color);
      k.box(w * 0.68, hh * 0.62, 0.04, x, y + hh * 0.19, front, C.glass, { edge: false });
      k.box(w + 0.12, 0.1, depth + 0.1, x, y + hh, zc, P.roof, { edge: false });
    },
    // ---- trim: one of three details per building, picked by its traits (t[9]), so neighbours never match ----
    //   0 corbels: small brackets under the eave, one per bay (none in an oriel's column)
    //   1 string courses: two or three thin bands across the front wall
    //   2 roof dressing: a ridge cap on pitched roofs, a coping on flat ones
    // The band colour comes from t[10]; t[11] adds a third course. Each style stays under about 90 triangles.
    trim(units) {
      const style = Math.floor(d.t[9] * 3), accent = [C.stone, C.cream, P.accent][Math.floor(d.t[10] * 3)], z = d.d / 2, r = k.roof;
      if (style === 0) {
        for (let i = 0; i < bx; i++) {
          const x = k.bayX(i);
          if (bayXs.some((ox) => Math.abs(ox - x) < 0.9)) continue;
          k.box(0.16, 0.24, 0.22, x, k.top - 0.46, z + 0.11, accent);
        }
      } else if (style === 1) {
        const n = d.t[11] < 0.5 ? 2 : 3, lines = new Set();
        for (let i = 1; i <= n; i++) lines.add(Math.max(1, Math.round((i * k.floors) / (n + 1))));
        for (const f of lines) k.box(d.w + 0.06, 0.07, 0.06, 0, k.floorY(f), z + 0.03, accent);
      } else if (r.kind === 'flat') {
        k.box(d.w + 0.16, 0.1, d.d + 0.16, 0, r.y, 0, accent);
      } else if ((r.kind === 'gable' || r.kind === 'hip') && !units) {
        const len = r.kind === 'hip' ? Math.max(0.3, r.len - r.span) : r.len + 0.2, y = r.y + r.rise - 0.02;
        if (r.along === 'z') k.box(0.14, 0.1, len, 0, y, 0, C.slate);
        else k.box(len, 0.1, 0.14, 0, y, 0, C.slate);
      }
    },
    balcony(floor, x, w = 1.1) {
      k.box(w, 0.08, 0.5, x, k.floorY(floor), d.d / 2 + 0.25, C.stone, { edge: false });
      k.box(w, 0.28, 0.05, x, k.floorY(floor) + 0.08, d.d / 2 + 0.48, C.cream, { edge: false });
    },
    // dormers on the front slope of a mansard, hip or long-eave gable roof
    dormers(n, color = P.accent) {
      const r = k.roof; if (r.kind === 'gable' && r.along !== 'x') return;
      const slope = r.kind === 'mansard' ? r.inset * 0.45 : (r.span / 2) * 0.35;
      for (let i = 0; i < n; i++) {
        const x = n === 1 ? 0 : -d.w * 0.28 + i * (d.w * 0.56 / (n - 1));
        const y = k.top + r.rise * (r.kind === 'mansard' ? 0.18 : 0.12), z = d.d / 2 - slope;
        k.box(0.7, 0.62, 0.5, x, y, z, color);
        k.box(0.5, 0.36, 0.06, x, y + 0.12, z + 0.26, C.glass, { edge: false });
        k.part(prismGeo([[-0.42, 0], [0.42, 0], [0, 0.34]], 0.6), P.roof, x, y + 0.62, z);
      }
    },
    // round window in a street-facing gable
    gableWindow(x = 0, rise = k.roof.rise) {
      const r = k.roof; if (r.kind !== 'gable' || r.along !== 'z') return;
      k.disc(0.2, x, k.top + rise * 0.32, d.d / 2 + 0.17, C.cream, { thick: 0.08 });
      k.disc(0.13, x, k.top + rise * 0.32, d.d / 2 + 0.2, C.glass, { thick: 0.06, edge: false });
    },
    cornice(color = C.cream) { k.box(d.w + 0.24, 0.14, d.d + 0.24, 0, k.top - 0.12, 0, color, { edge: false }); },
    // two flower pots flanking the door
    pots(x = k.doorX) {
      for (const s of [-1, 1]) { k.cyl(0.14, 0.11, 0.24, 7, x + s * 0.62, 0, d.d / 2 + 0.28, C.terracotta, { edge: false }); k.box(0.3, 0.2, 0.3, x + s * 0.62, 0.24, d.d / 2 + 0.28, C.leaf, { edge: false }); }
    },
    flag(x, y, z, color = BUNTING[Math.floor(d.t[7] * 4)]) {
      k.cyl(0.03, 0.03, 1.3, 5, x, y, z, C.slate, { edge: false });
      k.box(0.55, 0.32, 0.03, x + 0.28, y + 0.9, z, color, { edge: false });
    },
    weathervane(x, y, z) {
      k.cyl(0.03, 0.03, 0.7, 5, x, y, z, C.slate, { edge: false });
      k.box(0.45, 0.1, 0.04, x, y + 0.55, z, C.gold, { edge: false });
      k.box(0.1, 0.1, 0.1, x, y + 0.7, z, C.gold, { edge: false });
    },

    // ---- front-of-house charm ----
    // window boxes under the windows of one storey. Flowers vary by seed.
    windowBoxes(floor = 1, color = C.leaf) {
      const y = k.floorY(floor) + 0.18, bloom = [0xD98C7A, 0xEBD9A0, 0xCBC3DC, 0xE9C1B8][Math.floor(d.t[6] * 4)];
      for (let i = 0; i < bx; i++) {
        const x = k.bayX(i);
        if (Math.abs(x - k.doorX) < 0.5 && floor === 0) continue;
        k.box(0.64, 0.17, 0.26, x, y, d.d / 2 + 0.1, color, { edge: false });
        k.box(0.5, 0.13, 0.16, x, y + 0.17, d.d / 2 + 0.1, bloom, { edge: false });
      }
    },
    lamp(x, z, h = 1.1) {
      k.cyl(0.05, 0.05, h, 5, x, 0, z, C.slate, { edge: false });
      k.box(0.22, 0.26, 0.22, x, h, z, C.lamp, { edge: false });
    },
    hedge(w, x, z, hh = 0.42) { k.box(w, hh, 0.36, x, 0, z, C.moss, { edge: false }); k.box(w * 0.7, 0.1, 0.3, x, hh, z, C.leaf, { edge: false }); },
    bunting(n = 5, y = k.top - 0.45, z = d.d / 2 + 0.16) {
      for (let i = 0; i < n; i++) {
        const x = -d.w / 2 + 0.3 + i * ((d.w - 0.6) / Math.max(1, n - 1));
        k.box(0.3, 0.34, 0.04, x, y, z, BUNTING[(i + Math.floor(d.t[8] * 4)) % 4], { edge: false });
      }
    },
  };
  k.plinth();
  return k;
}

// Called once the builder is done, when the roof is known: the roof edge a cat can sit on, as [x, y, z] or null.
// Only low buildings get one, so the cat can be seen from the usual camera.
export function finishSites(k) {
  const r = k.roof, s = k.sites;
  s.perch = null;
  if (!r || k.floors > 3) return s;
  if (r.kind === 'flat') s.perch = [k.w * 0.28, r.y, k.dep / 2 - 0.2];
  else if (r.kind === 'gable' && r.along === 'z') s.perch = [0, r.y + r.rise, k.dep * 0.18];
  else if (r.kind === 'gable') s.perch = [k.w * 0.25, r.y + r.rise, 0];
  else s.perch = [k.w * 0.26, r.y + 0.14, k.dep / 2 - 0.12];
  return s;
}

// Upgrade details shared by every model, so a level means the same thing across the town.
//   L2 tended    window boxes
//   L3 settled   chimney on the roof, a cream cornice, a round gable window
//   L4 charming  dormers on long-eave roofs, a front hedge, a lamp by the door
//   L5 festive   bunting, a weathervane or flag
// o.units: [{ x, rise }] for models made of side-by-side gables; o.skip: names of details a model handles itself;
// o.hearth: the chimney comes at every level.
export function decorate(k, o = {}) {
  const L = k.level, r = k.roof, t = k.t, skip = o.skip || [], pitched = r.kind === 'gable' || r.kind === 'hip' || r.kind === 'mansard';
  const units = o.units || [{ x: 0, rise: r.rise }], on = (n) => !skip.includes(n);
  if (on('trim')) k.trim(o.units);
  if (L >= 2 && on('boxes')) { k.windowBoxes(Math.min(1, k.floors - 1)); if (on('pots')) k.pots(); }
  // o.hearth: a humble house has its chimney from the first level (so its smoke shows from the start); the rest earn it at L3.
  if ((L >= 3 || o.hearth) && on('chimney')) {
    if (o.units) units.forEach((u, i) => { if (units.length === 1 || i % 2 === (t[3] < 0.5 ? 0 : 1) % 2) k.chimneyAt(u.x + 0.35, -k.dep * 0.2, u.rise); });
    else k.chimney(t[3] < 0.5 ? -1 : 1, -1);
  }
  if (L >= 3) {
    if (on('cornice')) k.cornice(L >= 5 ? C.gold : C.cream);
    if (on('gableWindow')) for (const u of units) k.gableWindow(u.x, u.rise);
  }
  if (L >= 4) {
    if (r.kind !== 'mansard' && on('dormers') && r.along === 'x') k.dormers(k.w > 3.6 ? 2 : 1);
    if (on('garden')) { k.hedge(k.w * 0.3, -k.w * 0.3, k.dep / 2 + 0.38); k.hedge(k.w * 0.2, k.w * 0.36, k.dep / 2 + 0.38); }
    if (on('lamp')) k.lamp(k.doorX + 0.55, k.dep / 2 + 0.3);
  }
  if (L >= 5) {
    if (on('bunting')) k.bunting(5);
    if (on('crown')) { if (pitched) k.weathervane(0, k.top + r.rise, 0); else k.flag(k.w * 0.3, r.y, -k.dep * 0.2); }
  }
}
