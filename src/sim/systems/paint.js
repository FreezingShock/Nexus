// Paint: repaint a placed building's walls or roof with coins, and unlock the newer colours once with Parts.
// The choice lives on the building's own record (`pal`, `roof`), so the save needs no new list for it; only the unlocks are new state.
// Undo: a repaint pushes onto sim.undoStack and gives the coins back. Rules and prices live in src/world/paint.js.
import {
  ROOF_PARTS, WALL_PARTS, isRoof, isWall, roofCost, roofOpen, roofUnlockId, sanitizeUnlocks, wallCost, wallOpen, wallUnlockId,
} from '../../world/paint.js';
import { PAL, ROOFS } from '../../world/palettes.js';

export default {
  id: 'paint',
  state: () => ({ paintUnlocks: [] }),
  sanitize: (raw) => ({ paintUnlocks: sanitizeUnlocks(raw.paintUnlocks) }),

  init({ sim, state }) {
    // Only placed buildings carry a record, so only they can be repainted (grown lots take their district's palette).
    sim.paintable = (id) => state.placed.some((r) => r.id === id);
    sim.paintOf = (id) => { const r = state.placed.find((x) => x.id === id); return r ? { pal: r.pal, roof: r.roof || null, rec: r } : null; };
  },

  commands: {
    // { id, wall?: key, roof?: key }. One or both. Free to pick the colour a building already wears.
    paintBuilding(ctx, cmd) {
      const { state, emit, charge, sim, syncDisplay, note } = ctx;
      const rec = state.placed.find((r) => r.id === cmd.id);
      if (!rec) return;
      const wall = isWall(cmd.wall) && cmd.wall !== rec.pal ? cmd.wall : null;
      const roof = isRoof(cmd.roof) && cmd.roof !== rec.roof ? cmd.roof : null;
      if (!wall && !roof) return;
      if ((wall && !wallOpen(wall, state.paintUnlocks)) || (roof && !roofOpen(roof, state.paintUnlocks))) { emit({ type: 'toast', text: 'Unlock that colour with Parts first' }); return; }
      const cost = (wall ? wallCost(rec) : 0) + (roof ? roofCost(rec) : 0);
      if (!charge(cost)) return;
      const prev = { pal: rec.pal, roof: rec.roof };
      if (wall) rec.pal = wall;
      if (roof) rec.roof = roof;
      sim.pushUndo({ revert: ({ state: s, syncDisplay: sync }) => {
        const r = s.placed.find((x) => x.id === rec.id);
        if (r) { r.pal = prev.pal; if (prev.roof) r.roof = prev.roof; else delete r.roof; }
        s.coins += cost; sync();
      } });
      syncDisplay();
      note('paint', rec.id);
      emit({ type: 'painted', id: rec.id, text: 'Painted ' + [wall && PAL[wall].name + ' walls', roof && ROOFS[roof].name + ' roof'].filter(Boolean).join(' and ') });
    },

    // { kind: 'wall' | 'roof', key }. Spends the Parts once.
    unlockPaint({ state, emit, syncDisplay }, { kind, key }) {
      const wall = kind === 'wall';
      if (!(wall ? isWall(key) : kind === 'roof' && isRoof(key))) return;
      const parts = (wall ? WALL_PARTS : ROOF_PARTS)[key], id = wall ? wallUnlockId(key) : roofUnlockId(key);
      if (!parts || state.paintUnlocks.includes(id)) return;
      if (state.parts < parts) { emit({ type: 'toast', text: 'Needs ' + parts + ' Parts' }); return; }
      state.parts -= parts; syncDisplay();
      state.paintUnlocks = [...state.paintUnlocks, id];
      emit({ type: 'toast', text: (wall ? PAL[key].name : ROOFS[key].name) + ' unlocked' });
    },
  },
};
