// The ring road (first road project). Road editing grows here.
import { ROAD_TYPES, RING_ROAD_TILES } from '../catalog.js';

export default {
  id: 'roads',
  commands: {
    buildRoad({ state, emit, note, charge }, { roadType }) {
      const t = ROAD_TYPES.find((r) => r.id === roadType);
      if (!t || t.locked || state.ringRoad) return;
      if (!charge(RING_ROAD_TILES * t.cost)) return;
      state.ringRoad = true; note('road');
      emit({ type: 'roadBuilt', text: 'Ring road built' });
    },
  },
};
