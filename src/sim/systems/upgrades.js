// Upgrading and bulldozing existing buildings.
import { MAX_LEVEL, levelOf, upgradeCost } from '../economy.js';

export default {
  id: 'upgrades',
  commands: {
    upgrade({ sim, state, layout, emit, note, refresh, charge }, { id }) {
      if (!sim.alive(id)) return;
      const b = sim.building(id), lv = levelOf(state, b), c = upgradeCost(b.floors, lv);
      if (!b.floors) return emit({ type: 'toast', text: b.name + ' is finished as it is' }); // parks have no storeys to add
      if (lv >= MAX_LEVEL) return emit({ type: 'toast', text: b.name + ' is at the top level' });
      if (!charge(c)) return;
      state.levels[id] = lv + 1;
      refresh(); note('up', b.name);
      emit({ type: 'upgraded', id, text: b.name + ' upgraded to level ' + (lv + 1) });
    },
    bulldoze({ sim, state, emit, note, refresh }, { id }) {
      if (!sim.alive(id)) return;
      state.removed.push(id); refresh(); note('doze', sim.building(id).name);
      emit({ type: 'bulldozed', id, text: sim.building(id).name + ' removed' });
    },
  },
};
