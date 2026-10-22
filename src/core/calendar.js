// Time of day, seasons and weather: the rules the sim and the render side share. Pure: no DOM, no Three.js, so the
// rules are tested in node. The clock is game seconds (one per sim tick, plus the closed-form catch-up away); the hour,
// season and weather are worked out from it. Per-browser choices (locks and lengths) live in the store at the bottom
// and never reach the save: they change what the town shows, not the clock.

export const CALENDAR_KEY = 'nexus.calendar.v1';
const VERSION = 1;

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const WEATHER = ['clear', 'cloudy', 'rain', 'snow', 'fog', 'leaves'];
export const DAY_LENGTHS = { quick: 300, normal: 720, slow: 1440 }; // real seconds in one in-game day
export const SEASON_DAYS = { short: 2, normal: 4, long: 8 };          // in-game days in one season
const START_HOUR = 8;                                                  // a new town wakes at eight

// What each option may hold. Anything else in storage is ignored and the default is used.
export const OPTIONS = {
  dayLength: ['quick', 'normal', 'slow'],
  seasonLength: ['short', 'normal', 'long'],
  timeLock: ['auto', 'day', 'night'],
  season: ['auto', ...SEASONS],
  weather: ['auto', ...WEATHER],
};
export const DEFAULTS = { dayLength: 'normal', seasonLength: 'short', timeLock: 'auto', season: 'auto', weather: 'auto' };

export function sanitizeCalendar(raw) {
  const out = { ...DEFAULTS };
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(OPTIONS)) if (OPTIONS[k].includes(raw[k])) out[k] = raw[k];
  }
  return out;
}

// The sound layer's four weathers. Every other kind maps to the nearest of them.
export const SOUND_WEATHER = { clear: 'clear', cloudy: 'clear', fog: 'clear', rain: 'rain', snow: 'snow', leaves: 'wind' };

export const dayLengthS = (o) => DAY_LENGTHS[o.dayLength] ?? DAY_LENGTHS.normal;
export const seasonLengthS = (o) => dayLengthS(o) * (SEASON_DAYS[o.seasonLength] ?? SEASON_DAYS.normal);

// The hour of the in-game day, 0 to 24, for a clock in seconds. Never negative: a negative clock counts as 0.
export function hourOf(clockS, dayS) {
  const day = Math.max(0, clockS) / dayS;
  return (START_HOUR + (day - Math.floor(day)) * 24) % 24;
}

// Index into SEASONS for a clock in seconds, and the year number (a year is four seasons).
export function seasonIndexOf(clockS, seasonS) { return Math.floor(Math.max(0, clockS) / seasonS) % 4; }
export function yearOf(clockS, seasonS) { return Math.floor(Math.max(0, clockS) / (seasonS * 4)); }

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Sun height in [-1, 1]: 1 at noon, 0 at six and eighteen, -1 at midnight.
export function sunHeight(hour) { return Math.sin(((hour - 6) / 12) * Math.PI); }

// Light for an hour. `dir` points from the town towards the sun, or towards the moon once the sun is below the horizon.
export function lightAt(hour) {
  const h = sunHeight(hour), th = ((hour - 6) / 12) * Math.PI;
  const sunDir = [-Math.cos(th), Math.sin(th), 0.35];
  const moonSide = h < 0;
  return {
    hour,
    night: smooth(0.08, -0.12, h),   // 1 once the sun is well under the roofs
    daylight: smooth(-0.1, 0.3, h),
    warm: Math.exp(-(h * h) / 0.05), // peaks as the sun meets the horizon: dawn and dusk
    dir: moonSide ? sunDir.map((v) => -v) : sunDir,
  };
}

// Weather. A new roll happens when the current one runs out. Seeds advance with a plain LCG so the sequence is
// the same for the same save, and the rolls never touch Math.random.
export function nextSeed(seed) { return (Math.imul((seed >>> 0), 1664525) + 1013904223) >>> 0; }
export function unitOf(seed) { return (seed >>> 0) / 4294967296; }

const WEIGHTS = {
  spring: { clear: 5, cloudy: 3, rain: 3, fog: 1 },
  summer: { clear: 7, cloudy: 2, rain: 2, fog: 0.5 },
  autumn: { clear: 3, cloudy: 3, rain: 3, fog: 1, leaves: 3 },
  winter: { clear: 3, cloudy: 3, snow: 3, fog: 1, rain: 1 },
};

// u in [0, 1). Season is an index into SEASONS.
export function pickWeather(u, season) {
  const w = WEIGHTS[SEASONS[season]] || WEIGHTS.spring;
  const keys = Object.keys(w);
  const total = keys.reduce((a, k) => a + w[k], 0);
  let r = u * total;
  for (const k of keys) { if (r < w[k]) return k; r -= w[k]; }
  return keys[keys.length - 1];
}

// Clock seconds a roll lasts: 1.5 to 4 minutes at the default day length.
export function weatherSpanS(u) { return 90 + u * 150; }

// What each weather adds to the look. Every value is a target between 0 and 1; render smooths them.
const LOOK = {
  clear: {},
  cloudy: { cloud: 0.55 },
  rain: { cloud: 0.85, fog: 0.15, rain: 1, wet: 1 },
  snow: { cloud: 0.6, fog: 0.1, snow: 1 },
  fog: { cloud: 0.5, fog: 1 },
  leaves: { cloud: 0.15, leaves: 1 },
};

// What each season does to the look. Colours are targets that render eases towards; amounts are 0 to 1.
//   foliage / foliageCol     how much a leaf surface takes the colour (grass, broadleaf canopies)
//   foliageAlt / autumn      autumn: some leaves go red, the rest gold (autumn is the amount of that split)
//   blossom                  spring blossom on broadleaf canopies only
//   field                    the crop colour on farmland
//   water                    the river colour
//   haze / sun / strength    the sky's haze colour, the light's colour and its strength
//   low                      how low the sun sits (1 is the summer arc; winter's is lower, so shadows are longer)
//   petals / ambientLeaves   falling petals in spring; a few leaves drift down in autumn
export const SEASON_LOOK = {
  spring: { foliage: 0.55, foliageCol: 0xC6E27A, blossom: 0.7, field: 0x9FC563, water: 0x6FA9B8, haze: 0xF1E6C8, sun: 0xFFEBC0, strength: 0.95, low: 1, petals: 0.4 },
  summer: { foliage: 0.35, foliageCol: 0x5E9E3A, field: 0xD8B05A, water: 0x4F9DBE, haze: 0xD7E8EE, sun: 0xFFF0CC, strength: 1.1, low: 1 },
  autumn: { foliage: 0.95, foliageCol: 0xD9A23A, foliageAlt: 0xB8532E, autumn: 1, field: 0x8E6B47, water: 0x6F8A8C, haze: 0xE8C9A0, sun: 0xFFC47A, strength: 0.8, low: 0.88, ambientLeaves: 0.3 },
  winter: { foliage: 0.55, foliageCol: 0x8A7A55, field: 0x7A6F62, water: 0xA9C2CB, haze: 0xC9D5DD, sun: 0xD9E6FF, strength: 0.65, low: 0.72 },
};

// The full set of targets for one moment. Render eases its values towards these.
// season is a name from SEASONS (or an index into it). weather is a kind from WEATHER.
export function atmosphereTargets({ hour, weather, season }) {
  const light = lightAt(hour);
  const look = LOOK[weather] || {};
  const name = typeof season === 'number' ? SEASONS[season] || 'spring' : SEASONS.includes(season) ? season : 'spring';
  const L = SEASON_LOOK[name];
  const dir = light.dir.slice();
  dir[1] *= L.low;
  return {
    night: light.night, warm: light.warm, daylight: light.daylight, dir,
    cloud: look.cloud || 0, fog: look.fog || 0, rain: look.rain || 0, snow: look.snow || 0,
    leaves: Math.max(look.leaves || 0, L.ambientLeaves || 0), wet: look.wet || 0,
    cover: Math.max(name === 'winter' ? 0.9 : 0, look.snow ? 1 : 0), // how much snow lies on roofs and grass
    foliage: L.foliage, foliageCol: L.foliageCol, foliageAlt: L.foliageAlt ?? L.foliageCol, autumn: L.autumn || 0,
    blossom: L.blossom || 0, field: L.field, water: L.water,
    haze: L.haze, sun: L.sun, strength: L.strength,
    petals: (L.petals || 0) * (1 - (look.rain || 0)),
  };
}

// The clock as text for the Settings line: "14:20".
export function clockText(hour) {
  const m = Math.round(hour * 60) % (24 * 60);
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

// The per-browser store. `storage` may be missing or throw; the town never waits on these choices.
function readStored(storage) {
  try {
    const raw = JSON.parse((storage && storage.getItem(CALENDAR_KEY)) || 'null');
    return raw && raw.v === VERSION ? raw.options : null;
  } catch { return null; }
}

export function createCalendarStore({ storage = null, onChange = () => {} } = {}) {
  let state = sanitizeCalendar(readStored(storage));
  const get = () => ({ ...state });
  return {
    get,
    set(key, value) {
      if (!OPTIONS[key] || !OPTIONS[key].includes(value)) return false;
      state = { ...state, [key]: value };
      try { if (storage) storage.setItem(CALENDAR_KEY, JSON.stringify({ v: VERSION, options: state })); }
      catch { /* not kept: the choice lasts this visit */ }
      onChange(get());
      return true;
    },
  };
}
