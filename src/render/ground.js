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

export function groundPlaneGeometry(lift) {
  const h = cornerHeights(), pos = new Float32Array(V * V * 3), idx = [];
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const k = (j * V + i) * 3;
    pos[k] = EDGE + i * TILE; pos[k + 1] = h[j * V + i] + lift; pos[k + 2] = EDGE + j * TILE;
  }
  for (let j = 0; j < GRID_N; j++) for (let i = 0; i < GRID_N; i++) {
    const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
