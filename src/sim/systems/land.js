// Terrain tools: Raise, Lower and Flatten, a dab at a time along a drag. The ground under roads, zones and buildings moves
// too, and everything built on it follows (each renderer reads heightAt again when terrainRev moves). Coins pay for the
// earth each dab moves. One drag is one undo step, with its coins back. Rules and the brush live in src/world/land.js.
//
// The edits are a Float32Array over the tile corners held by world/terrain.js (createSim and Renewal hand it over from
// state.land); state.land is written back from it before every save.
import { BALANCE } from '../balance.js';
import { landEdits, landEdited, heightAt, terrainSeed } from '../../world/terrain.js';
import { TOOLS, BRUSH, LAND_LOW, STEP, brush, editable, pairsFromEdits, sanitizeLand, tilesOfCorners } from '../../world/land.js';
import { GRID_N } from '../../world/grid.js';

const DRY = 0.05; // ground under anything built stays above the water line (grid.js reads below -0.15 as water)
// Is a road, zone or lot on any of the four tiles that share corner (i, j)?
function builtAround(grid, i, j) {
  for (const [gx, gz] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) {
    if (gx < 0 || gz < 0 || gx >= GRID_N || gz >= GRID_N) continue;
    const t = gz * GRID_N + gx;
    if (grid.road[t] || grid.zone[t] || grid.lot[t]) return true;
  }
  return false;
}

export const landPrice = (earth) => Math.ceil(earth * BALANCE.land.perEarth);

// Moves corners by `moves` (corner -> change in offset), reads their tiles again, and returns what they were before
// (corner -> old offset) for restore. Used by the roads system when a road cuts and fills the hill it climbs.
export function applyMoves(ctx, moves) {
  const edits = landEdits(), snap = new Map();
  if (!edits || !moves.size) return snap;
  for (const [k, dh] of moves) { snap.set(k, edits[k]); edits[k] = Math.round((edits[k] + dh) / STEP) * STEP; }
  landEdited();
  const tiles = tilesOfCorners([...moves.keys()]);
  ctx.grid.regen(tiles);
  ctx.emit({ type: 'landChanged', tiles });
  return snap;
}

// Puts corners back to the offsets in `snap` (corner -> old offset) and reads their tiles again.
export function restore(ctx, snap) {
  const edits = landEdits();
  if (!edits) return;
  for (const [k, v] of snap) edits[k] = v;
  landEdited();
  const tiles = tilesOfCorners([...snap.keys()]);
  ctx.grid.regen(tiles);
  ctx.emit({ type: 'landChanged', tiles });
}

export default {
  id: 'land',
  order: -1, // first: everything else reads the ground
  state: () => ({ land: [] }),
  sanitize(raw) { return { land: sanitizeLand(raw.land) }; },

  init(ctx) {
    const { sim } = ctx;
    sim.landStroke = null; // { id, snap, paid, entry } of the drag in progress
    sim.landPrice = landPrice;
    sim.canShape = (i, j) => editable(i, j, String(terrainSeed()));
  },
  beforeSave({ state }) { const e = landEdits(); state.land = e ? pairsFromEdits(e) : []; },

  commands: {
    // One dab: { tool, x, z, size ('small' | 'medium' | 'large'), level (Flatten's height), stroke (id of the drag) }.
    terraform(ctx, cmd) {
      const { sim, state, grid, emit, syncDisplay } = ctx;
      const edits = landEdits();
      if (!edits || !cmd || !TOOLS.includes(cmd.tool)) return;
      const r = BRUSH[cmd.size] || BRUSH.medium;
      const before = edits.slice();
      const key = String(terrainSeed());
      const res = brush(edits, { tool: cmd.tool, x: cmd.x, z: cmd.z, r, level: Number.isFinite(cmd.level) ? cmd.level : 0 },
        heightAt, (i, j) => !editable(i, j, key), (i, j) => (builtAround(grid, i, j) ? DRY : LAND_LOW));
      if (!res.moved.length) {
        if (cmd.first) emit({ type: 'toast', text: 'The tools cannot shape the mountains, the river or its banks' });
        return;
      }
      const cost = landPrice(res.earth);
      if (state.coins < cost) {
        for (const k of res.moved) edits[k] = before[k];
        emit({ type: 'toast', text: 'Not enough coins yet' });
        return;
      }
      state.coins -= cost; syncDisplay();
      // One drag, one undo step: the first dab of a stroke opens it, later dabs add the corners they move.
      let st = sim.landStroke;
      if (!st || st.id !== cmd.stroke || cmd.stroke == null) {
        st = sim.landStroke = { id: cmd.stroke, snap: new Map(), paid: 0 };
        const s = st;
        sim.pushUndo({ kind: 'land', revert: (c) => { restore(c, s.snap); c.state.coins += s.paid; c.syncDisplay(); if (c.sim.landStroke === s) c.sim.landStroke = null; } });
      }
      for (const k of res.moved) if (!st.snap.has(k)) st.snap.set(k, before[k]);
      st.paid += cost;
      landEdited();
      const tiles = tilesOfCorners(res.moved);
      grid.regen(tiles);
      emit({ type: 'landChanged', tiles, cost });
    },
  },
};
