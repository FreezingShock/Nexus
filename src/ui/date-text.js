// Words and choices for the date plaque and the skip panel. Pure (no DOM), so the node tests cover them.
import { MONTH_NAMES, MONTH_SHORT, SEASONS, clockText, seasonOfMonth } from '../core/calendar.js';
import { HOLIDAYS, MARKET, holidayOn, marketOn, nextHolidayDay } from '../core/holidays.js';

const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
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

// The month page: one cell per day of the current month, each marked past, today or ahead, with what it holds.
export function monthCells(state, monthDays) {
  const first = state.dayIdx - (state.dayOfMonth - 1);
  return Array.from({ length: monthDays }, (_, i) => {
    const d = first + i, h = holidayOn(d, monthDays);
    return { day: i + 1, dayIdx: d, when: d < state.dayIdx ? 'past' : d === state.dayIdx ? 'today' : 'ahead', holiday: h ? h.id : '', name: h ? h.name : '', market: marketOn(d) };
  });
}

// The year ribbon: twelve months of this calendar year, each with its season and any festival it holds.
export function yearRibbon(state, monthDays) {
  return MONTH_SHORT.map((short, m) => {
    const h = HOLIDAYS.find((x) => !x.weather && x.month === m);
    return { month: m, short, season: SEASONS[seasonOfMonth(m)], current: m === state.month, holiday: h ? h.id : '', name: h ? h.name : '' };
  });
}

// Skip to the first day of next month: the one skip beyond "tomorrow" (a month is only a few days, so nothing longer is offered).
export function nextMonthSkip(state, monthDays) {
  const day = state.dayIdx - (state.dayOfMonth - 1) + monthDays;
  return { day, inDays: day - state.dayIdx, month: (state.month + 1) % 12 };
}
export const skipText = (n) => 'Skip ' + n + (n > 1 ? ' days' : ' day');
export { clockText };
