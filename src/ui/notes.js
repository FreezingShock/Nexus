// Notifications: every message the town sends you becomes one small paper strip (src/ui/modules/notes.js draws them).
// This file only decides what a strip says and looks like, so tests can read it without a DOM.
// Two weights: a short notice (one line, a coloured dot icon, gone in a couple of seconds) for plain toasts, and a
// reward strip (title, a line saying what happened, coin and Parts chips that burst into the counters) for milestones,
// goals and the town's little events.

// Icon wells: each kind has its own colour, so you can tell a warning from a reward at a glance.
export const KINDS = {
  info: { icon: 'info', color: '#8FB8D6', life: 2600 },
  done: { icon: 'check', color: '#A8C179', life: 2600 },
  warn: { icon: 'alert', color: '#E3A08E', life: 2800 },
  unlock: { icon: 'key', color: '#C9A6C9', life: 3400 },
  photo: { icon: 'camera', color: '#8FB8D6', life: 2600 },
  milestone: { icon: 'medal', color: '#E6BC62', life: 5600 },
  goal: { icon: 'star', color: '#E6BC62', life: 5200 },
  daily: { icon: 'ribbon', color: '#A8C179', life: 5200 },
  boosted: { icon: 'bolt', color: '#F3D58A', life: 4200 },
  renewed: { icon: 'sprout', color: '#A8C179', life: 5600 },
  holiday: { icon: 'flag', color: '#E3A08E', life: 5600 },
  eventStart: { icon: 'flag', color: '#C9A6C9', life: 5600 },
  keepsake: { icon: 'gift', color: '#E3A08E', life: 6500 },
  firstSnow: { icon: 'snow', color: '#DCE8EC', life: 5200 },
  skipped: { icon: 'sun', color: '#F3D58A', life: 5600 },
};

// Sim event types that get a reward strip, with the title to use when the event brings none.
const NOTE_TYPES = {
  goalDone: 'A goal is done',
  renewed: 'A fresh start',
  boosted: 'Charged up',
  firstSnow: 'First snow',
  milestone: 'A milestone',
  holiday: 'A festival',
  eventStart: 'A festive season',
  keepsake: 'A keepsake',
  skipped: 'Days drift by',
};

export const NOTE_ICONS = {
  info: 'M12 3.5A8.5 8.5 0 1 1 11.99 3.5ZM12 10.5V17M12 7V7.4',
  check: 'M12 3.5A8.5 8.5 0 1 1 11.99 3.5ZM7.8 12.4L10.7 15.2L16.3 9.3',
  alert: 'M12 3.5L21 19.5H3ZM12 9.5V14M12 16.6V17',
  key: 'M8.5 9A4.5 4.5 0 1 1 8.49 9ZM12.6 14.6L20 14.6M17 14.6V18M20 14.6V17.2M8.5 12A1.4 1.4 0 1 1 8.49 12Z',
  camera: 'M3.5 8H8L9.5 5.5H14.5L16 8H20.5V19H3.5ZM12 10A3.5 3.5 0 1 1 11.99 10Z',
  star: 'M12 3L14.6 9L21 9.5L16 13.7L17.6 20L12 16.6L6.4 20L8 13.7L3 9.5L9.4 9Z',
  ribbon: 'M12 3.5A5.5 5.5 0 1 1 11.99 3.5ZM8.6 13.3L6.5 21L9.6 19.3L11 21.5L12 14.5M15.4 13.3L17.5 21L14.4 19.3L13 21.5L12 14.5',
  sprout: 'M12 21V11M12 11C12 7 9 5 5 5C5 9 7 11 12 11ZM12 13C12 9.5 14.5 7.5 19 7.5C19 11.5 16.5 13 12 13Z',
  bolt: 'M13 3L5 14H11L10 21L19 9.5H13Z',
  flag: 'M6 21V4M6 5H18L15 9L18 13H6',
  gift: 'M4 9H20V13H4ZM5.5 13H18.5V20.5H5.5ZM12 9V20.5M12 9C10 5 6.5 5.5 7.5 7.8C8.2 9 12 9 12 9ZM12 9C14 5 17.5 5.5 16.5 7.8C15.8 9 12 9 12 9Z',
  snow: 'M12 2.5V21.5M3.8 7.2L20.2 16.8M3.8 16.8L20.2 7.2M9.5 4L12 6.2L14.5 4M9.5 20L12 17.8L14.5 20',
  sun: 'M12 8A4 4 0 1 1 11.99 8ZM12 2V4.5M12 19.5V22M2 12H4.5M19.5 12H22M5 5L6.8 6.8M17.2 17.2L19 19M5 19L6.8 17.2M17.2 6.8L19 5',
  medal: 'M8 3L10.5 9M16 3L13.5 9M12 8.5A5.5 5.5 0 1 1 11.99 8.5ZM12 12L12.9 13.9L15 14.2L13.5 15.6L13.9 17.7L12 16.7L10.1 17.7L10.5 15.6L9 14.2L11.1 13.9Z',
};

// What a plain toast is about, read from its words: something you cannot do yet, something newly yours, a thing done,
// or just a hint. Events can say it outright with `kind`.
const WARN = /^(not enough|needs |only |nothing |too |that (is|day)|the (tools|town has|whole town)|unlock that|renewal opens|a boost is|charge \d|all \d+ |rivers |something is|coins ran out|the photo did not)|cannot|can't|already|is at the top|is finished as it is/i;
export function toastKind(text) {
  const t = String(text || '');
  if (/unlocked$/i.test(t)) return 'unlock';
  if (WARN.test(t)) return 'warn';
  if (/^(saved |photo mode)/i.test(t)) return 'photo';
  if (/(is back|is named|collected|has been folded|coins back|lights (on|off)|cleared)/i.test(t)) return 'done';
  return 'info';
}

export function isNoteEvent(e) {
  return !!e && Object.prototype.hasOwnProperty.call(NOTE_TYPES, e.type) && typeof e.text === 'string' && e.text.length > 0;
}

const amount = (v) => (Number.isFinite(v) && v >= 1 ? Math.floor(v) : 0);
const tintOf = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null);

// A strip for a sim event (a reward strip), or null when the event is not one.
// { kind, title, text, icon, color, coins, parts, extra (a little chip like "Avenue opens"), life }
export function noteFor(e) {
  if (!isNoteEvent(e)) return null;
  const kind = e.type === 'goalDone' ? (e.kind === 'daily' ? 'daily' : 'goal') : e.type;
  const k = KINDS[kind];
  const title = typeof e.title === 'string' && e.title ? e.title.slice(0, 60) : NOTE_TYPES[e.type];
  // Events that carry their rewards as numbers show them as chips, so the line itself can say what happened.
  const text = typeof e.sub === 'string' && e.sub ? e.sub : e.text;
  return {
    kind, title, text, icon: k.icon, color: tintOf(e.tint) || k.color,
    coins: amount(e.coins), parts: amount(e.parts),
    extra: typeof e.extra === 'string' && e.extra ? e.extra.slice(0, 40) : '',
    life: k.life,
  };
}

// A short notice for a plain toast.
export function toastNote(text, kind) {
  const kd = KINDS[kind] ? kind : toastKind(text);
  const k = KINDS[kd];
  return { kind: kd, title: '', text: String(text).slice(0, 140), icon: k.icon, color: k.color, coins: 0, parts: 0, extra: '', life: k.life, short: true };
}

// Short counts for the reward chips: 13,500 reads as 13.5k so the chip stays small.
export function chipAmount(n) {
  if (n >= 1e9) return '+' + +(n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B';
  if (n >= 1e6) return '+' + +(n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e4) return '+' + +(n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k';
  return '+' + n.toLocaleString('en-US');
}
