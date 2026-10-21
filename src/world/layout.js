// The town as plain data, generated from a fixed seed. No DOM, no THREE.
// The rng call order below matches the approved mockup on purpose, so the town is identical.
import { makeRng } from './rng.js';
import { heightAt, riverX, farmMask } from './terrain.js';
import { AWNINGS, CAR_COLORS, FARM_COLORS, TREE_COLORS } from './palettes.js';

export const SEED = 11;
export const LINES = [-24, -12, 0, 12, 24];
const blockAt = (i) => -18 + 12 * i;

let cached = null;
export function getLayout() {
  if (!cached) cached = generate();
  return cached;
}

function generate() {
  const rng = makeRng(SEED);
  const out = { farms: [], segs: [], pads: [], parks: [], buildings: [], trees: [], pines: [], lamps: [], cars: [], turbines: [] };

  // farmland
  for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) {
    const w = 6.4 + rng() * 1.2, d = 9 + rng() * 1.5;
    const col = Math.floor(rng() * FARM_COLORS.length);
    out.farms.push({ x: -40 - i * 8, z: -26 + j * 12, w, d, col, turned: rng() < 0.5 });
  }

  // road segments with a placeholder flow (replaced by the traffic model later)
  const seg = (ax, len, fixed, center) => {
    const flow = Math.max(0.12, 1 - (Math.abs(fixed) + Math.abs(center)) / 46 + rng() * 0.35);
    out.segs.push({ ax, len, fixed, center, w: 3.2, flow: Math.min(1.05, flow) });
  };
  for (let a = 0; a < LINES.length; a++) {
    for (let b = 0; b < LINES.length - 1; b++) {
      const len = 12 - 3.2, c = (LINES[b] + LINES[b + 1]) / 2;
      seg('x', len, LINES[a], c); seg('z', len, LINES[a], c);
    }
  }
  seg('x', 34, 0, 24 + 1.6 + 17);
  out.intersections = [];
  for (const a of LINES) for (const b of LINES) out.intersections.push([a, b]);

  // buildings
  let nextId = 0;
  const makeBuilding = (o) => {
    const dx = (rng() - 0.5) * o.w * 0.3;
    let awning = -1;
    if (o.floors <= 3 && o.shop !== false) awning = Math.floor(rng() * AWNINGS.length);
    const level = 1 + Math.floor(rng() * 3);
    const b = { id: 'b' + nextId++, type: o.type || 'house', name: o.name, w: o.w, d: o.d, floors: o.floors, pal: o.pal, roof: o.roof, dx, awning, level };
    out.buildings.push(b);
    return b;
  };
  const treesRaw = [];
  const hall = [2, 1], church = [1, 1];
  for (let bi = 0; bi < 4; bi++) for (let bj = 0; bj < 4; bj++) {
    const cx = blockAt(bi), cz = blockAt(bj);
    const key = cx < 0 ? (cz < 0 ? 'warm' : 'slate') : (cz < 0 ? 'pastel' : 'green');
    const isPark = (bi === 3 && bj === 0) || (bi === 0 && bj === 3);
    out.pads.push({ x: cx, z: cz, park: isPark });
    if (isPark) {
      for (let k = 0; k < 9; k++) {
        const px = cx + (k % 3 - 1) * 2.8 + (rng() - 0.5), pz = cz + (Math.floor(k / 3) - 1) * 2.8 + (rng() - 0.5);
        if (Math.abs(px - cx) < 1 && Math.abs(pz - cz) < 1) continue;
        treesRaw.push([px, pz, 1.1 + rng() * 0.5]);
      }
      out.parks.push({ x: cx, z: cz, pond: bi === 0 });
      continue;
    }
    if (bi === hall[0] && bj === hall[1]) {
      const b = makeBuilding({ type: 'hall', w: 9, d: 5.6, floors: 3, pal: 'warm', roof: 'mansard', name: 'Town hall', shop: false });
      b.level = 3; b.x = cx; b.z = cz; b.rotY = 0; continue;
    }
    if (bi === church[0] && bj === church[1]) {
      const b = makeBuilding({ type: 'church', w: 3.4, d: 6.4, floors: 2, pal: 'slate', roof: 'gable', name: 'Church', shop: false });
      b.level = 2; b.x = cx + 1; b.z = cz; b.rotY = 0;
      treesRaw.push([cx - 3.4, cz - 3, 1.2], [cx - 3.4, cz + 3, 1.1], [cx + 3.4, cz - 3.2, 1.3]);
      continue;
    }
    for (const ox of [-2.3, 2.3]) for (const oz of [-2.3, 2.3]) {
      const x = cx + ox, z = cz + oz, dist = Math.hypot(x, z);
      let floors, roof;
      if (dist < 14) { floors = 5 + Math.floor(rng() * 6); roof = floors >= 7 ? 'flat' : 'mansard'; }
      else if (dist < 24) { floors = 4 + Math.floor(rng() * 3); roof = 'mansard'; }
      else { floors = 2 + Math.floor(rng() * 2); roof = rng() < 0.5 ? 'gable' : 'hip'; }
      const name = roof === 'flat' ? 'Tower block' : roof === 'mansard' ? 'Mansard block' : 'Terrace house';
      const w = 3.3 + rng() * 0.7, d = 3.3 + rng() * 0.7;
      const b = makeBuilding({ w, d, floors, pal: key, roof, name });
      b.x = x; b.z = z; b.rotY = oz > 0 ? 0 : Math.PI;
      if (rng() < 0.35) treesRaw.push([x + ox * 0.45, z + oz * 0.62, 0.8 + rng() * 0.3]);
    }
  }
  {
    const f = makeBuilding({ type: 'factory', w: 7, d: 5, floors: 2, pal: 'slate', roof: 'flat', name: 'Workshop', shop: false });
    f.level = 2; f.x = 38; f.y = 0; f.z = -16; f.rotY = -Math.PI / 2;
  }
  out.turbines.push({ x: 40, z: -4, speed: 0.9 }, { x: -30, z: -40, speed: 0.7 });

  // trees, pines, street trees
  for (let i = 0; i < 110; i++) {
    const x = (rng() - 0.5) * 180, z = (rng() - 0.5) * 180, d = Math.max(Math.abs(x), Math.abs(z));
    if (d < 33 || Math.abs(x - riverX(z)) < 9 || farmMask(x, z) > 0.05) continue;
    treesRaw.push([x, z, 1 + rng() * 0.8]);
  }
  const pinesRaw = [];
  for (let i = 0; i < 420; i++) {
    const x = (rng() - 0.5) * 320, z = (rng() - 0.5) * 320, d = Math.max(Math.abs(x), Math.abs(z));
    if (d < 42 || Math.abs(x - riverX(z)) < 8 || farmMask(x, z) > 0.02 || heightAt(x, z) < 0.4) continue;
    pinesRaw.push([x, z, 1 + rng() * 0.9]);
  }
  for (const lx of LINES) for (let k = 0; k < 4; k++) {
    const t = (-18 + k * 12) + (rng() < 0.5 ? -3.5 : 3.5);
    if (rng() < 0.5) treesRaw.push([lx + (rng() < 0.5 ? -2.9 : 2.9), t, 0.75]);
  }
  for (const t of treesRaw) {
    const rot = rng() * 6;
    out.trees.push({ x: t[0], z: t[1], s: t[2], rot, col: Math.floor(rng() * TREE_COLORS.length) });
  }
  for (const t of pinesRaw) out.pines.push({ x: t[0], z: t[1], s: t[2], rot: rng() * 6 });

  // lamp posts
  let n = 0;
  for (const lx of LINES) for (let t = -26; t <= 26; t += 6) {
    if (n >= 158) break;
    for (const [x, z] of [[lx + 2.2, t + 3], [t + 3, lx + 2.2]]) { out.lamps.push([x, z]); n++; }
  }

  // cars (visual only; the render module animates them)
  for (let i = 0; i < 22; i++) {
    const col = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
    const ax = rng() < 0.5 ? 'x' : 'z', line = LINES[Math.floor(rng() * 5)], dir = rng() < 0.5 ? 1 : -1;
    out.cars.push({ col, ax, line, dir, pos: (rng() - 0.5) * 52, speed: 2.2 + rng() * 1.6 });
  }
  return out;
}
