// Upgrading existing buildings. Bulldozing lives in the placement system, next to undo.
import { MAX_LEVEL, levelOf, upgradeCost } from '../economy.js';

export default {
  id: 'upgrades',
  commands: {
    upgrade({ sim, state, layout, emit, note, refresh, charge }, { id }) {
      const b = sim.building(id);
      if (!b || !sim.alive(id)) return;
      const lv = levelOf(state, b), c = upgradeCost(b.floors, lv);
      if (!b.floors) return emit({ type: 'toast', text: b.name + ' is finished as it is' }); // parks have no storeys to add
      if (lv >= MAX_LEVEL) return emit({ type: 'toast', text: b.name + ' is at the top level' });
      if (!charge(c)) return;
      state.levels[id] = lv + 1;
      refresh(); note('up', b.name);
      emit({ type: 'upgraded', id, text: b.name + ' upgraded to level ' + (lv + 1) });
    },
  },
};
