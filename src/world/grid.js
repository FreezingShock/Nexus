// The shared tile grid. Roads and zones both live on it. Pure data and math: no DOM, no THREE.
//
// 64 x 64 tiles of 3 world units. Tile centers sit on multiples of 3, so the town's existing road lines
// (x or z = 0, +-12, +-24) run through tile centers. Tile (gx, gz) is centered at ((gx - 32) * 3, (gz - 32) * 3).
// See docs/GRID.md for the ownership rules.
import { heightAt, riverX } from './terrain.js';

export const GRID_N = 64;
export const TILE = 3;
export const GRID_HALF = GRID_N / 2;

// What the ground is. Fixed by the world, never changes during play.
export const BASE = { LAND: 0, WATER: 1, STEEP: 2, FARM: 3, TOWN: 4 };
// Value in `road` for the hand-placed streets that ship with the town. The road system owns every other value.
export const ROAD_STATIC = 255;

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

// Builds the grid for a town layout. `base` and the static roads come from the layout; `road`, `zone` and
// `lot` start empty and are filled by the systems that own them (roads, zoning).
export function createGrid(layout) {
  const base = new Uint8Array(GRID_N * GRID_N);
  const road = new Uint8Array(GRID_N * GRID_N);   // owned by the road system (0 none, ROAD_STATIC, else a road kind)
  const zone = new Uint8Array(GRID_N * GRID_N);   // owned by zoning (0 none, else a zone id)
  const lot = new Uint16Array(GRID_N * GRID_N);   // owned by zoning (0 none, else growth lot number)
  const district = new Uint8Array(GRID_N * GRID_N); // owned by districts (0 none, else a district slot 1 to 15)

  for (let gz = 0; gz < GRID_N; gz++) for (let gx = 0; gx < GRID_N; gx++) {
    const [cx, cz] = tileCenter(gx, gz);
    let lo = Infinity, hi = -Infinity;
    for (const [dx, dz] of [[0, 0], [-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
      const h = heightAt(cx + dx, cz + dz);
      if (h < lo) lo = h; if (h > hi) hi = h;
    }
    let k = BASE.LAND;
    if (lo < -0.15 || Math.abs(cx - riverX(cz)) < 5) k = BASE.WATER;
    else if (hi > 2.2 || hi - lo > 0.9) k = BASE.STEEP;
    base[tileIndex(gx, gz)] = k;
  }
  if (layout) {
    const mark = (cx, cz, hw, hd, fn) => {
      const [g0x, g0z] = worldToTile(cx - hw, cz - hd), [g1x, g1z] = worldToTile(cx + hw, cz + hd);
      for (const [gx, gz] of rectTiles([g0x, g0z], [g1x, g1z])) {
        const [tx, tz] = tileCenter(gx, gz);
        if (Math.abs(tx - cx) <= hw + 0.01 && Math.abs(tz - cz) <= hd + 0.01) fn(tileIndex(gx, gz));
      }
    };
    for (const f of layout.farms || []) mark(f.x, f.z, (f.turned ? f.d : f.w) / 2 + 1, (f.turned ? f.w : f.d) / 2 + 1, (i) => { if (base[i] === BASE.LAND) base[i] = BASE.FARM; });
    for (const p of layout.pads || []) mark(p.x, p.z, 4.5, 4.5, (i) => { base[i] = BASE.TOWN; });
    for (const s of layout.segs || []) {
      const horiz = s.ax === 'x', px = horiz ? s.center : s.fixed, pz = horiz ? s.fixed : s.center;
      mark(px, pz, horiz ? s.len / 2 + 1.6 : 1.5, horiz ? 1.5 : s.len / 2 + 1.6, (i) => { road[i] = ROAD_STATIC; });
    }
    for (const [a, b] of layout.intersections || []) mark(a, b, 1.5, 1.5, (i) => { road[i] = ROAD_STATIC; });
  }

  const grid = {
    N: GRID_N, TILE, base, road, zone, lot, district,
    inBounds, tileIndex, tileCenter, worldToTile, snapToTile, rectTiles,
    baseAt: (gx, gz) => (inBounds(gx, gz) ? base[tileIndex(gx, gz)] : BASE.STEEP),
    roadAt: (gx, gz) => (inBounds(gx, gz) ? road[tileIndex(gx, gz)] : 0),
    zoneAt: (gx, gz) => (inBounds(gx, gz) ? zone[tileIndex(gx, gz)] : 0),
    lotAt: (gx, gz) => (inBounds(gx, gz) ? lot[tileIndex(gx, gz)] : 0),
    districtAt: (gx, gz) => (inBounds(gx, gz) ? district[tileIndex(gx, gz)] : 0),
    // Open ground: land, nothing built on it. Roads and zoning both ask this before taking a tile.
    isOpen: (gx, gz) => inBounds(gx, gz) && base[tileIndex(gx, gz)] === BASE.LAND && road[tileIndex(gx, gz)] === 0 && lot[tileIndex(gx, gz)] === 0,
    // Roads may take open land, and may paint over a zone (the zone clears). They never take a grown lot.
    canRoad: (gx, gz) => inBounds(gx, gz) && base[tileIndex(gx, gz)] === BASE.LAND && lot[tileIndex(gx, gz)] === 0,
    // A road tile sits next to this tile (4-neighborhood).
    roadNeighbors: (gx, gz) => NEIGH.filter(([dx, dz]) => inBounds(gx + dx, gz + dz) && road[tileIndex(gx + dx, gz + dz)] !== 0).length,
    // Nearest road tile within `r` tiles (Chebyshev), or false.
    roadWithin(gx, gz, r) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (inBounds(gx + dx, gz + dz) && road[tileIndex(gx + dx, gz + dz)] !== 0) return true;
      return false;
    },
  };
  return grid;
}
