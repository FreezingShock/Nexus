// The music: little tunes written on the spot, one at a time, to fit the moment. A tune has a key, a tempo, a chord
// progression, a melody built from a short motif (A, A', B, A'), an accompaniment and a bass, all as plain note events.
// Pure: no Web Audio and no DOM, so the rules are tested in node. The engine (engine.js) plays the events with its
// instruments and leaves a quiet gap between tunes, as the music mode in Settings asks.

// Scale steps in semitones above the key note.
export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
};

// Every instrument the engine knows (engine.js VOICES). Tests check each style only names these.
export const VOICES = ['piano', 'harp', 'musicbox', 'flute', 'pad', 'bass'];

// Between tunes there is a quiet stretch of town sound (nate's choice: tunes with gaps, no setting). The music slider
// at zero is the way to have no music.
export const GAP_S = [45, 110];
export const FIRST_TUNE_S = 4;  // the first tune starts this long after sound unlocks
export const REGREET_S = 12;    // a gap shortens to this when day turns to night (or back), to greet the change

// Where the day is, for the tune's character. Days are short (two minutes), so this is read once, when a tune starts.
export function phaseOf(hour, night) {
  if (!Number.isFinite(hour)) return night ? 'night' : 'day';
  const h = ((hour % 24) + 24) % 24;
  if (night) return 'night';
  if (h >= 4.5 && h < 9) return 'dawn';
  if (h >= 17 && h < 21) return 'dusk';
  return 'day';
}

// Each part of the day: its modes, keys (MIDI note of the key), tempo range, voices and progressions (scale degrees,
// 0 is the home chord). Density is how busy the melody is (0..1); level trims the whole tune.
export const STYLES = {
  dawn: {
    modes: ['lydian', 'ionian'], keys: [62, 64, 65], bpm: [68, 76], lead: 'flute', comp: 'harp', bass: 'bass',
    progs: [[0, 3, 0, 4], [0, 1, 3, 0], [0, 5, 3, 4]], alt: [[3, 4, 5, 4], [5, 3, 1, 4]], density: 0.5, level: 0.85,
  },
  day: {
    modes: ['ionian', 'mixolydian'], keys: [60, 62, 65, 67], bpm: [78, 90], lead: 'piano', comp: 'harp', bass: 'bass',
    progs: [[0, 5, 3, 4], [0, 3, 4, 0], [0, 4, 5, 3], [0, 3, 0, 4]], alt: [[3, 4, 2, 5], [5, 3, 4, 4], [3, 0, 3, 4]], density: 0.7, level: 1,
  },
  dusk: {
    modes: ['dorian', 'ionian'], keys: [57, 60, 62], bpm: [64, 72], lead: 'piano', comp: 'pad', bass: 'bass',
    progs: [[0, 3, 5, 4], [0, 6, 3, 4], [0, 5, 1, 4]], alt: [[3, 1, 4, 4], [5, 3, 6, 4]], density: 0.5, level: 0.85,
  },
  night: {
    modes: ['aeolian', 'dorian'], keys: [57, 55, 60], bpm: [56, 64], lead: 'musicbox', comp: 'pad', bass: 'bass',
    progs: [[0, 5, 3, 4], [0, 3, 0, 6], [0, 6, 5, 4]], alt: [[3, 6, 2, 4], [5, 6, 3, 4]], density: 0.35, level: 0.7,
  },
};

// The season's own colour: the voice that takes the melody in the B section, and a nudge to the tempo.
export const SEASON_COLOUR = {
  spring: { voice: 'flute', tempo: 1.03 },
  summer: { voice: 'harp', tempo: 1.05 },
  autumn: { voice: 'piano', tempo: 0.96 },
  winter: { voice: 'musicbox', tempo: 0.92 },
};

const BAR = 4; // beats in a bar
// Melody rhythms for one bar, in beats. A negative number is a rest. Listed from sparse to busy.
const RHYTHMS = [
  [3, 1], [2, 2], [-1, 1, 2], [2, 1, 1], [1, 1, 2], [1.5, 0.5, 2], [1, 0.5, 0.5, 2], [1, 1, 1, 1], [0.5, 0.5, 1, 2],
  [0.5, 0.5, 0.5, 0.5, 2],
];
// Moves of the melody between notes, in scale steps: mostly small steps, now and then a leap.
const STEPS = [-2, -1, -1, -1, 0, 1, 1, 1, 2, 2, 3, -3, 4];
const PENTA = [0, 1, 2, 4, 5]; // the warm degrees for passing notes (no 4th, no 7th)

const WORDS = {
  dawn: ['First Light', 'Dewfall', 'Morning Bread', 'Early Kettle', 'Open Shutters', 'Milk Cart'],
  day: ['Market Square', 'Bicycle Bells', 'Washing Lines', 'Window Boxes', 'Errands', 'Lemonade', 'Busy Bees'],
  dusk: ['Lamplighter', 'Long Shadows', 'Supper Bells', 'Amber Roofs', 'Homeward', 'Golden Hour'],
  night: ['Quiet Chimneys', 'Moon over the Weir', 'Lantern Walk', 'Sleeping Gables', 'Owl Song', 'Starlit Tiles'],
  rain: ['Rain on the Tiles', 'Puddle Hopping', 'Umbrella Weather', 'Drip and Drop'],
  winter: ['Snow on the Steeple', 'Mittens', 'Warm Windows', 'Hearthside'],
  festival: ['Bunting', 'Fair Day', 'Ribbons and Reels', 'Lanterns Up'],
};
const PLACES = ['on Mill Lane', 'by the River', 'over the Rooftops', 'in the Square', 'along the Hedges', 'at the Bakery',
  'down Church Row', 'past the Orchard'];

// A small seeded random source (mulberry32), so a seed always writes the same tune.
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    range: (lo, hi) => lo + next() * (hi - lo),
  };
}

// The MIDI note of scale degree d (any integer; 7 is the key note an octave up) in a key and mode.
export function noteOf(key, mode, d) {
  const steps = MODES[mode] || MODES.ionian;
  const oct = Math.floor(d / 7), i = ((d % 7) + 7) % 7;
  return key + oct * 12 + steps[i];
}
export const hzOf = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

const chordTones = (root) => [root, root + 2, root + 4];
// The chord tone of `root` closest to degree d.
function nearestChordTone(d, root) {
  let best = d, bestDist = Infinity;
  for (const tone of chordTones(root)) for (let o = -14; o <= 14; o += 7) {
    const c = tone + o, dist = Math.abs(c - d);
    if (dist < bestDist) { best = c; bestDist = dist; }
  }
  return best;
}
function nearestPenta(d) {
  const i = ((d % 7) + 7) % 7;
  if (PENTA.includes(i)) return d;
  return d + (i === 3 ? -1 : 1); // 4th falls to the 3rd, 7th rises to the octave
}
const LOW = 0, HIGH = 11; // the melody's range in degrees above the key, an octave up from the chords

// One motif: two bars of melody over two chords, starting near degree `from`. Returns notes and where it ended.
function motif(r, density, chords, from, endOn = null) {
  const notes = [];
  let d = from;
  const rhythmPool = RHYTHMS.slice(0, Math.max(3, Math.round(RHYTHMS.length * (0.35 + density * 0.65))));
  for (let bar = 0; bar < chords.length; bar++) {
    const rhythm = r.pick(rhythmPool);
    let beat = 0;
    rhythm.forEach((len, i) => {
      const dur = Math.abs(len);
      if (len > 0) {
        d += r.pick(STEPS);
        if (d < LOW) d = LOW + (LOW - d);
        if (d > HIGH) d = HIGH - (d - HIGH);
        const strong = beat === 0 || beat === 2;
        d = strong ? nearestChordTone(d, chords[bar]) : nearestPenta(d);
        const last = bar === chords.length - 1 && i === rhythm.length - 1;
        if (last && endOn !== null) d = nearestOf(d, endOn);
        notes.push({ at: bar * BAR + beat, d: Math.min(HIGH, Math.max(LOW, d)), dur, vel: strong ? 0.9 : 0.7 });
      }
      beat += dur;
    });
  }
  return { notes, end: d };
}
// The degree with the same scale step as `target` (mod 7) nearest d.
function nearestOf(d, target) {
  let best = target, bestDist = Infinity;
  for (let o = -14; o <= 21; o += 7) { const c = target + o, dist = Math.abs(c - d); if (dist < bestDist) { best = c; bestDist = dist; } }
  return best;
}

// The accompaniment for one bar of a chord, as degree events relative to the bar start.
function compBar(voice, root, r, busy) {
  const [a, b, c] = chordTones(root).map((x) => x - 7); // an octave under the melody
  if (voice === 'pad') return [{ at: 0, d: [a, b, c], dur: BAR, vel: 0.6 }];
  if (voice === 'harp') {
    const up = [a, b, c, a + 7, c, b, a + 7, c];
    const step = busy ? 0.5 : 1;
    const out = [];
    for (let i = 0; i * step < BAR; i++) out.push({ at: i * step, d: [up[i % up.length]], dur: step * 2, vel: i === 0 ? 0.7 : 0.45 });
    return out;
  }
  // piano and anything else: a soft broken chord on the first and third beats
  return [{ at: 0, d: [a, c], dur: 2, vel: 0.5 }, { at: 1, d: [b], dur: 1, vel: 0.35 }, { at: 2, d: [a, b, c], dur: 2, vel: 0.4 + r.next() * 0.1 }];
}

export function titleFor(r, { phase, season, weather, festival }) {
  let pool = WORDS[phase];
  if (festival && phase !== 'night') pool = WORDS.festival;
  else if (weather === 'rain' || weather === 'snow') pool = weather === 'rain' ? WORDS.rain : WORDS.winter;
  else if (season === 'winter' && r.next() < 0.5) pool = WORDS.winter;
  const word = r.pick(pool);
  return r.next() < 0.55 && !/ the | on | over /.test(word) ? `${word} ${r.pick(PLACES)}` : word;
}

// Writes one tune. `seed` picks every choice; `moment` is { hour, night, season, weather, festival }.
// Returns { title, phase, bpm, beats, level, events } where each event is { at (beats), midi: [..], dur (beats), vel, voice }.
export function composeTune(seed, moment = {}) {
  const r = rng(seed);
  const phase = phaseOf(moment.hour, !!moment.night);
  const style = STYLES[phase];
  const season = SEASON_COLOUR[moment.season] ? moment.season : 'spring';
  const colour = SEASON_COLOUR[season];
  const wet = moment.weather === 'rain' || moment.weather === 'snow';
  const festival = !!moment.festival && phase !== 'night';

  let mode = r.pick(style.modes);
  if (wet && (mode === 'ionian' || mode === 'lydian')) mode = 'dorian';
  if (festival) mode = 'ionian';
  const key = r.pick(style.keys);
  let bpm = r.range(style.bpm[0], style.bpm[1]) * colour.tempo * (wet ? 0.9 : 1) * (festival ? 1.12 : 1);
  bpm = Math.round(bpm);
  const density = Math.min(1, style.density * (wet ? 0.75 : 1) + (festival ? 0.2 : 0));
  const comp = wet ? 'pad' : style.comp;
  const lead = wet && style.lead === 'flute' ? 'piano' : style.lead;
  const leadB = colour.voice === lead ? (lead === 'piano' ? 'musicbox' : 'piano') : colour.voice;

  const prog = r.pick(style.progs), alt = r.pick(style.alt);
  // Form: intro (2 bars), A, A', B, A', outro (2 bars). Each section is four bars.
  const sections = [
    { name: 'intro', chords: [prog[0], prog[0]], melody: false },
    { name: 'A', chords: prog, melody: 'a' },
    { name: "A'", chords: prog, melody: 'a2' },
    { name: 'B', chords: alt, melody: 'b' },
    { name: "A'", chords: prog, melody: 'a2' },
    { name: 'outro', chords: [prog[3] === 4 ? 4 : prog[3], 0], melody: 'end' },
  ];

  const start = r.pick([2, 4, 4, 7]);
  const m1 = motif(r, density, prog.slice(0, 2), start);
  const m2 = motif(r, density, prog.slice(2, 4), m1.end, r.pick([1, 4]));      // half close: ends away from home
  const m2b = motif(r, density, prog.slice(2, 4), m1.end, 0);                  // full close: ends at home
  const m3 = motif(r, density, alt.slice(0, 2), Math.min(HIGH, m1.end + 2));
  const m3b = motif(r, density, alt.slice(2, 4), m3.end, 4);
  const melodyOf = {
    a: [...m1.notes, ...m2.notes.map((n) => ({ ...n, at: n.at + 2 * BAR }))],
    a2: [...m1.notes, ...m2b.notes.map((n) => ({ ...n, at: n.at + 2 * BAR }))],
    b: [...m3.notes, ...m3b.notes.map((n) => ({ ...n, at: n.at + 2 * BAR }))],
    end: [{ at: 0, d: 4, dur: 2, vel: 0.6 }, { at: 2, d: 2, dur: 2, vel: 0.55 }, { at: 4, d: 0, dur: 4, vel: 0.7 }],
  };

  const events = [];
  const lead12 = (d) => noteOf(key, mode, d) + 12;
  const low = (d) => noteOf(key, mode, d);
  let barAt = 0;
  for (const sec of sections) {
    sec.chords.forEach((root, i) => {
      const at = barAt + i * BAR;
      for (const c of compBar(comp, root, r, density > 0.55)) events.push({ at: at + c.at, midi: c.d.map(low), dur: c.dur, vel: c.vel, voice: comp });
      const bassNote = noteOf(key, mode, root) - 12;
      if (phase === 'night' || wet || sec.name === 'outro') events.push({ at, midi: [bassNote], dur: BAR, vel: 0.6, voice: 'bass' });
      else {
        events.push({ at, midi: [bassNote], dur: 2, vel: 0.65, voice: 'bass' });
        events.push({ at: at + 2, midi: [noteOf(key, mode, root + 4) - 12], dur: 2, vel: 0.5, voice: 'bass' });
      }
    });
    if (sec.melody) {
      const voice = sec.name === 'B' ? leadB : lead;
      for (const n of melodyOf[sec.melody]) events.push({ at: barAt + n.at, midi: [lead12(n.d)], dur: n.dur, vel: n.vel, voice });
    }
    barAt += sec.chords.length * BAR;
  }
  events.sort((a, b) => a.at - b.at);
  const beats = barAt + 2; // a little tail for the last chord to ring
  return { title: titleFor(r, { phase, season, weather: moment.weather, festival }), phase, mode, key, bpm, beats, level: style.level, events };
}

// The quiet after a tune, in seconds.
export function gapAfter(r = Math.random) {
  return GAP_S[0] + r() * (GAP_S[1] - GAP_S[0]);
}
