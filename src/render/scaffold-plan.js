// Upgrade scaffolding, the plain-data half: which poles, boards and braces wrap a building, and how big each one is
// at a given moment. No Three.js here, so tests can check the plan and the timing (render/systems/scaffold.js draws it).
//
// A building's box is in its own frame (x across, z deep, y up, as proxyFor in render/town.js measures it).
// A piece: { kind, x, y, z, sx, sy, sz, rx, rz, color, h } at full size; h is 0..1, how high up it sits.

export const RISE_S = 0.9;    // poles grow up and boards slide in, bottom first
export const HOLD_S = 1.6;    // standing, with little puffs of work dust (nate chose about 3 s in all)
export const DROP_S = 0.5;    // after the reveal: the scaffolding comes down, top first
export const REVEAL_S = RISE_S + HOLD_S;
export const DONE_S = REVEAL_S + DROP_S;
export const MAX_PIECES = 48;

const PAD = 0.32, POLE = 0.12, BOARD_T = 0.07, BOARD_D = 0.24, BRACE = 0.07;
const STEP = 1.25;            // height between board levels
export const COLORS = { pole: '#9A6B45', board: '#CFA16A', brace: '#B07D4C', flag: '#D9774F' };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function scaffoldPieces(box) {
  const x0 = box.min.x - PAD, x1 = box.max.x + PAD, z0 = box.min.z - PAD, z1 = box.max.z + PAD;
  const base = Math.min(0, box.min.y), top = box.max.y + 0.35, H = top - base;
  const W = x1 - x0, D = z1 - z0;
  const nx = clamp(Math.ceil(W / 1.9), 1, 4), nz = clamp(Math.ceil(D / 1.9), 1, 4);
  const out = [];
  const add = (p) => { if (out.length < MAX_PIECES) out.push(p); };

  // poles round the edge, corners shared
  const posts = [];
  for (let i = 0; i <= nx; i++) { const x = x0 + (W * i) / nx; posts.push([x, z0], [x, z1]); }
  for (let j = 1; j < nz; j++) { const z = z0 + (D * j) / nz; posts.push([x0, z], [x1, z]); }
  for (const [x, z] of posts) add({ kind: 'pole', x, y: base + H / 2, z, sx: POLE, sy: H, sz: POLE, rx: 0, rz: 0, color: COLORS.pole, h: 0 });

  // a walk board on every side at each level
  const levels = clamp(Math.floor((H - 0.5) / STEP), 1, 6);
  for (let l = 1; l <= levels; l++) {
    const y = base + Math.min(l * STEP, H - 0.25), h = (y - base) / H;
    add({ kind: 'board', x: (x0 + x1) / 2, y, z: z0, sx: W + POLE, sy: BOARD_T, sz: BOARD_D, rx: 0, rz: 0, color: COLORS.board, h });
    add({ kind: 'board', x: (x0 + x1) / 2, y, z: z1, sx: W + POLE, sy: BOARD_T, sz: BOARD_D, rx: 0, rz: 0, color: COLORS.board, h });
    add({ kind: 'board', x: x0, y, z: (z0 + z1) / 2, sx: BOARD_D, sy: BOARD_T, sz: D + POLE, rx: 0, rz: 0, color: COLORS.board, h });
    add({ kind: 'board', x: x1, y, z: (z0 + z1) / 2, sx: BOARD_D, sy: BOARD_T, sz: D + POLE, rx: 0, rz: 0, color: COLORS.board, h });
  }

  // one cross brace on each face, across its first bay and first level
  const bh = Math.min(STEP, H - 0.25), bw = W / nx, bd = D / nz;
  const lenX = Math.hypot(bw, bh), lenZ = Math.hypot(bd, bh);
  add({ kind: 'brace', x: x0 + bw / 2, y: base + bh / 2, z: z0, sx: lenX, sy: BRACE, sz: BRACE, rx: 0, rz: Math.atan2(bh, bw), color: COLORS.brace, h: 0.1 });
  add({ kind: 'brace', x: x1 - bw / 2, y: base + bh / 2, z: z1, sx: lenX, sy: BRACE, sz: BRACE, rx: 0, rz: -Math.atan2(bh, bw), color: COLORS.brace, h: 0.1 });
  add({ kind: 'brace', x: x0, y: base + bh / 2, z: z1 - bd / 2, sx: BRACE, sy: BRACE, sz: lenZ, rx: Math.atan2(bh, bd), rz: 0, color: COLORS.brace, h: 0.1 });
  add({ kind: 'brace', x: x1, y: base + bh / 2, z: z0 + bd / 2, sx: BRACE, sy: BRACE, sz: lenZ, rx: -Math.atan2(bh, bd), rz: 0, color: COLORS.brace, h: 0.1 });

  // a little terracotta pennant on the front corner pole
  add({ kind: 'flag', x: x0 + 0.27, y: top - 0.2, z: z0, sx: 0.42, sy: 0.26, sz: 0.03, rx: 0, rz: 0, color: COLORS.flag, h: 1 });
  return out;
}

const easeOutBack = (k) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

// How grown a piece is, 0..~1.1 (a little overshoot as it lands), `t` seconds after the scaffolding was raised.
// `dropAt` is when it starts coming down: REVEAL_S normally, sooner when the building went away mid-build.
export function pieceGrowth(piece, t, dropAt = REVEAL_S) {
  if (t >= dropAt) {
    const k = clamp((t - dropAt - (1 - piece.h) * (DROP_S - 0.2)) / 0.2, 0, 1);
    return k >= 1 ? 0 : 1 - k * k;
  }
  const k = clamp((t - piece.h * (RISE_S - 0.3)) / 0.3, 0, 1);
  return k <= 0 ? 0 : easeOutBack(k);
}

// The piece's centre and size at growth g. Poles grow up from the ground; boards and braces stretch out from the
// middle along their length; the pennant just scales.
export function pieceAt(piece, g, out = { x: 0, y: 0, z: 0, sx: 0, sy: 0, sz: 0 }) {
  out.x = piece.x; out.y = piece.y; out.z = piece.z; out.sx = piece.sx; out.sy = piece.sy; out.sz = piece.sz;
  if (piece.kind === 'pole') { const s = Math.min(g, 1); out.sy = piece.sy * s; out.y = piece.y - (piece.sy * (1 - s)) / 2; }
  else if (piece.kind === 'flag') { out.sx *= g; out.sy *= g; out.sz *= g; }
  else if (piece.sx >= piece.sz) out.sx *= g;
  else out.sz *= g;
  return out;
}
