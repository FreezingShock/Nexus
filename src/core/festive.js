// The town's festive style: how much it dresses up and in which colours, and which buildings keep their lights off.
// Pure (no DOM, no Three.js). Saved on state.festive by sim/systems/festive.js; render reads it with the event fields.
//   amount    'none' | 'light' | 'cozy' | 'all'   ('cozy' is the default: decorations build up through the month)
//   palette   { [event id]: palette key }         (missing means 'classic')
//   optIn     [event ids]                         opt-in events the town switched on (core/events.js `optIn`)
//   dark      [record ids]                        placed buildings whose owner switched their lights off
import { OPT_IN_EVENTS, eventById } from './events.js';

export const AMOUNTS = [
  { id: 'none', name: 'None', line: 'No decorations this year' },
  { id: 'light', name: 'A little', line: 'Some houses join in' },
  { id: 'cozy', name: 'Cozy', line: 'Builds up through the month' },
  { id: 'all', name: 'All out', line: 'Every street, from day one' },
];
const AMOUNT_IDS = AMOUNTS.map((a) => a.id);

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
  july4: [
    { id: 'classic', name: 'Stars and stripes' },
    { id: 'sparkle', name: 'Sparkler', lights: [0xFFF4D6, 0xF2D27A] },
    { id: 'sky', name: 'Sky blue', lights: [0x8DBEDD, 0xF7F1E3] },
  ],
};

export const freshFestive = () => ({ amount: 'cozy', palette: {}, dark: [], optIn: [] });

export function sanitizeFestive(raw) {
  const out = freshFestive();
  if (!raw || typeof raw !== 'object') return out;
  if (AMOUNT_IDS.includes(raw.amount)) out.amount = raw.amount;
  if (raw.palette && typeof raw.palette === 'object') {
    for (const [ev, list] of Object.entries(PALETTES)) if (list.some((p) => p.id === raw.palette[ev])) out.palette[ev] = raw.palette[ev];
  }
  if (Array.isArray(raw.optIn)) out.optIn = OPT_IN_EVENTS.map((e) => e.id).filter((id) => raw.optIn.includes(id));
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

// The share of buildings dressed today, and of trees by the big day, after the town's amount.
//   cover   0 to 1 (state.eventCover, the month's build-up)
export function dressShare(eventId, cover, festive) {
  const ev = eventById(eventId);
  if (!ev) return { buildings: 0, trees: 0 };
  const amount = festive && AMOUNT_IDS.includes(festive.amount) ? festive.amount : 'cozy';
  if (amount === 'none') return { buildings: 0, trees: 0 };
  if (amount === 'all') return { buildings: 1, trees: Math.min(0.9, ev.trees * 1.5) };
  const k = amount === 'light' ? 0.45 : 1;
  return { buildings: cover * k, trees: cover * ev.trees * k };
}

// Whether a building keeps its lights off (placed records only; grown lots follow the town).
export const isDark = (festive, id) => !!(festive && festive.dark && id && festive.dark.includes(id));
