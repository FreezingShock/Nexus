// The town's festive style (core/festive.js): how much it dresses up, the colours of its lights per event, and which
// placed buildings keep their lights off. All free: the town decorates itself. A change makes a new state.festive object,
// so render notices by identity.
import { AMOUNTS, PALETTES, freshFestive, sanitizeFestive } from '../../core/festive.js';
import { keepsakesOn, sanitizeKeepsakes } from '../../core/keepsakes.js';

const CHECK_EVERY = 60; // ticks between looks at the real date (a keepsake can arrive while playing past midnight)

// Playing on a real holiday: the keepsakes in season become the town's, with a postcard. `quiet` skips the postcard.
function gather({ state, sim, emit }, quiet) {
  const fresh = keepsakesOn(sim.now()).filter((k) => !state.keepsakes.includes(k.id));
  if (!fresh.length) return;
  state.keepsakes = [...state.keepsakes, ...fresh.map((k) => k.id)];
  if (!quiet) for (const k of fresh) {
    emit({ type: 'keepsake', id: k.id, title: 'A keepsake', text: 'Thanks for visiting in ' + k.when + '. The ' + k.name + ' is yours to place from the Festive decorations, any time of year.' });
  }
}

export default {
  id: 'festive',
  state: () => ({ festive: freshFestive(), keepsakes: [] }),
  sanitize: (raw) => ({ festive: sanitizeFestive(raw.festive), keepsakes: sanitizeKeepsakes(raw.keepsakes) }),
  init(ctx) {
    const { sim, state } = ctx;
    sim.festiveLightsOn = (id) => !state.festive.dark.includes(id);
    ctx.keepsakeClock = CHECK_EVERY - 3; // a first look a moment after load, once the postcards are listening
  },
  tick(ctx) {
    if (++ctx.keepsakeClock < CHECK_EVERY) return;
    ctx.keepsakeClock = 0;
    gather(ctx, false);
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
