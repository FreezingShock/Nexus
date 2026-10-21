// Builds the look of road tiles from the road records: sidewalk slab, asphalt that bends and branches, paint, ink edges.
// One vertex-colored mesh plus one line buffer per call, so a chunk costs two draw calls. No sim access: callers pass the
// road map ({ [tileIndex]: { t, d } }) and the tiles to emit.
import * as THREE from '../../vendor/three/three.module.min.js';
import { GRID_HALF, TILE, tileIndex } from '../world/grid.js';
import { DIRS, connMask, dirsOfMask, shapeOf } from '../world/roadnet.js';
import { heightAt } from '../world/terrain.js';
import { toonUncached, lineMat } from './materials.js';

// Roads hug the ground: every vertex rides on the terrain height (zero on the flat plain).
export const groundY = (x, z) => Math.max(0, heightAt(x, z));

const H = TILE / 2;           // half a tile
const HW = 1.3;               // half the asphalt width
const Y_SIDE = 0.1, Y_ASPH = 0.12, Y_PAINT = 0.135, Y_INK = 0.128;
const SEG = 8;                // segments in a quarter turn

const hex = (n) => [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
const SIDEWALK = hex(0xDDD3C0), CREAM = hex(0xFAF3E4), BIKE = hex(0xA8C179), BUS = hex(0xEBD9A0), INKC = hex(0x2B2620);
export const ASPHALT = { two: hex(0x8E8576), bike: hex(0x8E8576), one: hex(0x8E8576), bus: hex(0x8E8576), free: hex(0x6F685A) };

export const roadMaterial = () => toonUncached(0xffffff, { vertexColors: true });

export const tileWorld = (gx, gz) => [(gx - GRID_HALF) * TILE, (gz - GRID_HALF) * TILE];

// Collects triangles and ink lines. Tracks which vertices belong to the asphalt of each tile so traffic can tint them.
export class Acc {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.idx = []; this.lines = []; this.n = 0; this.asphalt = new Map(); this._tag = null; }

  // Flat polygon facing up (y fixed). Points are [x, z]; winding is fixed up here so callers need not care.
  poly(y, pts, col) {
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const p = area > 0 ? pts.slice().reverse() : pts;
    const base = this.n;
    for (const [x, z] of p) { this.pos.push(x, y + groundY(x, z), z); this.nor.push(0, 1, 0); this.col.push(col[0], col[1], col[2]); this.n++; }
    for (let i = 1; i < p.length - 1; i++) this.idx.push(base, base + i, base + i + 1);
    if (this._tag) { const t = this._tag; if (t.start < 0) t.start = base; t.end = this.n; }
  }

  // A vertical wall from y0 to y1 along (x0,z0)-(x1,z1), facing the way given by (nx, nz).
  wall(x0, z0, x1, z1, y0, y1, nx, nz, col) {
    const base = this.n;
    const v = [[x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0]];
    for (const [x, y, z] of v) { this.pos.push(x, y + groundY(x, z), z); this.nor.push(nx, 0, nz); this.col.push(col[0], col[1], col[2]); this.n++; }
    // choose winding so the face points along (nx, nz)
    const e1 = [x1 - x0, 0, z1 - z0], e2 = [0, y1 - y0, 0];
    const cy = e1[2] * e2[0] - e1[0] * e2[2], cx = e1[1] * e2[2] - e1[2] * e2[1], cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (cx * nx + cy * 0 + cz * nz >= 0) this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  line(x0, y, z0, x1, z1) { this.lines.push(x0, y + groundY(x0, z0), z0, x1, y + groundY(x1, z1), z1); }

  // Flat rectangle: center, half length along `angle` (radians in the x-z plane), half width across.
  rect(y, cx, cz, hl, hw, angle, col) {
    const c = Math.cos(angle), s = Math.sin(angle), p = (u, v) => [cx + u * c - v * s, cz + u * s + v * c];
    this.poly(y, [p(-hl, -hw), p(hl, -hw), p(hl, hw), p(-hl, hw)], col);
  }

  // Quarter ring around corner point (px, pz): radii r0..r1, from direction u0 to u1 (unit vectors in x-z).
  ring(y, px, pz, u0, u1, r0, r1, col, edge) {
    let prevA = null, prevB = null;
    for (let k = 0; k <= SEG; k++) {
      const f = (k / SEG) * Math.PI / 2, c = Math.cos(f), s = Math.sin(f);
      const dx = c * u0[0] + s * u1[0], dz = c * u0[1] + s * u1[1];
      const a = [px + dx * r0, pz + dz * r0], b = [px + dx * r1, pz + dz * r1];
      if (prevA) {
        this.poly(y, [prevA, prevB, b, a], col);
        if (edge) { this.line(prevA[0], edge, prevA[1], a[0], a[1]); this.line(prevB[0], edge, prevB[1], b[0], b[1]); }
      }
      prevA = a; prevB = b;
    }
  }

  toMesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    return m;
  }
  toLines() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.lines, 3));
    return new THREE.LineSegments(g, lineMat);
  }
}

const unit = (d) => DIRS[d];
const neg = (v) => [-v[0], -v[1]];

// Asphalt and its ink edge for a tile of the given shape. `y` lets the ghost sit a hair above the real road.
function asphalt(acc, cx, cz, shape, col, y) {
  const { kind, dirs } = shape, ey = y + 0.008;
  const box = (x0, z0, x1, z1) => acc.poly(y, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], col);
  switch (kind) {
    case 'iso': box(cx - HW, cz - HW, cx + HW, cz + HW); return;
    case 'straight': {
      const d = dirs[0] % 2 === 0; // east-west
      if (d) { box(cx - H, cz - HW, cx + H, cz + HW); acc.line(cx - H, ey, cz - HW, cx + H, cz - HW); acc.line(cx - H, ey, cz + HW, cx + H, cz + HW); }
      else { box(cx - HW, cz - H, cx + HW, cz + H); acc.line(cx - HW, ey, cz - H, cx - HW, cz + H); acc.line(cx + HW, ey, cz - H, cx + HW, cz + H); }
      return;
    }
    case 'corner': {
      const [a, b] = dirs, A = unit(a), B = unit(b);
      acc.ring(y, cx + (A[0] + B[0]) * H, cz + (A[1] + B[1]) * H, neg(B), neg(A), H - HW, H + HW, col, ey);
      return;
    }
    default: { // end, tee, cross: a center square with an arm to every connection
      let x0 = cx - HW, x1 = cx + HW, z0 = cz - HW, z1 = cz + HW;
      box(x0, z0, x1, z1);
      for (const d of dirs) {
        const [dx, dz] = unit(d);
        if (dx) box(Math.min(cx + dx * HW, cx + dx * H), cz - HW, Math.max(cx + dx * HW, cx + dx * H), cz + HW);
        else box(cx - HW, Math.min(cz + dz * HW, cz + dz * H), cx + HW, Math.max(cz + dz * HW, cz + dz * H));
      }
      // ink: arm sides, and a cap on every side without a connection
      for (let d = 0; d < 4; d++) {
        const [dx, dz] = unit(d), [px, pz] = [-dz, dx];
        if (dirs.includes(d)) {
          for (const s of [-1, 1]) acc.line(cx + dx * HW + px * HW * s, ey, cz + dz * HW + pz * HW * s, cx + dx * H + px * HW * s, cz + dz * H + pz * HW * s);
        } else {
          acc.line(cx + dx * HW - px * HW, ey, cz + dz * HW - pz * HW, cx + dx * HW + px * HW, cz + dz * HW + pz * HW);
        }
      }
    }
  }
}

// Emits every listed tile. tiles: [[gx, gz], ...]. roads: the full map (used for connections).
export function emitTiles(acc, tiles, roads, opts = {}) {
  const lift = opts.lift || 0, trackAsphalt = !!opts.trackAsphalt;
  for (const [gx, gz] of tiles) {
    const idx = tileIndex(gx, gz), rec = roads[idx];
    if (!rec) continue;
    const mask = connMask(roads, gx, gz), shape = shapeOf(mask), [cx, cz] = tileWorld(gx, gz);
    // sidewalk: a full tile slab with ink on the sides that face open ground
    const ys = Y_SIDE + lift;
    acc.poly(ys, [[cx - H, cz - H], [cx + H, cz - H], [cx + H, cz + H], [cx - H, cz + H]], SIDEWALK);
    for (let d = 0; d < 4; d++) {
      if (mask & (1 << d)) continue;
      const [dx, dz] = unit(d), [px, pz] = [-dz, dx];
      const x0 = cx + dx * H - px * H, z0 = cz + dz * H - pz * H, x1 = cx + dx * H + px * H, z1 = cz + dz * H + pz * H;
      acc.wall(x0, z0, x1, z1, lift - 0.25, ys, dx, dz, SIDEWALK);
      acc.line(x0, ys + 0.004, z0, x1, z1);
    }
    if (trackAsphalt) acc._tag = { start: -1, end: -1 };
    asphalt(acc, cx, cz, shape, ASPHALT[rec.t], Y_ASPH + lift);
    if (trackAsphalt) { acc.asphalt.set(idx, acc._tag); acc._tag = null; }
    paintTile(acc, cx, cz, rec, shape, mask, roads, gx, gz, Y_PAINT + lift);
  }
}

const dash = (acc, y, cx, cz, hl, ang) => acc.rect(y, cx, cz, hl, 0.07, ang, CREAM);

function arrow(acc, y, x, z, fx, fz) {
  const px = -fz, pz = fx, p = (u, v) => [x + fx * u + px * v, z + fz * u + pz * v];
  acc.poly(y, [p(-0.55, -0.07), p(0.05, -0.07), p(0.05, 0.07), p(-0.55, 0.07)], CREAM);
  acc.poly(y, [p(0.0, -0.32), p(0.62, 0), p(0.0, 0.32)], CREAM);
}

function paintTile(acc, cx, cz, rec, shape, mask, roads, gx, gz, y) {
  const { kind, dirs } = shape, t = rec.t;
  const stripCol = t === 'bike' ? BIKE : t === 'bus' ? BUS : null, sw = t === 'bus' ? 0.6 : 0.4;
  if (kind === 'straight') {
    const ew = dirs[0] % 2 === 0, ang = ew ? 0 : Math.PI / 2;
    if (stripCol) for (const s of [-1, 1]) {
      const off = s * (HW - sw / 2);
      acc.rect(y, cx + (ew ? 0 : off), cz + (ew ? off : 0), H, sw / 2, ang, stripCol);
    }
    if (t === 'free') {
      for (const s of [-1, 1]) acc.rect(y, cx + (ew ? 0 : s * 0.1), cz + (ew ? s * 0.1 : 0), H, 0.04, ang, INKC);
    } else dash(acc, y, cx, cz, 0.55, ang);
    if (t === 'one' && rec.d !== undefined && (rec.d % 2 === 0) === ew) { const [fx, fz] = unit(rec.d); arrow(acc, y, cx - fx * 0.0, cz - fz * 0.0, fx, fz); }
    // zebra crossing on the end that meets a junction
    for (const d of dirs) {
      const nx = gx + DIRS[d][0], nz = gz + DIRS[d][1], nm = connMask(roads, nx, nz);
      if (dirsOfMask(nm).length >= 3) {
        const [dx, dz] = unit(d);
        for (let k = -2; k <= 2; k++) {
          const lat = k * 0.48, zx = cx + dx * 1.15 + (ew ? 0 : lat), zz = cz + dz * 1.15 + (ew ? lat : 0);
          acc.rect(y, zx, zz, 0.26, 0.14, ang, CREAM);
        }
      }
    }
  } else if (kind === 'corner') {
    const [a, b] = dirs, A = unit(a), B = unit(b), px = cx + (A[0] + B[0]) * H, pz = cz + (A[1] + B[1]) * H;
    const u0 = neg(B), u1 = neg(A);
    const at = (r, f) => [px + r * (Math.cos(f) * u0[0] + Math.sin(f) * u1[0]), pz + r * (Math.cos(f) * u0[1] + Math.sin(f) * u1[1])];
    if (stripCol) {
      acc.ring(y, px, pz, u0, u1, H - HW, H - HW + sw, stripCol);
      acc.ring(y, px, pz, u0, u1, H + HW - sw, H + HW, stripCol);
    }
    if (t === 'free') {
      acc.ring(y, px, pz, u0, u1, H - 0.1 - 0.04, H - 0.1 + 0.04, INKC);
      acc.ring(y, px, pz, u0, u1, H + 0.1 - 0.04, H + 0.1 + 0.04, INKC);
    } else for (const f of [0.28, 0.785, 1.29]) {
      const [x, z] = at(H, f), tx = -Math.sin(f) * u0[0] + Math.cos(f) * u1[0], tz = -Math.sin(f) * u0[1] + Math.cos(f) * u1[1];
      dash(acc, y, x, z, 0.28, Math.atan2(tz, tx));
    }
    if (t === 'one' && rec.d !== undefined && (rec.d === a || rec.d === b)) {
      const [x, z] = at(H, Math.PI / 4), s = Math.SQRT1_2;
      const f = rec.d === b ? [(B[0] - A[0]) * s, (B[1] - A[1]) * s] : [(A[0] - B[0]) * s, (A[1] - B[1]) * s];
      arrow(acc, y, x, z, f[0], f[1]);
    }
  }
}
