// Words and choices for the date plaque and the skip panel. Pure (no DOM), so the node tests cover them.
import { MONTH_NAMES, MONTH_SHORT, SEASONS, clockText, dayOfDate, seasonOfMonth } from '../core/calendar.js';
import { HOLIDAYS, MARKET, holidayOn, marketOn, nextHolidayDay } from '../core/holidays.js';

const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
export const SKIP_MAX_YEARS = 2; // the longest single skip; the sim refuses more
export const seasonName = (state) => cap(SEASONS[seasonOfMonth(state.month)]);

export const shortDate = (state) => MONTH_SHORT[state.month] + ' ' + state.dayOfMonth;
export const longDate = (state) => state.dayOfMonth + ' ' + MONTH_NAMES[state.month] + ', Year ' + state.year;
export const yearLine = (state) => 'Year ' + state.year + ' · ' + seasonName(state);
export const townDays = (state) => 'Day ' + (state.dayIdx + 1).toLocaleString('en-US') + ' of the town';

// What today holds: a festival, a market, both, or nothing.
export function todayLine(state) {
  const fest = HOLIDAYS.find((h) => h.id === state.holiday);
  const bits = [];
  if (fest) bits.push(fest.name);
  if (state.market) bits.push(MARKET.name);
  return bits.join(' and ');
}

// The next few festivals after today, each with its date and how many days away it is.
export function upcoming(state, monthDays, n = 3) {
  const out = [];
  let from = state.dayIdx;
  while (out.length < n) {
    const d = nextHolidayDay(from, monthDays);
    if (d < 0) break;
    const h = holidayOn(d, monthDays);
    const monthsElapsed = Math.floor(d / monthDays), m = monthsElapsed + 2;
    out.push({ id: h.id, name: h.name, dayIdx: d, inDays: d - state.dayIdx, month: m % 12, day: (d % monthDays) + 1, year: 1 + Math.floor(m / 12) });
    from = d;
  }
  return out;
}
export const inDaysText = (n) => (n === 1 ? 'tomorrow' : 'in ' + n + ' days');
export const dateOf = (u) => u.day + ' ' + MONTH_SHORT[u.month] + ', Year ' + u.year;

// The quick skips: tomorrow, the next market day, the next festival.
export function quickSkips(state, monthDays) {
  const out = [{ id: 'tomorrow', label: 'Skip to tomorrow', day: state.dayIdx + 1 }];
  let m = -1;
  for (let d = state.dayIdx + 1; d <= state.dayIdx + MARKET.every; d++) if (marketOn(d)) { m = d; break; }
  if (m > 0 && m !== state.dayIdx + 1) out.push({ id: 'market', label: 'Next market day', day: m });
  const f = nextHolidayDay(state.dayIdx, monthDays);
  if (f > 0) out.push({ id: 'festival', label: 'Next festival: ' + holidayOn(f, monthDays).name, day: f });
  return out.map((q) => ({ ...q, inDays: q.day - state.dayIdx }));
}

// The date picker's answer: the day number for a year, month (0 to 11) and day, or why it cannot be skipped to.
export function pick(state, monthDays, year, month, day) {
  const d = dayOfDate(year, month, Math.min(day, monthDays), monthDays);
  if (d < 0) return { ok: false, why: 'Before the town began' };
  if (d <= state.dayIdx) return { ok: false, why: d === state.dayIdx ? 'That is today' : 'That day has passed' };
  if (d - state.dayIdx > SKIP_MAX_YEARS * 12 * monthDays) return { ok: false, why: 'Too far ahead' };
  return { ok: true, day: d, inDays: d - state.dayIdx, text: 'Skip ' + (d - state.dayIdx) + ((d - state.dayIdx) > 1 ? ' days' : ' day') + ' to ' + Math.min(day, monthDays) + ' ' + MONTH_SHORT[month] + ', Year ' + year };
}
export { clockText };
