// Holidays and recurring days, as a data table. Pure: dates come from core/calendar.js, so the table works for any month
// length. A festival falls on the first, middle or last day of a month; the middle of a two-day month is the first day.
// Add a festival by adding a row: the sim raises a `holiday` event the day it arrives, and other systems can read
// `state.holiday` (the id, or '') to react. First snow is weather, not a date: the weather roll raises it.
import { dateOfDay } from './calendar.js';

export const HOLIDAYS = [
  { id: 'newyear', name: "New Year's Day", month: 0, at: 'first', text: 'A new year begins. The town wakes late and waves from the windows.' },
  { id: 'thaw', name: 'Thaw Day', month: 1, at: 'last', text: 'Icicles drip and the river runs again. Spring is close.' },
  { id: 'blossom', name: 'Blossom Fair', month: 3, at: 'mid', text: 'Petals on the breeze, and stalls down the high street. The Blossom Fair is on.' },
  { id: 'midsummer', name: 'Midsummer Fete', month: 5, at: 'mid', text: 'The longest light of the year. The whole town is out on the green.' },
  { id: 'july4', name: 'Fourth of July', month: 6, at: 'mid', text: 'Flags on every porch, a picnic on the green, and fireworks once it gets dark.' },
  { id: 'harvest', name: 'Harvest Feast', month: 8, at: 'mid', text: 'The fields are in. Long tables, warm bread and a lot of thank-yous.' },
  { id: 'halloween', name: 'Halloween', month: 9, at: 'last', text: 'Pumpkins grin on every step, and little ghosts and witches go door to door.' },
  { id: 'lantern', name: 'Lantern Night', month: 10, at: 'first', text: 'Paper lanterns glow in every window tonight.' },
  { id: 'christmas', name: 'Christmas', month: 11, at: 'mid', text: 'Snowy roofs, twinkling lights and a tree in the square. Merry Christmas, mayor.' },
  { id: 'nye', name: "New Year's Eve", month: 11, at: 'last', text: 'The whole town stays up late. Fireworks at midnight!' },
  { id: 'firstsnow', name: 'First Snow', weather: true, text: 'The first snow dusts the rooftops. The town goes quiet and bright.' },
];
export const MARKET = { every: 3, phase: 2, name: 'Market day', text: 'Stalls are up in the square. Market day!' };

const dated = HOLIDAYS.filter((h) => !h.weather);
export const posOf = (h, md) => (h.at === 'first' ? 0 : h.at === 'last' ? md - 1 : Math.floor((md - 1) / 2));

export function holidayOn(dayIdx, monthDays) {
  const d = dateOfDay(dayIdx, monthDays);
  return dated.find((h) => h.month === d.month && posOf(h, monthDays) === d.day - 1) || null;
}
export const marketOn = (dayIdx) => dayIdx > 0 && dayIdx % MARKET.every === MARKET.phase;

// Occurrences of day numbers in (from, to], in closed form (no walk over the days). A festival repeats every
// 12 * monthDays days at a fixed offset; a market every `every` days.
const countRepeat = (from, to, offset, period) => Math.floor((to - offset) / period) - Math.floor((from - offset) / period);
export function holidaysBetween(from, to, monthDays) {
  const out = { festivals: [], markets: 0 };
  if (!(to > from)) return out;
  const period = 12 * monthDays;
  for (const h of dated) {
    // the offset of its first occurrence: the epoch is March, so month m is (m - 2) months in (mod 12)
    const offset = ((h.month + 10) % 12) * monthDays + posOf(h, monthDays);
    const count = countRepeat(from, to, offset, period);
    if (count > 0) out.festivals.push({ id: h.id, name: h.name, count });
  }
  out.markets = Math.max(0, countRepeat(Math.max(from, 0), to, MARKET.phase, MARKET.every));
  return out;
}

// The next day after `from` that holds a festival (or a market with { market: true }); a short search, at most a year.
export function nextHolidayDay(from, monthDays, { market = false } = {}) {
  for (let d = Math.max(0, from) + 1, end = d + 12 * monthDays; d <= end; d++) {
    if (holidayOn(d, monthDays) || (market && marketOn(d))) return d;
  }
  return -1;
}
