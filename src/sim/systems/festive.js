// The town's festive style (core/festive.js): how much it dresses up, the colours of its lights per event, and which
// placed buildings keep their lights off. All free: the town decorates itself. A change makes a new state.festive object,
// so render notices by identity.
import { AMOUNTS, PALETTES, freshFestive, sanitizeFestive } from '../../core/festive.js';

export default {
  id: 'festive',
  state: () => ({ festive: freshFestive() }),
  sanitize: (raw) => ({ festive: sanitizeFestive(raw.festive) }),
  init({ sim, state }) {
    sim.festiveLightsOn = (id) => !state.festive.dark.includes(id);
  },
  commands: {
    // { amount?, event?, palette? }
    setFestive({ state, note }, cmd) {
      const f = { ...state.festive, palette: { ...state.festive.palette } };
      let changed = false;
      if (AMOUNTS.some((a) => a.id === cmd.amount) && cmd.amount !== f.amount) { f.amount = cmd.amount; changed = true; }
      if (PALETTES[cmd.event] && PALETTES[cmd.event].some((p) => p.id === cmd.palette) && f.palette[cmd.event] !== cmd.palette) {
        f.palette[cmd.event] = cmd.palette; changed = true;
      }
      if (!changed) return;
      state.festive = f;
      note('festive', cmd.amount || cmd.palette);
    },
    // { id, on }: a placed building's festive lights
    festiveLights({ state, emit }, cmd) {
      if (typeof cmd.id !== 'string' || !state.placed.some((r) => r.id === cmd.id)) return;
      const dark = state.festive.dark.filter((x) => x !== cmd.id);
      if (!cmd.on) dark.push(cmd.id);
      if (dark.length === state.festive.dark.length && dark.every((x, i) => x === state.festive.dark[i])) return;
      state.festive = { ...state.festive, dark };
      emit({ type: 'toast', text: cmd.on ? 'Festive lights on' : 'Festive lights off for this one' });
    },
  },
};
