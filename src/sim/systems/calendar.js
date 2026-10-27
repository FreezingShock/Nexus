// The clock, the seasons and the weather. Game seconds advance once per tick, and by the closed-form catch-up away
// (offline hook). The hour, season and weather shown to the player are worked out from the clock and from the
// per-browser choices that sim.setCalendar receives. Choices change what is shown, never the clock or the weather
// rolls, so a lock can be lifted without the town jumping ahead.
import { SEASONS, SOUND_WEATHER, WEATHER, dateOfDay, dayIndexOf, dayLengthS, hourOfDays, lightAt, monthDaysOf, nextSeed,
  pickWeather, unitOf, weatherSpanS } from '../../core/calendar.js';
import { HOLIDAYS, MARKET, holidayOn, holidaysBetween, marketOn } from '../../core/holidays.js';
import { eventOn } from '../../core/events.js';

const SNOW_SEASON = SEASONS.indexOf('winter');
const FIRST_SNOW = HOLIDAYS.find((h) => h.weather);

// The sky the player sees: effective hour, season and weather after the locks. Render reads this, never the raw clock.
function view(state, opts) {
  const date = dateOfDay(dayIndexOf(state.days), monthDaysOf(opts));
  const realSeason = date.season;
  const season = opts.season === 'auto' ? realSeason : SEASONS.indexOf(opts.season);
  const routineHour = hourOfDays(state.days);
  const hour = opts.timeLock === 'day' ? 12 : opts.timeLock === 'night' ? 0 : routineHour;
  const weather = opts.weather === 'auto' ? state.weatherRoll : opts.weather;
  return { realSeason, season, hour, routineHour, weather, date, year: date.cycle };
}

// Recomputes what the player sees, after the choices. Runs after every change to the clock, the weather or the choices.
//   state.hour         0 to 24
//   state.season       'spring' | 'summer' | 'autumn' | 'winter'
//   state.weather      'clear' | 'rain' | 'wind' | 'snow' (the sound layer's names; other kinds map to the nearest)
//   state.weatherKind  the full kind: clear, cloudy, rain, snow, fog or leaves (what the visuals use)
//   state.night        0 or 1
//   state.routineHour  0 to 24, the true town clock: a time lock does not stop people keeping their routines
//   state.dayIdx       whole days since the town began (0 is the first morning); the number of the day
//   state.year, state.month (0 to 11, January is 0), state.dayOfMonth (from 1): today's date
//   state.holiday      the id of today's festival ('' on an ordinary day; see core/holidays.js)
//   state.market       1 on a market day
//   state.event        the seasonal event under way ('' if none; see core/events.js), state.eventCover 0 to 1 (the share
//                      of buildings dressed up today), state.eventPeak 1 on its big day, state.fireworks 1 on a fireworks night
export function refreshCalendar(ctx) {
  const { state, sim } = ctx;
  const v = view(state, sim.calendarOptions);
  const kind = WEATHER.includes(v.weather) ? v.weather : 'clear';
  state.hour = v.hour;
  state.routineHour = v.routineHour;
  state.season = SEASONS[v.season];
  state.weatherKind = kind;
  state.weather = SOUND_WEATHER[kind];
  state.night = lightAt(v.hour).night >= 0.5 ? 1 : 0;
  state.dayIdx = v.date.dayIdx;
  state.year = v.date.year;
  state.month = v.date.month;
  state.dayOfMonth = v.date.day;
  const fest = holidayOn(v.date.dayIdx, v.date.monthDays);
  state.holiday = fest ? fest.id : (state.snowDay === v.date.dayIdx ? FIRST_SNOW.id : '');
  state.market = marketOn(v.date.dayIdx) ? 1 : 0;
  const ev = eventOn(v.date.dayIdx, v.date.monthDays, state.festive && state.festive.optIn);
  state.event = ev ? ev.id : '';
  state.eventCover = ev ? ev.cover : 0;
  state.eventPeak = ev && ev.peak ? 1 : 0;
  state.fireworks = ev && ev.fireworks ? 1 : 0;
}

// Rolls a new weather when the current one has run out. A snowfall in a winter the town has not seen snow in yet
// raises the first-snow event (postcard note). `quiet` skips the event, for time passed away.
function rollWeather(ctx, quiet) {
  const { state, emit } = ctx;
  const v = view(state, ctx.sim.calendarOptions);
  const s1 = nextSeed(state.weatherSeed), s2 = nextSeed(s1);
  const kind = pickWeather(unitOf(s1), v.realSeason);
  state.weatherRoll = kind;
  state.weatherSeed = s2;
  state.weatherUntil = state.clockS + weatherSpanS(unitOf(s2));
  if (kind === 'snow' && v.realSeason === SNOW_SEASON && state.snowYear !== v.year) {
    state.snowYear = v.year;
    state.snowDay = v.date.dayIdx;
    if (!quiet) emit({ type: 'firstSnow', text: FIRST_SNOW.text });
  }
}

// A day has turned over (live play only; time away reports its festivals in one summary instead).
function newDay(ctx) {
  const { state, emit } = ctx;
  const md = monthDaysOf(ctx.sim.calendarOptions);
  emit({ type: 'newDay', dayIdx: state.dayIdx });
  if (state.dayOfMonth === 1) emit({ type: 'newMonth', month: state.month, year: state.year });
  const fest = holidayOn(state.dayIdx, md);
  if (fest) emit({ type: 'holiday', id: fest.id, title: fest.name, text: fest.text });
  if (marketOn(state.dayIdx)) emit({ type: 'market', id: 'market', text: MARKET.text });
  const ev = eventOn(state.dayIdx, md, state.festive && state.festive.optIn);
  if (ev && ev.day === 0) emit({ type: 'eventStart', id: ev.id, title: ev.event.name + ' season', text: ev.event.start, tint: ev.event.accent });
}

function advance(ctx, quiet) {
  const { state } = ctx;
  if (state.clockS >= state.weatherUntil) rollWeather(ctx, quiet);
  const was = state.dayIdx;
  refreshCalendar(ctx);
  if (!quiet && state.dayIdx > was) newDay(ctx);
}

// The festivals and market days that fall in the days after `fromDay` up to and including `toDay`, in closed form.
export function passedBetween(ctx, fromDay, toDay) {
  return holidaysBetween(fromDay, toDay, monthDaysOf(ctx.sim.calendarOptions));
}

// Closes a skip: the sim has run every system's offline hook with the (reduced) effective seconds, so the clock and the
// day count are put exactly on the target here. `seconds` is the whole skipped span in game seconds.
export function settleSkip(ctx, targetDays, seconds, effective) {
  const { state } = ctx;
  state.days = Math.max(state.days, targetDays);
  state.clockS += Math.max(0, seconds - effective);
  refreshCalendar(ctx);
  newDay(ctx); // the day skipped to is a morning like any other: its festival or market opens
}

export default {
  id: 'calendar',
  state: () => ({
    clockS: 0,            // game seconds since the town began
    days: 0,              // calendar days elapsed, with the fraction of the day: the date and the hour come from this
    weatherRoll: 'clear', // the weather the sky is really having (before any choice in Settings)
    weatherUntil: 120,    // clock second at which the weather rolls again
    weatherSeed: 7,       // the LCG state for weather rolls
    snowYear: -1,         // the season-year (March to February) the first-snow event last fired for
    snowDay: -1,          // the day number the last first snow fell on (derived, not saved)
    // Derived, recomputed by refreshCalendar and never saved: what the player sees.
    dayIdx: 0, year: 1, month: 2, dayOfMonth: 1, holiday: '', market: 0, event: '', eventCover: 0, eventPeak: 0, fireworks: 0,
    hour: 8, routineHour: 8, season: 'spring', weather: 'clear', weatherKind: 'clear', night: 0,
  }),
  commands: {
    skipToDay(ctx, cmd) { ctx.sim.skipToDay(cmd.day); },
  },
  sanitize(s, fresh) {
    const num = (x, d, lo = 0) => (Number.isFinite(x) ? Math.max(lo, x) : d);
    return {
      clockS: num(s.clockS, fresh.clockS),
      days: num(s.days, fresh.days),
      weatherRoll: WEATHER.includes(s.weatherRoll) ? s.weatherRoll : 'clear',
      weatherUntil: num(s.weatherUntil, fresh.weatherUntil),
      weatherSeed: Number.isInteger(s.weatherSeed) && s.weatherSeed >= 0 ? s.weatherSeed >>> 0 : fresh.weatherSeed,
      snowYear: Number.isInteger(s.snowYear) ? s.snowYear : -1,
    };
  },
  init(ctx) { refreshCalendar(ctx); },
  tick(ctx) {
    ctx.state.clockS += 1;
    ctx.state.days += 1 / dayLengthS(ctx.sim.calendarOptions);
    advance(ctx, false);
  },
  offline(ctx, seconds) {
    ctx.state.clockS += seconds;
    ctx.state.days += seconds / dayLengthS(ctx.sim.calendarOptions);
    advance(ctx, true);
  },
};
