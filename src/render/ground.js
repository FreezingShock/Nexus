// A plane that hugs the terrain at grid resolution, shared by the tile overlays.
import * as THREE from '../../vendor/three/three.module.min.js';
import { GRID_N, TILE, GRID_HALF } from '../world/grid.js';
import { heightAt, terrainRev } from '../world/terrain.js';

const V = GRID_N + 1;
const EDGE = -GRID_HALF * TILE - TILE / 2; // world coordinate of the grid's low corner
let corners = null, cornersRev = -1;

// Terrain height at each tile corner, (GRID_N + 1) squared, row = z index.
export function cornerHeights() {
  if (!corners || cornersRev !== terrainRev()) {
    cornersRev = terrainRev();
    corners = new Float32Array(V * V);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) corners[j * V + i] = Math.max(0, heightAt(EDGE + i * TILE, EDGE + j * TILE));
  }
  return corners;
}

// Each tile is four triangles round its centre, like the ground mesh (world/terrain.js heightAt), so an overlay lies on the
// ground exactly. Vertices: the (GRID_N + 1) squared corners first (row = z), then one centre per tile.
const centreOf = (h, i, j) => (h[j * V + i] + h[j * V + i + 1] + h[(j + 1) * V + i] + h[(j + 1) * V + i + 1]) / 4;
export function groundPlaneGeometry(lift) {
  const h = cornerHeights(), C = V * V, pos = new Float32Array((C + GRID_N * GRID_N) * 3), idx = [];
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const k = (j * V + i) * 3;
    pos[k] = EDGE + i * TILE; pos[k + 1] = h[j * V + i] + lift; pos[k + 2] = EDGE + j * TILE;
  }
  for (let j = 0; j < GRID_N; j++) for (let i = 0; i < GRID_N; i++) {
    const m = C + j * GRID_N + i, k = m * 3;
    pos[k] = EDGE + (i + 0.5) * TILE; pos[k + 1] = centreOf(h, i, j) + lift; pos[k + 2] = EDGE + (j + 0.5) * TILE;
    const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
    idx.push(a, m, b, b, m, d, d, m, c, c, m, a);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// Lifts a plane made by groundPlaneGeometry onto the ground as it is now (after the terrain tools moved it).
export function refreshGroundPlane(geo, lift) {
  const h = cornerHeights(), p = geo.attributes.position;
  for (let k = 0; k < V * V; k++) p.array[k * 3 + 1] = h[k] + lift;
  for (let j = 0; j < GRID_N; j++) for (let i = 0; i < GRID_N; i++) p.array[(V * V + j * GRID_N + i) * 3 + 1] = centreOf(h, i, j) + lift;
  p.needsUpdate = true;
  geo.computeBoundingSphere();
}
