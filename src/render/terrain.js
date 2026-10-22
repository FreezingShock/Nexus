// Ground: jittered fractal-noise hills, sage palette by patch, river water plane.
import * as THREE from '../../vendor/three/three.module.min.js';
import { fbm, hash, heightAt } from '../world/terrain.js';
import { toonUncached } from './materials.js';
import { patchSeason } from './season.js';

const S = 380, N = 150;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const OUT_HALF = 480, OUT_STEP = S / 2 / 19; // the far ground: coarse, round the fine map, out past where the fog hides it
const SKIRT = 8;                              // a wall under every seam, so a crack between the fine and coarse ground shows no sky

// Triangles (flat array of x, y, z) as a coloured toon mesh.
function paintedMesh(pos) {
  const g2 = new THREE.BufferGeometry();
  g2.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g2.computeVertexNormals();
  const q = g2.attributes.position, col = new Float32Array(q.count * 3);
  const sage = new THREE.Color(0x9DB874), olive = new THREE.Color(0x748A55), bed = new THREE.Color(0x6F7F5C), lawn = new THREE.Color(0xA9C47F);
  const meadow = new THREE.Color(0xB7CB82), deep = new THREE.Color(0x83A367), flower = new THREE.Color(0xD9C07A), c = new THREE.Color();
  const stone = new THREE.Color(0xA89C86), snow = new THREE.Color(0xEFE8D8);
  for (let i = 0; i < q.count; i += 3) {
    const cy = (q.getY(i) + q.getY(i + 1) + q.getY(i + 2)) / 3, cx = (q.getX(i) + q.getX(i + 1) + q.getX(i + 2)) / 3, cz = (q.getZ(i) + q.getZ(i + 1) + q.getZ(i + 2)) / 3;
    const m = fbm(cx * 0.05 + 11, cz * 0.05 + 4), hv = hash(i, 5);
    const ax = q.getX(i + 1) - q.getX(i), ay = q.getY(i + 1) - q.getY(i), az = q.getZ(i + 1) - q.getZ(i);
    const bx = q.getX(i + 2) - q.getX(i), by = q.getY(i + 2) - q.getY(i), bz = q.getZ(i + 2) - q.getZ(i);
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; // face normal
    const up = Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1);                      // 1 flat, 0 a wall
    c.copy(sage).lerp(m > 0.5 ? meadow : deep, Math.min(1, Math.abs(m - 0.5) * 2.4));
    c.lerp(olive, smooth(0.8, 5, cy));
    // Cliffs and the high mountains show warm stone; the very top is pale, like an old painting of snow.
    c.lerp(stone, smooth(0.82, 0.6, up) * 0.85 + smooth(14, 26, cy) * 0.5);
    c.lerp(snow, smooth(30, 40, cy) * 0.8);
    if (cy < -0.2) c.copy(bed);
    c.multiplyScalar(0.94 + hv * 0.12);
    if (hv > 0.985 && cy > -0.2) c.lerp(flower, 0.5);
    if (Math.max(Math.abs(cx), Math.abs(cz)) < 32) c.lerp(lawn, 0.5);
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
  }
  g2.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const land = new THREE.Mesh(g2, patchSeason(toonUncached(0xffffff, { vertexColors: true }), { leaf: true }));
  land.receiveShadow = true;
  return land;
}

// A wall hanging from a line of ground points, pushed onto `out`.
function skirt(out, pts) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], ha = heightAt(ax, az), hb = heightAt(bx, bz);
    out.push(ax, ha, az, bx, hb, bz, ax, ha - SKIRT, az, bx, hb, bz, bx, hb - SKIRT, bz, ax, ha - SKIRT, az); // both faces: no culling to lose it
    out.push(ax, ha, az, ax, ha - SKIRT, az, bx, hb, bz, bx, hb, bz, ax, ha - SKIRT, az, bx, hb - SKIRT, bz);
  }
}
const edgePoints = (half, n) => {
  const side = (f) => Array.from({ length: n + 1 }, (_, i) => f(-half + (i * 2 * half) / n));
  return [side((t) => [t, -half]), side((t) => [half, t]), side((t) => [t, half]), side((t) => [-half, t])];
};

export function buildTerrain(parent) {
  const geo = new THREE.PlaneGeometry(S, S, N, N);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), z = p.getZ(i);
    if (Math.abs(x) < S / 2 - 3 && Math.abs(z) < S / 2 - 3) { x += (hash(i, 7) - 0.5) * 1.9; z += (hash(i, 13) - 0.5) * 1.9; }
    p.setX(i, x); p.setZ(i, z); p.setY(i, heightAt(x, z));
  }
  const g2 = geo.toNonIndexed();
  geo.dispose();
  const inner = Array.from(g2.attributes.position.array);
  g2.dispose();
  for (const line of edgePoints(S / 2, N)) skirt(inner, line);
  parent.add(paintedMesh(new Float32Array(inner)));

  // The far ground: every cell of a coarse grid that is not inside the fine map. It is the same land, so the mountains
  // simply go on past the edge of the map in every direction.
  const outer = [], n = Math.round(OUT_HALF / OUT_STEP), cells = 2 * n;
  const at = (i) => -OUT_HALF + i * OUT_STEP, hh = (x, z) => heightAt(x, z);
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const x0 = at(i), x1 = at(i + 1), z0 = at(j), z1 = at(j + 1);
    if (x0 >= -S / 2 - 1e-6 && x1 <= S / 2 + 1e-6 && z0 >= -S / 2 - 1e-6 && z1 <= S / 2 + 1e-6) continue;
    outer.push(x0, hh(x0, z0), z0, x0, hh(x0, z1), z1, x1, hh(x1, z0), z0, x1, hh(x1, z0), z0, x0, hh(x0, z1), z1, x1, hh(x1, z1), z1);
  }
  const pts = (half, m) => edgePoints(half, m);
  for (const line of pts(S / 2, 38)) skirt(outer, line);
  parent.add(paintedMesh(new Float32Array(outer)));

  const water = new THREE.Mesh(new THREE.PlaneGeometry(S, S), patchSeason(toonUncached(0x7FA3B8), { still: true }));
  water.rotation.x = -Math.PI / 2; water.position.y = -0.55;
  parent.add(water);
}
