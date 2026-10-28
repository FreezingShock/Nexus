// The town's festive style (core/festive.js): how much it dresses up, the colours of its lights per event, and which
// placed buildings keep their lights off. All free: the town decorates itself. A change makes a new state.festive object,
// so render notices by identity.
import { AMOUNT_IDS, PALETTES, freshFestive, sanitizeFestive } from '../../core/festive.js';
import { OPT_IN_EVENTS, eventById } from '../../core/events.js';
import { refreshCalendar } from './calendar.js';
import { KEEPSAKES, keepsakesOn, sanitizeKeepsakes } from '../../core/keepsakes.js';

const keepsakeEvent = (id) => (KEEPSAKES.find((k) => k.id === id) || {}).event;
const CHECK_EVERY = 60; // ticks between looks at the real date (a keepsake can arrive while playing past midnight)

// Playing on a real holiday: the keepsakes in season become the town's, with a postcard. `quiet` skips the postcard.
function gather({ state, sim, emit }, quiet) {
  const fresh = keepsakesOn(sim.now()).filter((k) => !state.keepsakes.includes(k.id));
  if (!fresh.length) return;
  state.keepsakes = [...state.keepsakes, ...fresh.map((k) => k.id)];
  unlockSets(state, fresh.map((k) => k.event));
  if (!quiet) for (const k of fresh) {
    emit({ type: 'keepsake', id: k.id, title: 'A keepsake', text: 'Thanks for visiting in ' + k.when + '. The ' + k.name + ' is yours to place from the Festive decorations, any time of year.' });
  }
}

// Adds seasonal sets to the town's unlocked list (a new state.festive, so render and the calendar notice).
function unlockSets(state, ids) {
  const add = ids.filter((id) => eventById(id) && !state.festive.unlocked.includes(id));
  if (add.length) state.festive = { ...state.festive, unlocked: [...state.festive.unlocked, ...add] };
}

export default {
  id: 'festive',
  state: () => ({ festive: freshFestive(), keepsakes: [] }),
  sanitize: (raw) => ({ festive: sanitizeFestive(raw.festive), keepsakes: sanitizeKeepsakes(raw.keepsakes) }),
  init(ctx) {
    const { sim, state } = ctx;
    sim.festiveLightsOn = (id) => !state.festive.dark.includes(id);
    unlockSets(state, state.keepsakes.map((id) => (keepsakeEvent(id))));
    ctx.knownSets = state.festive.unlocked.length;
    ctx.keepsakeClock = CHECK_EVERY - 3; // a first look a moment after load, once the postcards are listening
  },
  tick(ctx) {
    // a set earned while playing (its big day arrived): say so once
    const sets = ctx.state.festive.unlocked;
    if (sets.length > ctx.knownSets) {
      for (const id of sets.slice(ctx.knownSets)) ctx.emit({ type: 'toast', text: eventById(id).name + ' decorations unlocked: switch them on any time in the calendar' });
      ctx.knownSets = sets.length;
    }
    if (++ctx.keepsakeClock < CHECK_EVERY) return;
    ctx.keepsakeClock = 0;
    gather(ctx, false);
  },
  commands: {
    // { amount?, event?, palette? }
    setFestive({ state, note }, cmd) {
      const f = { ...state.festive, palette: { ...state.festive.palette } };
      let changed = false;
      if (AMOUNT_IDS.includes(cmd.amount) && cmd.amount !== f.amount) { f.amount = cmd.amount; changed = true; }
      if (PALETTES[cmd.event] && PALETTES[cmd.event].some((p) => p.id === cmd.palette) && f.palette[cmd.event] !== cmd.palette) {
        f.palette[cmd.event] = cmd.palette; changed = true;
      }
      if (!changed) return;
      state.festive = f;
      note('festive', cmd.amount || cmd.palette);
    },
    // { event, on }: switch an opt-in event (Snoopy Days) on or off; the calendar is read again at once
    setEventOptIn(ctx, cmd) {
      const { state, note } = ctx;
      if (!OPT_IN_EVENTS.some((e) => e.id === cmd.event)) return;
      const has = state.festive.optIn.includes(cmd.event), on = !!cmd.on;
      if (has === on) return;
      const optIn = on ? [...state.festive.optIn, cmd.event] : state.festive.optIn.filter((x) => x !== cmd.event);
      state.festive = { ...state.festive, optIn };
      refreshCalendar(ctx);
      note('festive', cmd.event);
    },
    // { event }: dress the town in an unlocked set whatever the date, or '' to go back to the calendar
    setEventShow(ctx, cmd) {
      const { state, note } = ctx, f = state.festive, id = typeof cmd.event === 'string' ? cmd.event : '';
      if (id && !f.unlocked.includes(id)) return;
      if (f.show === id) return;
      state.festive = { ...f, show: id };
      refreshCalendar(ctx);
      note('festive', id || 'show-off');
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
