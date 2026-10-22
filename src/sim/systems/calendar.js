// The clock, the seasons and the weather. Game seconds advance once per tick, and by the closed-form catch-up away
// (offline hook). The hour, season and weather shown to the player are worked out from the clock and from the
// per-browser choices that sim.setCalendar receives. Choices change what is shown, never the clock or the weather
// rolls, so a lock can be lifted without the town jumping ahead.
import { SEASONS, SOUND_WEATHER, WEATHER, dayLengthS, hourOf, lightAt, nextSeed, pickWeather, seasonIndexOf,
  seasonLengthS, unitOf, weatherSpanS, yearOf } from '../../core/calendar.js';

const SNOW_SEASON = SEASONS.indexOf('winter');

// The sky the player sees: effective hour, season and weather after the locks. Render reads this, never the raw clock.
function view(state, opts) {
  const dayS = dayLengthS(opts), seasonS = seasonLengthS(opts);
  const realSeason = seasonIndexOf(state.clockS, seasonS);
  const season = opts.season === 'auto' ? realSeason : SEASONS.indexOf(opts.season);
  const hour = opts.timeLock === 'day' ? 12 : opts.timeLock === 'night' ? 0 : hourOf(state.clockS, dayS);
  const weather = opts.weather === 'auto' ? state.weatherRoll : opts.weather;
  return { realSeason, season, hour, routineHour: hourOf(state.clockS, dayS), weather, year: yearOf(state.clockS, seasonS), seasonS };
}

// Recomputes what the player sees, after the choices. Runs after every change to the clock, the weather or the choices.
//   state.hour         0 to 24
//   state.season       'spring' | 'summer' | 'autumn' | 'winter'
//   state.weather      'clear' | 'rain' | 'wind' | 'snow' (the sound layer's names; other kinds map to the nearest)
//   state.weatherKind  the full kind: clear, cloudy, rain, snow, fog or leaves (what the visuals use)
//   state.night        0 or 1
//   state.routineHour  0 to 24, the true town clock: a time lock does not stop people keeping their routines
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
    if (!quiet) emit({ type: 'firstSnow', text: 'The first snow dusts the rooftops. The town goes quiet and bright.' });
  }
}

function advance(ctx, quiet) {
  if (ctx.state.clockS >= ctx.state.weatherUntil) rollWeather(ctx, quiet);
  refreshCalendar(ctx);
}

export default {
  id: 'calendar',
  state: () => ({
    clockS: 0,            // game seconds since the town began
    weatherRoll: 'clear', // the weather the sky is really having (before any choice in Settings)
    weatherUntil: 120,    // clock second at which the weather rolls again
    weatherSeed: 7,       // the LCG state for weather rolls
    snowYear: -1,         // the year the first-snow event last fired for
    // Derived, recomputed by refreshCalendar and never saved: what the player sees.
    hour: 8, routineHour: 8, season: 'spring', weather: 'clear', weatherKind: 'clear', night: 0,
  }),
  sanitize(s, fresh) {
    const num = (x, d, lo = 0) => (Number.isFinite(x) ? Math.max(lo, x) : d);
    return {
      clockS: num(s.clockS, fresh.clockS),
      weatherRoll: WEATHER.includes(s.weatherRoll) ? s.weatherRoll : 'clear',
      weatherUntil: num(s.weatherUntil, fresh.weatherUntil),
      weatherSeed: Number.isInteger(s.weatherSeed) && s.weatherSeed >= 0 ? s.weatherSeed >>> 0 : fresh.weatherSeed,
      snowYear: Number.isInteger(s.snowYear) ? s.snowYear : -1,
    };
  },
  init(ctx) { refreshCalendar(ctx); },
  tick(ctx) {
    ctx.state.clockS += 1;
    advance(ctx, false);
  },
  offline(ctx, seconds) {
    ctx.state.clockS += seconds;
    advance(ctx, true);
  },
};
