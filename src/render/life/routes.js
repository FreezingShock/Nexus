// Routes for the little walks in front of buildings. Pure: no THREE. A building is { x, z, rot, half, front }:
// its centre, its quarter-turn in radians, half its width and where its front wall is, all in its own frame
// (x across the front, z towards the street). A route is three waypoints { x, z, door } in world space; `door` marks the
// ones at a doorstep (a little above the street) and `face` is the yaw that looks out of the front.

// Local (lx, lz) to world.
export function toWorld(b, lx, lz) {
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  return { x: b.x + lx * c + lz * s, z: b.z - lx * s + lz * c };
}
export const faceOf = (b) => Math.atan2(-Math.cos(b.rot), Math.sin(b.rot));

const STOOP = 0.6; // how far in front of the wall people walk

// kind: 'leave' (out of the door and away along the front), 'arrive' (in along the front and through the door),
// 'step' (out, a pause at the stoop, back in). `door` is the door's local [x, z]. rnd() gives 0..1.
export function doorRoute(b, door, kind, rnd) {
  const front = b.front + STOOP, half = b.half;
  const side = rnd() < 0.5 ? -1 : 1, end = Math.max(-half - 0.9, Math.min(half + 0.9, door[0] + side * (1.6 + rnd() * 1.4)));
  const stoopX = Math.max(-half + 0.4, Math.min(half - 0.4, door[0] + (rnd() - 0.5) * 0.9));
  const a = kind === 'arrive' ? [end, front] : [door[0], door[1]];
  const m = [kind === 'step' ? stoopX : door[0] + side * 0.15, front];
  const z = kind === 'leave' ? [end, front] : [door[0], door[1]];
  const pts = [a, m, z].map(([lx, lz], i) => ({ ...toWorld(b, lx, lz), door: i === 0 ? kind !== 'arrive' : i === 2 ? kind !== 'leave' : false }));
  return { pts, face: faceOf(b), stand: kind === 'step' ? 3 + rnd() * 5 : 0, fadeIn: kind === 'arrive' ? 0.7 : 0.25, fadeOut: kind === 'leave' ? 0.7 : 0.25 };
}

// A walk from the side of the building to a seat at a terrace table and away again the other side. `seat` is local [x, z].
export function seatRoute(b, seat, rnd) {
  const front = b.front + STOOP, half = b.half, side = rnd() < 0.5 ? -1 : 1;
  const from = Math.max(-half - 0.9, Math.min(half + 0.9, side * (half + 0.9))), to = Math.max(-half - 0.9, Math.min(half + 0.9, -side * (half + 0.9)));
  const pts = [[from, front], seat, [to, front]].map(([lx, lz]) => ({ ...toWorld(b, lx, lz), door: false }));
  return { pts, face: faceOf(b), stand: 14 + rnd() * 26, fadeIn: 0.7, fadeOut: 0.7 };
}
