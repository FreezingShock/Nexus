// What should be sounding: the ambience layers for a moment (time of day, season, weather), the sound that answers each
// sim event, the bell at a change of day, and the music mood. Pure: no Web Audio and no DOM. The engine fades toward
// these levels, and the tests pin the rules down in node.

// Every ambience layer, in the order the engine builds them. `place` says where a layer sits: 'town', 'river' (heard
// from the water), or 'sky' for weather that fills the whole map and does not fade with distance.
export const LAYERS = {
  birds:    { place: 'town' },
  murmur:   { place: 'town' },
  traffic:  { place: 'town' },
  water:    { place: 'river' },
  crickets: { place: 'town' },
  owls:     { place: 'town' },
  cicadas:  { place: 'town' },
  rustle:   { place: 'town' },
  dogs:     { place: 'town' },
  cuckoo:   { place: 'town' },
  hearth:   { place: 'town' },
  frogs:    { place: 'river' },
  thunder:  { place: 'sky' },
  rain:     { place: 'sky' },
  wind:     { place: 'sky' },
  hush:     { place: 'sky' },
};
export const LAYER_NAMES = Object.keys(LAYERS);

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const WEATHERS = ['clear', 'rain', 'wind', 'snow'];

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Levels 0..1 for each layer. Day: birds and street life. Night: crickets, owls and quieter streets.
// Season and weather then add or mute, so a snowy night and a sunny morning both sound like themselves.
// `season` and `weather` come from the sim's state when another system provides them; missing or unknown values count as
// spring and clear, so the soundscape works before the seasons and weather systems land.
// `market` and `festival` liven the streets by day. `people` is the town's head-count: a hamlet hums softly and a busy
// town hums fuller; missing counts as a full town, so the rules hold without the population system.
export function layersFor({ night = false, season = null, weather = 'clear', market = false, festival = false, people = null } = {}) {
  const L = Object.fromEntries(LAYER_NAMES.map((k) => [k, 0]));
  if (night) {
    L.crickets = 0.8; L.owls = 0.45; L.murmur = 0.22; L.traffic = 0.12; L.water = 0.6;
  } else {
    L.birds = 0.8; L.murmur = 0.7; L.traffic = 0.6; L.water = 0.6;
  }
  const s = SEASONS.includes(season) ? season : 'spring';
  if (s === 'spring' && !night) L.birds = clamp01(L.birds + 0.2);
  if (s === 'summer' && !night) L.cicadas = 0.7;
  if (s === 'summer' && night) L.cicadas = 0.3;
  if (s === 'autumn') L.rustle = 0.55;
  if (s === 'winter') { L.hush = 0.4; L.birds *= 0.4; L.crickets *= 0.4; }
  if (!night) L.dogs = s === 'winter' ? 0.2 : 0.35;
  if (!night && s === 'spring') L.cuckoo = 0.6;
  if (!night && s === 'summer') L.cuckoo = 0.25;
  if (night && (s === 'spring' || s === 'summer')) L.frogs = 0.6;
  if (s === 'winter') L.hearth = night ? 0.6 : 0.25;
  if (s === 'autumn' && night) L.hearth = 0.4;
  if (!night && market) L.murmur += 0.2;
  if (!night && festival) L.murmur += 0.15;

  const w = WEATHERS.includes(weather) ? weather : 'clear';
  if (w === 'rain') {
    L.rain = 0.75; L.birds *= 0.5; L.murmur *= 0.8; L.crickets *= 0.3; L.dogs *= 0.4; L.cuckoo *= 0.3;
    L.thunder = s === 'summer' ? 0.7 : 0.45;
    if (s === 'spring' || s === 'summer') L.frogs = Math.max(L.frogs * 1.3, 0.35); // frogs love the rain
  }
  if (w === 'wind') { L.wind = 0.55; L.rustle = Math.max(L.rustle, 0.35); L.birds *= 0.8; }
  if (w === 'snow') { L.hush = Math.max(L.hush, 0.7); L.birds *= 0.3; L.murmur *= 0.7; L.crickets *= 0.2; L.hearth = Math.max(L.hearth, 0.5); }

  const busy = busyness(people);
  L.murmur *= busy; L.traffic *= busy; L.dogs *= 0.5 + 0.5 * busy;

  for (const k of LAYER_NAMES) L[k] = clamp01(L[k]);
  return L;
}

// How lively the streets sound for a head-count: 0.45 for an empty town, rising smoothly to 1 at 300 people.
export function busyness(people) {
  if (!Number.isFinite(people)) return 1;
  const t = clamp01(people / 300);
  return 0.45 + 0.55 * t * t * (3 - 2 * t);
}

// The town's own bells on the clock: a handbell in the square at nine on a market day, and a festival peal at noon on a
// holiday. Days are short, so the ordinary hours stay quiet. A jump of more than three hours (a time lock changing)
// rings nothing.
export function clockCue(prevHour, hour, { market = false, festival = false } = {}) {
  if (!Number.isFinite(prevHour) || !Number.isFinite(hour)) return null;
  const dh = (((hour - prevHour) % 24) + 24) % 24;
  if (dh === 0 || dh > 3) return null;
  const crossed = (h) => { const x = (((h - prevHour) % 24) + 24) % 24; return x > 0 && x <= dh; };
  if (market && crossed(9)) return 'market';
  if (festival && crossed(12)) return 'festival';
  return null;
}

// The bell (and the dawn call) at a change of day. Going to day: a rooster and a bell. Going to night: a bell alone.
// Returns null when nothing changed.
export function transitionCue(wasNight, isNight) {
  if (!!wasNight === !!isNight) return null;
  return isNight ? 'dusk' : 'dawn';
}

// The sim event (src/sim/systems/*) to the cue that answers it. Anything not listed is silent.
export function cueFor(e) {
  if (!e || typeof e.type !== 'string') return null;
  switch (e.type) {
    case 'placed': return 'place';
    case 'bulldozed': return 'bulldoze';
    case 'upgraded': return 'upgrade';
    case 'painted': return 'sparkle';
    case 'roadsChanged':
      if (e.kind === 'draw') return 'road';
      if (e.kind === 'undo') return 'undo';
      if (e.kind === 'replace') return 'upgrade';
      return 'erase';
    case 'zonePainted': return 'zone';
    case 'zoneCleared': return 'erase';
    case 'goalDone': case 'milestone': return 'goal';
    case 'renewed': return 'renew';
    case 'boosted': return 'charge';
    case 'toast': return typeof e.text === 'string' && /Not enough/.test(e.text) ? 'deny' : null;
    default: return null;
  }
}

// How many things an event covers (tiles in a road or a zone), so a cue can play one tick per tile. 1 when there is no count.
export function countOf(e) {
  if (!e) return 1;
  if (e.type === 'roadsChanged' && Array.isArray(e.tiles)) return Math.max(1, e.tiles.length);
  if (e.type === 'zonePainted' && Number.isFinite(e.n)) return Math.max(1, e.n);
  return 1;
}
