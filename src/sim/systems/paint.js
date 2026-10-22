// Paint: repaint a placed building's walls, trim or roof with coins, paint the whole town at once, and unlock the newer
// colours once with Parts. A building's choice lives on its own record (`pal`, `trim`, `roof`). The town-wide choice is also
// kept in state.townPaint, which grown (zoned) lots wear, since they have no record. Undo gives the coins back.
// Rules and prices live in src/world/paint.js.
import {
  KIND_IDS, costOf, isKey, isOpen, paintableRecord, partsOf, sanitizeTownPaint, sanitizeUnlocks, tableOf, townPlan, unlockId,
} from '../../world/paint.js';

const FIELD = { wall: 'pal', trim: 'trim', roof: 'roof' };
const NAME = { wall: 'walls', trim: 'trim', roof: 'roof' };
const nameOf = (kind, key) => tableOf(kind)[key].name;
const setField = (rec, kind, key) => { if (key == null) delete rec[FIELD[kind]]; else rec[FIELD[kind]] = key; };

export default {
  id: 'paint',
  state: () => ({ paintUnlocks: [], townPaint: null }),
  sanitize: (raw) => ({ paintUnlocks: sanitizeUnlocks(raw.paintUnlocks), townPaint: sanitizeTownPaint(raw.townPaint) }),

  init({ sim, state }) {
    // Only placed buildings carry a record, and parks have no walls, so only the others can be repainted one by one.
    sim.paintable = (id) => state.placed.some((r) => r.id === id && paintableRecord(r));
    sim.paintOf = (id) => { const r = state.placed.find((x) => x.id === id); return r ? { pal: r.pal, trim: r.trim || null, roof: r.roof || null, rec: r } : null; };
    sim.townPlan = (change) => townPlan(state, change);
  },

  commands: {
    // { id, wall?, trim?, roof? }: keys to wear. Picking what a building already wears is free and does nothing.
    paintBuilding(ctx, cmd) {
      const { state, emit, charge, sim, syncDisplay, note } = ctx;
      const rec = state.placed.find((r) => r.id === cmd.id);
      if (!rec || !paintableRecord(rec)) return;
      const change = {};
      for (const k of KIND_IDS) if (isKey(k, cmd[k]) && cmd[k] !== (k === 'wall' ? rec.pal : rec[k])) change[k] = cmd[k];
      const kinds = Object.keys(change);
      if (!kinds.length) return;
      if (kinds.some((k) => !isOpen(k, change[k], state.paintUnlocks))) { emit({ type: 'toast', text: 'Unlock that colour with Parts first' }); return; }
      const cost = kinds.reduce((n, k) => n + costOf(k, rec), 0);
      if (!charge(cost)) return;
      const prev = { pal: rec.pal, trim: rec.trim, roof: rec.roof };
      for (const k of kinds) setField(rec, k, change[k]);
      sim.pushUndo({ revert: ({ state: s, syncDisplay: sync }) => {
        const r = s.placed.find((x) => x.id === rec.id);
        if (r) { r.pal = prev.pal; for (const f of ['trim', 'roof']) { if (prev[f]) r[f] = prev[f]; else delete r[f]; } }
        s.coins += cost; sync();
      } });
      syncDisplay();
      note('paint', rec.id);
      emit({ type: 'painted', id: rec.id, text: 'Painted ' + kinds.map((k) => nameOf(k, change[k]) + ' ' + NAME[k]).join(' and ') });
    },

    // { wall?, trim?, roof? }: every paintable building, and every grown lot, wears these. Priced per building.
    paintTown(ctx, cmd) {
      const { state, emit, charge, sim, syncDisplay, note } = ctx;
      const change = {};
      for (const k of KIND_IDS) if (isKey(k, cmd[k])) change[k] = cmd[k];
      if (Object.keys(change).some((k) => !isOpen(k, change[k], state.paintUnlocks))) { emit({ type: 'toast', text: 'Unlock that colour with Parts first' }); return; }
      const plan = townPlan(state, change);
      if (!plan.kinds.length) return;
      if (!plan.n) { emit({ type: 'toast', text: 'The whole town already wears that' }); return; }
      if (!charge(plan.cost)) return;
      const prevRecs = state.placed.filter(paintableRecord).map((r) => ({ id: r.id, pal: r.pal, trim: r.trim, roof: r.roof }));
      const prevTown = state.townPaint ? { ...state.townPaint } : null;
      for (const r of state.placed) if (paintableRecord(r)) for (const k of plan.kinds) setField(r, k, change[k]);
      state.townPaint = { ...(state.townPaint || {}), ...Object.fromEntries(plan.kinds.map((k) => [k, change[k]])) };
      state.zoneRev++; // the grown lots redraw
      sim.pushUndo({ revert: ({ state: s, syncDisplay: sync }) => {
        for (const p of prevRecs) {
          const r = s.placed.find((x) => x.id === p.id);
          if (!r) continue;
          r.pal = p.pal; for (const f of ['trim', 'roof']) { if (p[f]) r[f] = p[f]; else delete r[f]; }
        }
        s.townPaint = prevTown; s.zoneRev++; s.coins += plan.cost; sync();
      } });
      syncDisplay();
      note('paint', 'town');
      emit({ type: 'painted', id: null, text: 'Painted the town: ' + plan.kinds.map((k) => nameOf(k, change[k]) + ' ' + NAME[k]).join(', ') + ' · ' + plan.n + ' buildings' });
    },

    // Free: grown lots go back to their district's look. Buildings that were placed keep what they wear.
    clearTownPaint({ state, emit }) {
      if (!state.townPaint) return;
      state.townPaint = null; state.zoneRev++;
      emit({ type: 'toast', text: 'Grown lots are back to their district colours' });
    },

    // { kind: 'wall' | 'trim' | 'roof', key }. Spends the Parts once.
    unlockPaint({ state, emit, syncDisplay }, { kind, key }) {
      if (!KIND_IDS.includes(kind) || !isKey(kind, key)) return;
      const parts = partsOf(kind)[key], id = unlockId(kind, key);
      if (!parts || state.paintUnlocks.includes(id)) return;
      if (state.parts < parts) { emit({ type: 'toast', text: 'Needs ' + parts + ' Parts' }); return; }
      state.parts -= parts; syncDisplay();
      state.paintUnlocks = [...state.paintUnlocks, id];
      emit({ type: 'toast', text: nameOf(kind, key) + ' unlocked' });
    },
  },
};
