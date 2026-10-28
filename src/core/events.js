// Seasonal events: the stretches of the year the whole town dresses up for. Pure (no DOM, no Three.js), so node tests
// cover it. An event spans whole months of the game calendar and builds to its holiday (core/holidays.js): on the first
// day of the month a few houses put their lights up, more follow each day, and by the holiday every street is dressed.
// Days after the holiday (still inside the event's months) stay fully dressed. Render, sound and the calendar panel read
// the three derived fields the sim keeps on state (sim/systems/calendar.js):
//   state.event       the id of the event under way, or ''
//   state.eventCover  0 to 1, the share of buildings dressed up today
//   state.eventPeak   1 on the event's big day (its holiday, or New Year's Eve for the winter lights)
import { dateOfDay } from './calendar.js';
import { HOLIDAYS, posOf } from './holidays.js';

// One row per event. `months` it covers, `peak` the holiday it builds to, `nights` the holidays with fireworks.
// `trees` is the share of trees that get lights wound round them by the big day. `lights` are the string-light colours the town hangs (render picks them in turn along a string), `accent` tints the
// calendar. `start` is the postcard the morning the decorations start to go up.
export const EVENTS = [
  { id: 'july4', name: 'Fourth of July', months: [6], peak: 'july4', fireworks: ['july4'], trees: 0.15,
    lights: [0xE0533F, 0xF7F1E3, 0x4E7FC4], accent: '#4E7FC4',
    start: 'Bunting goes up along the high street. The Fourth of July is coming.' },
  { id: 'halloween', name: 'Halloween', months: [9], peak: 'halloween', fireworks: [], trees: 0.25,
    lights: [0xF08A3C, 0x9A63C4, 0xF3C04F], accent: '#E07B39',
    start: 'The first pumpkins appear on doorsteps. Halloween is on its way.' },
  { id: 'christmas', name: 'Christmas', months: [11], peak: 'christmas', fireworks: ['nye'], trees: 0.6,
    lights: [0xF6D27A, 0xE0533F, 0x5FA86A, 0x6FA0DC], accent: '#C2483A',
    start: 'Someone hung the first string of lights. The Christmas season has begun.' },
  // Opt-in: runs while the town has it switched on (state.festive.optIn, the calendar's Decorations section; on by
// default, so a town can switch it off there). A beagle
  // with black ears, red doghouses on the doorsteps and kites over the roofs, building up to the Blossom Fair.
  { id: 'snoopy', name: 'Snoopy Days', optIn: true, months: [3], peak: 'blossom', fireworks: [], trees: 0.2,
    lights: [0xE0533F, 0xF7F1E3, 0xF3C04F, 0x6FA0DC], accent: '#D9533F',
    start: 'A red doghouse appeared on a doorstep, and a kite is up over the roofs. Snoopy Days have begun.' },
];

// The events the town can switch on, and the ones running for a town that switched on `optIn` (a list of event ids).
export const OPT_IN_EVENTS = EVENTS.filter((e) => e.optIn);
const running = (optIn) => EVENTS.filter((e) => !e.optIn || (optIn && optIn.includes(e.id)));

const byId = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
export const runningEvents = running;
export const eventById = (id) => byId[id] || null;
const holiday = (id) => HOLIDAYS.find((h) => h.id === id);
const FIRST_COVER = 0.35; // the share of buildings dressed on an event's first morning

// The event under way on a day number, or null. { id, event, day (0 from the event's first day), length, peakDay (the
// day within the event its holiday falls on), cover, peak, fireworks, startDay }.
export function eventOn(dayIdx, monthDays, optIn = null, show = '') {
  const d = dateOfDay(dayIdx, monthDays), md = d.monthDays;
  // a set the player switched on shows whatever the date: fully dressed, no big day of its own
  if (show && byId[show]) {
    const e = byId[show], h = holiday(e.peak);
    const peakDay = e.months.indexOf(h.month) * md + posOf(h, md);
    return { id: e.id, event: e, day: peakDay, length: e.months.length * md, peakDay, cover: 1, peak: false, fireworks: false, forced: true, startDay: d.dayIdx };
  }
  for (const e of running(optIn)) {
    const at = e.months.indexOf(d.month);
    if (at < 0) continue;
    const day = at * md + (d.day - 1), length = e.months.length * md;
    const h = holiday(e.peak);
    const peakDay = e.months.indexOf(h.month) * md + posOf(h, md);
    const cover = day >= peakDay || peakDay <= 0 ? 1 : FIRST_COVER + (1 - FIRST_COVER) * (day / peakDay);
    const todayHol = HOLIDAYS.find((x) => !x.weather && x.month === d.month && posOf(x, md) === d.day - 1);
    const fireworks = !!todayHol && e.fireworks.includes(todayHol.id);
    return { id: e.id, event: e, day, length, peakDay, cover, peak: day === peakDay || fireworks, fireworks, startDay: d.dayIdx - day };
  }
  return null;
}

// The next day after `from` an event begins (its first day), with the event; a short search, at most a year.
export function nextEventStart(from, monthDays, optIn = null) { // (never the forced set: it has no start)
  for (let d = Math.max(0, from) + 1, end = d + 12 * monthDays; d <= end; d++) {
    const ev = eventOn(d, monthDays, optIn);
    if (ev && ev.day === 0) return { dayIdx: d, id: ev.id, name: ev.event.name };
  }
  return null;
}

// Words for the calendar: "Christmas season · 2 days to Christmas", or "Christmas!" on the day itself.
export function eventLine(ev) {
  if (!ev) return '';
  const e = ev.event;
  if (ev.forced) return e.name + ' decorations up';
  const toPeak = ev.peakDay - ev.day;
  if (toPeak === 0) return e.name + '!';
  if (toPeak > 0) return e.name + ' season · ' + (toPeak === 1 ? 'tomorrow' : 'in ' + toPeak + ' days');
  return e.name + ' season' + (ev.fireworks ? ' · fireworks tonight' : '');
}
