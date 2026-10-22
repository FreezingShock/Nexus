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
export function layersFor({ night = false, season = null, weather = 'clear' } = {}) {
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

  const w = WEATHERS.includes(weather) ? weather : 'clear';
  if (w === 'rain') { L.rain = 0.75; L.birds *= 0.5; L.murmur *= 0.8; L.crickets *= 0.3; }
  if (w === 'wind') { L.wind = 0.55; L.rustle = Math.max(L.rustle, 0.35); L.birds *= 0.8; }
  if (w === 'snow') { L.hush = Math.max(L.hush, 0.7); L.birds *= 0.3; L.murmur *= 0.7; L.crickets *= 0.2; }

  for (const k of LAYER_NAMES) L[k] = clamp01(L[k]);
  return L;
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
    case 'roadsChanged':
      if (e.kind === 'draw') return 'road';
      if (e.kind === 'undo') return 'undo';
      return 'erase';
    case 'zonePainted': return 'zone';
    case 'zoneCleared': return 'erase';
    case 'goalDone': return 'goal';
    case 'renewed': return 'renew';
    case 'boosted': return 'charge';
    case 'toast': return typeof e.text === 'string' && /Not enough/.test(e.text) ? 'deny' : null;
    default: return null;
  }
}

// Music moods. Frequencies are in Hz. Day is a bright, open pentatonic; night is lower, sparser and minor.
export const MOODS = {
  day: {
    chords: [
      [261.63, 329.63, 392.0],   // C
      [220.0, 261.63, 329.63],   // Am
      [174.61, 220.0, 261.63],   // F
      [196.0, 246.94, 293.66],   // G
    ],
    scale: [523.25, 587.33, 659.25, 783.99, 880.0],
    padLevel: 0.5, noteEvery: [1.6, 3.2], noteChance: 0.6,
  },
  night: {
    chords: [
      [220.0, 261.63, 329.63],   // Am
      [174.61, 220.0, 261.63],   // F
      [130.81, 164.81, 196.0],   // C, low
      [196.0, 246.94, 293.66],   // G
    ],
    scale: [440.0, 523.25, 587.33, 659.25, 783.99],
    padLevel: 0.35, noteEvery: [2.6, 5.0], noteChance: 0.4,
  },
};

export function moodFor(night) { return night ? MOODS.night : MOODS.day; }
