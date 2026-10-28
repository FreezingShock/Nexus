// The shared tile grid. Roads and zones both live on it. Pure data and math: no DOM, no THREE.
//
// 96 x 96 tiles of 3 world units. Tile centers sit on multiples of 3, so the town's existing road lines
// (x or z = 0, +-12, +-24) run through tile centers. Tile (gx, gz) is centered at ((gx - 48) * 3, (gz - 48) * 3).
// The grid grew from 64 to 96 tiles a side (version 5 of the save, see save.js), with 16 more tiles on every side,
// so the middle of the map is still the origin. See docs/GRID.md for the ownership rules.
import { heightAt, riverX, terrainSeed } from './terrain.js';

export const GRID_N = 96;
export const TILE = 3;
export const GRID_HALF = GRID_N / 2;

// What the ground is. Fixed by the world, never changes during play. The starter town is plain LAND like the rest.
export const MOUNTAIN_TOP = 26; // ground higher than this is never built on, however level its top
// A tile is a cliff (BASE.STEEP) when its ground rises more than this across it. Anything gentler is a hillside: homes,
// shops and buildings stand on it on a stone terrace (render/systems/terraces.js), roads climb it (roadnet.js).
export const CLIFF = 4.5;
export const RIM = 5;         // seeded land: the outer rows climb into the mountain rim and are never built on
export const HILLSIDE = 0.9; // above this spread a tile reads as a hillside: buildings get a terrace
export const BASE = { LAND: 0, WATER: 1, STEEP: 2, FARM: 3 };

export const inBounds = (gx, gz) => Number.isInteger(gx) && Number.isInteger(gz) && gx >= 0 && gz >= 0 && gx < GRID_N && gz < GRID_N;
export const tileIndex = (gx, gz) => gz * GRID_N + gx;
export const tileOf = (i) => [i % GRID_N, Math.floor(i / GRID_N)];
export const tileCenter = (gx, gz) => [(gx - GRID_HALF) * TILE, (gz - GRID_HALF) * TILE];
// Tile containing a world point. May be outside the grid: check with inBounds.
export const worldToTile = (x, z) => [Math.floor(x / TILE + 0.5) + GRID_HALF, Math.floor(z / TILE + 0.5) + GRID_HALF];
// Center of the tile under a world point.
export const snapToTile = (x, z) => { const [gx, gz] = worldToTile(x, z); return tileCenter(gx, gz); };

// Tiles of the inclusive rectangle between two corner tiles, clipped to the grid. Row by row.
export function rectTiles(a, b) {
  const x0 = Math.max(0, Math.min(a[0], b[0])), x1 = Math.min(GRID_N - 1, Math.max(a[0], b[0]));
  const z0 = Math.max(0, Math.min(a[1], b[1])), z1 = Math.min(GRID_N - 1, Math.max(a[1], b[1]));
  const out = [];
  for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) out.push([gx, gz]);
  return out;
}

const NEIGH = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Builds the grid for a town layout. `base` comes from the terrain; `road`, `zone`,
// `lot` and `district` start empty and are filled by the systems that own them (roads, zoning, placement, districts).
export function createGrid(layout) {
  const base = new Uint8Array(GRID_N * GRID_N);
  const road = new Uint8Array(GRID_N * GRID_N);   // owned by the road system (0 none, else a road kind)
  const zone = new Uint8Array(GRID_N * GRID_N);   // owned by zoning (0 none, else a zone id)
  const lot = new Uint16Array(GRID_N * GRID_N);   // owned by zoning (0 none, else growth lot number)
  const district = new Uint8Array(GRID_N * GRID_N); // owned by districts (0 none, else a district slot 1 to 15)
  const tlo = new Float32Array(GRID_N * GRID_N), thi = new Float32Array(GRID_N * GRID_N); // lowest and highest ground of each tile

  // What the ground is, from the terrain: water, or too steep. Read again by regen() when the land changes (Renewal, the
  // terrain tools). Buildable ground is decided by slope: only a cliff (more than CLIFF across a tile's corners and middle)
  // or a mountain top is barred, and on seeded land the outer RIM rows. Hillsides are buildable; buildings on them stand on
  // a terrace.
  const regenTile = (gx, gz, rim) => {
    const [cx, cz] = tileCenter(gx, gz);
    let lo = Infinity, hi = -Infinity;
    for (const [dx, dz] of [[0, 0], [-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
      const h = heightAt(cx + dx, cz + dz);
      if (h < lo) lo = h; if (h > hi) hi = h;
    }
    let k = BASE.LAND;
    tlo[tileIndex(gx, gz)] = lo; thi[tileIndex(gx, gz)] = hi;
    if (lo < -0.15 || Math.abs(cx - riverX(cz)) < 5) k = BASE.WATER;
    else if (hi - lo > CLIFF || hi > MOUNTAIN_TOP || (rim && (gx < RIM || gz < RIM || gx >= GRID_N - RIM || gz >= GRID_N - RIM))) k = BASE.STEEP;
    base[tileIndex(gx, gz)] = k;
  };
  // `tiles` ([[gx, gz], ...]) reads only those again: the terrain tools change a patch at a time.
  const regen = (tiles = null) => {
    const rim = terrainSeed() !== 0;
    if (tiles) { for (const [gx, gz] of tiles) if (inBounds(gx, gz)) regenTile(gx, gz, rim); return; }
    for (let gz = 0; gz < GRID_N; gz++) for (let gx = 0; gx < GRID_N; gx++) regenTile(gx, gz, rim);
  };
  regen();
  const grid = {
    N: GRID_N, TILE, regen, base, road, zone, lot, district, tlo, thi,
    inBounds, tileIndex, tileCenter, worldToTile, snapToTile, rectTiles,
    baseAt: (gx, gz) => (inBounds(gx, gz) ? base[tileIndex(gx, gz)] : BASE.STEEP),
    roadAt: (gx, gz) => (inBounds(gx, gz) ? road[tileIndex(gx, gz)] : 0),
    zoneAt: (gx, gz) => (inBounds(gx, gz) ? zone[tileIndex(gx, gz)] : 0),
    lotAt: (gx, gz) => (inBounds(gx, gz) ? lot[tileIndex(gx, gz)] : 0),
    districtAt: (gx, gz) => (inBounds(gx, gz) ? district[tileIndex(gx, gz)] : 0),
    // Open ground: land, nothing built on it. Roads and zoning both ask this before taking a tile.
    isOpen: (gx, gz) => inBounds(gx, gz) && base[tileIndex(gx, gz)] === BASE.LAND && road[tileIndex(gx, gz)] === 0 && lot[tileIndex(gx, gz)] === 0,
    // Roads may take open land, paint over a zone (it clears) and a grown house (it goes). They never take a placed building.
    canRoad: (gx, gz) => inBounds(gx, gz) && base[tileIndex(gx, gz)] === BASE.LAND && lot[tileIndex(gx, gz)] < 40000,
    // A road tile sits next to this tile (4-neighborhood).
    roadNeighbors: (gx, gz) => NEIGH.filter(([dx, dz]) => inBounds(gx + dx, gz + dz) && road[tileIndex(gx + dx, gz + dz)] !== 0).length,
    // A road tile is directly beside this tile (4-neighborhood): the one rule for where zoned buildings may grow.
    roadBeside: (gx, gz) => NEIGH.some(([dx, dz]) => inBounds(gx + dx, gz + dz) && road[tileIndex(gx + dx, gz + dz)] !== 0),
    // Nearest road tile within `r` tiles (Chebyshev), or false.
    roadWithin(gx, gz, r) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (inBounds(gx + dx, gz + dz) && road[tileIndex(gx + dx, gz + dz)] !== 0) return true;
      return false;
    },
  };
  return grid;
}
