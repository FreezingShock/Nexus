// Trees as objects on the shared tile grid. Pure data and math: no DOM, no THREE.
//
// A tree is a small record in state.trees: { id, k, x, z, s, rot, col }. `k` is 'b' (broadleaf) or 'p' (conifer).
// The first town is seeded from the layout generator (seedTrees), so every save starts with the same trees the
// generator makes. A tree gives way to anything that takes its tile: zone paint, a road or a placed building.
// Undo puts the taken records back exactly as they were (takeOnTiles returns them, putTrees restores them).
// See docs/TREES.md for the rules.
import { inBounds, tileIndex, worldToTile } from './grid.js';
import { PINE_COLORS, TREE_COLORS } from './palettes.js';

// Broadleaf species, by colour index (TREE_COLORS has five colours).
export const SPECIES = ['Linden', 'Beech', 'Plane', 'Chestnut', 'Walnut'];
// A save never holds more trees of one kind than this. The generator makes a few hundred in all.
export const MAX_PER_KIND = 1000;
const ID = /^t\d+$/;
const round = (v) => Math.round(v * 100) / 100;

export function speciesOf(t) {
  return t.k === 'p' ? 'Pine' : SPECIES[t.col % SPECIES.length];
}

// The town's trees as records, in generator order. The layout keeps them off the starter town already. Roads, paint and
// lots are not checked here: the trees system clears those once the grid is known (see systems/trees.js).
export function seedTrees(layout) {
  const out = [];
  const add = (t, k, col) => {
    out.push({ id: 't' + out.length, k, x: round(t.x), z: round(t.z), s: round(t.s), rot: round(t.rot), col });
  };
  for (const t of layout.trees) add(t, 'b', t.col);
  layout.pines.forEach((t, i) => add(t, 'p', i % PINE_COLORS.length));
  return out;
}

// Untrusted saved list in, well-formed records out. Returns null when there is no list (the trees get seeded).
export function sanitizeTrees(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [], seen = new Set(), per = { b: 0, p: 0 };
  for (const t of raw) {
    if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !ID.test(t.id) || seen.has(t.id)) continue;
    if (t.k !== 'b' && t.k !== 'p') continue;
    if (per[t.k] >= MAX_PER_KIND) continue;
    if (![t.x, t.z, t.s, t.rot].every(Number.isFinite) || Math.abs(t.x) > 400 || Math.abs(t.z) > 400 || t.s <= 0 || t.s > 4) continue;
    const cols = t.k === 'b' ? TREE_COLORS.length : PINE_COLORS.length;
    if (!Number.isInteger(t.col) || t.col < 0 || t.col >= cols) continue;
    seen.add(t.id); per[t.k]++;
    out.push({ id: t.id, k: t.k, x: round(t.x), z: round(t.z), s: round(t.s), rot: round(t.rot), col: t.col });
  }
  return out;
}

// Splits trees into the ones standing on any tile in `idx` (a Set of tile indexes) and the rest.
export function takeOnTiles(trees, idx) {
  const kept = [], taken = [];
  for (const t of trees) {
    const [gx, gz] = worldToTile(t.x, t.z);
    (inBounds(gx, gz) && idx.has(tileIndex(gx, gz)) ? taken : kept).push(t);
  }
  return { kept, taken };
}

// Splits out one tree by id.
export function takeTree(trees, id) {
  const kept = [], taken = [];
  for (const t of trees) (t.id === id ? taken : kept).push(t);
  return { kept, taken };
}

// Puts records back in id order, so a restored town lists its trees the way it did before.
export function putTrees(trees, recs) {
  if (!recs.length) return trees;
  const num = (t) => Number(t.id.slice(1));
  return [...trees, ...recs].sort((a, b) => num(a) - num(b));
}

// Tile indexes of a footprint of fw x fd tiles starting at (gx, gz).
export function footprintIndexes(gx, gz, fw, fd) {
  const out = new Set();
  for (let z = gz; z < gz + fd; z++) for (let x = gx; x < gx + fw; x++) if (inBounds(x, z)) out.add(tileIndex(x, z));
  return out;
}
