// The town's festive style: how much it dresses up and in which colours, and which buildings keep their lights off.
// Pure (no DOM, no Three.js). Saved on state.festive by sim/systems/festive.js; render reads it with the event fields.
//   amount    'all' | 'none'                      decorations are a plain switch: all out, or none (old saves had a little / cozy: both become all)
//   unlocked  [event ids]                         seasonal sets the calendar may put up any time (every set, for every town)
//   show      event id or ''                      an unlocked set the player dresses the town in whatever the date
//   palette   { [event id]: palette key }         (missing means 'classic')
//   optIn     [event ids]                         opt-in events that are switched on (core/events.js `optIn`)
//   offered   [event ids]                         opt-in events the town has been given; each starts on once, then
//                                                 stays as the player left it (so a new one arrives switched on)
//   dark      [record ids]                        placed buildings whose owner switched their lights off
import { EVENTS, OPT_IN_EVENTS, eventById } from './events.js';

export const AMOUNT_IDS = ['all', 'none'];

// Light colours per event. The first is the event's own (core/events.js `lights`).
export const PALETTES = {
  christmas: [
    { id: 'classic', name: 'Classic' },
    { id: 'warm', name: 'Warm white', lights: [0xFFE2A6, 0xF6D27A] },
    { id: 'icy', name: 'Icicle', lights: [0xF2F6FF, 0x9FC7F0, 0xDCEBFA] },
    { id: 'candy', name: 'Candy cane', lights: [0xE0533F, 0xF7F1E3] },
  ],
  halloween: [
    { id: 'classic', name: 'Classic' },
    { id: 'pumpkin', name: 'Pumpkin', lights: [0xF08A3C, 0xF3C04F] },
    { id: 'potion', name: 'Potion', lights: [0x9A63C4, 0x7DD36B] },
  ],
  snoopy: [
    { id: 'classic', name: 'Doghouse red' },
    { id: 'kites', name: 'Kite colours', lights: [0xE0533F, 0xF3C04F, 0x6FA0DC, 0x5FA86A] },
    { id: 'cream', name: 'Supper dish', lights: [0xFFF4D6, 0xF2D27A] },
  ],
  july4: [
    { id: 'classic', name: 'Stars and stripes' },
    { id: 'sparkle', name: 'Sparkler', lights: [0xFFF4D6, 0xF2D27A] },
    { id: 'sky', name: 'Sky blue', lights: [0x8DBEDD, 0xF7F1E3] },
  ],
};

const OPT_IDS = OPT_IN_EVENTS.map((e) => e.id);
export const freshFestive = () => ({ amount: 'all', palette: {}, dark: [], optIn: [...OPT_IDS], offered: [...OPT_IDS], unlocked: EVENTS.map((e) => e.id), show: '' });

export function sanitizeFestive(raw) {
  const out = freshFestive();
  if (!raw || typeof raw !== 'object') return out;
  if (raw.amount === 'none') out.amount = 'none';
  if (raw.palette && typeof raw.palette === 'object') {
    for (const [ev, list] of Object.entries(PALETTES)) if (list.some((p) => p.id === raw.palette[ev])) out.palette[ev] = raw.palette[ev];
  }
  // an opt-in event the save has not been given yet arrives switched on; one it has keeps the player's choice
  const offered = Array.isArray(raw.offered) ? raw.offered : [], on = Array.isArray(raw.optIn) ? raw.optIn : [];
  out.optIn = OPT_IDS.filter((id) => !offered.includes(id) || on.includes(id));
  // every set is available to every town, whatever an older save said
  out.show = typeof raw.show === 'string' && out.unlocked.includes(raw.show) ? raw.show : '';
  if (Array.isArray(raw.dark)) out.dark = [...new Set(raw.dark.filter((x) => typeof x === 'string' && /^b\d+$/.test(x)))].slice(0, 2000);
  return out;
}

// The light colours the town hangs for an event, after the town's palette choice.
export function lightsFor(eventId, festive) {
  const ev = eventById(eventId);
  if (!ev) return [];
  const key = festive && festive.palette ? festive.palette[eventId] : null;
  const p = (PALETTES[eventId] || []).find((x) => x.id === key);
  return p && p.lights ? p.lights : ev.lights;
}

// The share of buildings and trees dressed while an event is on: all of them, or none when the town has decorations off.
export function dressShare(eventId, cover, festive) {
  const ev = eventById(eventId);
  if (!ev || (festive && festive.amount === 'none')) return { buildings: 0, trees: 0 };
  return { buildings: 1, trees: Math.min(0.9, ev.trees * 1.5) };
}

// Whether a building keeps its lights off (placed records only; grown lots follow the town).
export const isDark = (festive, id) => !!(festive && festive.dark && id && festive.dark.includes(id));
