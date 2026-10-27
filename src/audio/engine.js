// The Web Audio engine: buses, ambience layers, one-shot cues and the music. Browser only, and entirely procedural: no
// audio files are fetched, so nothing leaves the page after load. Nothing is created until unlock() runs from a user
// gesture (browsers block audio before one). Without Web Audio the engine does nothing, and the game carries on.
import { BUSES, DEFAULTS, busGain } from './mix.js';
import { LAYERS, LAYER_NAMES, PLACES } from './soundscape.js';
import { composeTune, gapAfter, hzOf, FIRST_TUNE_S, REGREET_S } from './composer.js';
import { setNowPlaying, setMusicCommand } from './cuehub.js';

const TICK_MS = 150;       // the scheduler wakes this often
const LOOK_AHEAD = 0.35;   // seconds of music scheduled ahead of the clock
const REVERB_S = 2.4;      // length of the generated room
const MUSIC_WET = 0.35;    // how much of the music goes to its room
const MUSIC_TONE = 2600;   // the music's soft lowpass, so nothing in a tune is ever sharp
// Cozy and low: each layer's trim sits well under 1, so the bed of sound stays under the music and the clicks.
const TRIM = { murmur: 0.4, traffic: 0.35, water: 0.45, wind: 0.4, rain: 0.5, hush: 0.4, rustle: 0.2, birds: 0.65, owls: 0.7, crickets: 0.6, cicadas: 0.35,
  dogs: 0.5, cuckoo: 0.7, frogs: 0.6, thunder: 0.6, hearth: 0.5, farmyard: 0.6, workshop: 0.45, drips: 0.5 };
const WATER_CAP = 0.45;    // the river is never loud; the camera's distance decides how close it comes (soundmap.js)
// From up high the town is heard through a soft lowpass: clear and close in the streets, a warm muffled hum from afar.
const TOWN_TONE = [7000, 1100]; // cutoff in Hz, right down in the streets and fully zoomed out
const FX_TONE = 4200;      // every effect and click goes through this, so nothing is ever bright or sharp
const MIN_GAP = { hover: 0.11, tick: 0.05, 'road-grow': 0.055, click: 0.04, select: 0.04, note: 2, arrive: 4, sparkle: 0.25, market: 8, festival: 8, firework: 0.18, 'firework-launch': 0.35 }; // seconds between repeats
const DRIFT_S = [6, 14];   // each layer wanders between these gaps, so the bed never settles into a loop
const BIRD_PATTERNS = [[0, 0.09], [0, 0.09, 0.2], [0, 0.07, 0.14, 0.26], [0, 0.12]];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

export function createEngine({ win = globalThis } = {}) {
  const AC = win.AudioContext || win.webkitAudioContext;
  const off = () => ({
    unlock: () => false, apply() {}, setLevels() {}, setSources() {}, setHearing() {}, setNight() {}, setMoment() {}, nextTune() {}, cue() {},
    setActive() {}, stop() {}, get playing() { return null; },
    get ready() { return false; },
  });
  if (!AC) return off();

  let ctx = null, buses = null, reverb = null, noiseBuf = null, pinkBuf = null, timer = null, townTone = null, fx = null;
  let musicIn = null, musicVerb = null;
  let settings = null, night = false, levels = {};
  // What the camera hears of each place (soundmap.hear): a level, a pan and how muffled the town is. Until the first
  // reading every place plays at full level, centred.
  let hearing = { gain: {}, pan: {}, muffle: 0 };
  const layerInput = {}, layerOut = {}, layerPan = {}, layerPlace = {}, drift = {};
  let nextDrift = 0;
  let nextBird = 0, nextOwl = 0, nextLeaf = 0;
  const nextAt = { dogs: 0, cuckoo: 0, frogs: 0, thunder: 0, hearth: 0, crickets: 0, farmyard: 0, workshop: 0, drips: 0 };
  // The music: the tune playing (composer.js), when it began, the next event to schedule, and when the next tune starts.
  let tune = null, tuneAt = 0, tuneIdx = 0, nextTuneAt = 0, moment = {}, momentNight = null;
  const lastCue = {};

  // ---- graph ----
  function build(settingsNow) {
    const c = ctx;
    buses = {};
    for (const b of BUSES) {
      buses[b] = c.createGain();
      buses[b].gain.value = busGain(settingsNow, b);
      buses[b].connect(c.destination);
    }
    fx = c.createBiquadFilter();
    fx.type = 'lowpass'; fx.frequency.value = FX_TONE; fx.Q.value = 0.5;
    fx.connect(buses.effects);
    reverb = c.createConvolver();
    reverb.buffer = room(c, REVERB_S);
    reverb.connect(buses.effects);
    noiseBuf = noise(c, 3);
    pinkBuf = pink(c, 4);
    townTone = c.createBiquadFilter();
    townTone.type = 'lowpass'; townTone.frequency.value = TOWN_TONE[0]; townTone.Q.value = 0.4;
    townTone.connect(buses.ambience);
    // The music has a room of its own on the music bus, so the music slider moves its echo too.
    musicIn = c.createGain();
    const tone = c.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = MUSIC_TONE; tone.Q.value = 0.5;
    musicIn.connect(tone); tone.connect(buses.music);
    musicVerb = c.createConvolver();
    musicVerb.buffer = room(c, REVERB_S + 0.8);
    const wet = c.createGain();
    wet.gain.value = MUSIC_WET;
    tone.connect(wet); wet.connect(musicVerb); musicVerb.connect(buses.music);
    for (const name of LAYER_NAMES) buildLayer(name);
  }

  function buildLayer(name) {
    const c = ctx, trim = TRIM[name] ?? 1;
    const inp = c.createGain();
    inp.gain.value = trim;
    const out = c.createGain();
    out.gain.value = 0;
    inp.connect(out);
    layerPlace[name] = LAYERS[name].place;
    const sky = layerPlace[name] === 'sky';
    // Place-bound layers lean left or right toward where they are, and go through the town's distance tone.
    const panner = !sky && typeof c.createStereoPanner === 'function' ? c.createStereoPanner() : null;
    if (panner) { out.connect(panner); panner.connect(townTone); layerPan[name] = panner; }
    else out.connect(sky ? buses.ambience : townTone);
    layerOut[name] = out;
    // Sustained layers are built here; chirps, hoots and leaves are scheduled into `inp` by tick().
    layerInput[name] = inp;
    switch (name) {
      // Beds of soft (pink) noise: warmer than white noise, so nothing hisses.
      case 'murmur': filtered(inp, 'bandpass', 600, 0.6, { depth: 120, rate: 0.13 }, pinkBuf); break;
      case 'traffic': filtered(inp, 'lowpass', 420, 0.6, { depth: 120, rate: 0.17 }, pinkBuf); break;
      // The river: a low babble and a quieter bright ripple above it, each wandering at its own pace.
      case 'water':
        filtered(inp, 'bandpass', 520, 0.9, { depth: 160, rate: 0.37 }, pinkBuf);
        filtered(inp, 'bandpass', 1300, 1.4, { depth: 400, rate: 0.61 }, pinkBuf, 0.35);
        break;
      case 'wind': filtered(inp, 'lowpass', 600, 0.3, { depth: 260, rate: 0.05 }, pinkBuf); break;
      // Rain: a soft, low wash with a gentle swell, no hiss. The drips near houses are scheduled (layer 'drips').
      case 'rain':
        filtered(inp, 'lowpass', 1500, 0.3, { depth: 300, rate: 0.07 }, pinkBuf);
        filtered(inp, 'bandpass', 3200, 0.5, null, pinkBuf, 0.18);
        break;
      case 'hush': filtered(inp, 'lowpass', 300, 0.2, null, pinkBuf); break;
      case 'rustle': filtered(inp, 'bandpass', 2600, 1.0, null, pinkBuf, 0.6); break;
      // Cicadas: a breathy shimmer in the trees that swells and fades, not a steady whine.
      case 'cicadas': filtered(inp, 'bandpass', 4600, 3, { depth: 300, rate: 0.9 }, noiseBuf, 1, { depth: 0.6, rate: 0.11 }); break;
      case 'hearth': filtered(inp, 'lowpass', 240, 0.4, { depth: 60, rate: 0.3 }, pinkBuf); break; // the fire's low breath; pops are scheduled
      default: break; // birds, owls, crickets, dogs, cuckoo, frogs, farmyard, workshop, drips and thunder are event-driven
    }
  }
  // A looping noise bed through one filter. `wob` wanders the filter; `swell` wanders the level, for beds that breathe.
  function filtered(dest, type, freq, q, wob, buf = noiseBuf, level = 1, swell = null) {
    const c = ctx;
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.value = swell ? level * (1 - swell.depth / 2) : level;
    src.connect(f); f.connect(g); g.connect(dest);
    if (wob) wobble(c, f.frequency, wob.depth, wob.rate);
    if (swell) wobble(c, g.gain, level * swell.depth / 2, swell.rate);
    src.start(ctx.currentTime, Math.random() * 2);
  }

  function wobble(c, param, depth, rate) {
    const lfo = c.createOscillator();
    lfo.frequency.value = rate;
    const amt = c.createGain();
    amt.gain.value = depth;
    lfo.connect(amt); amt.connect(param);
    lfo.start();
  }

  // ---- levels ----
  // How much of a layer the camera hears from where it is. Sky layers (rain, wind, hush, thunder) ignore distance.
  const spatialOf = (name) => {
    const place = layerPlace[name];
    if (place === 'sky') return 1;
    const g = hearing.gain[place];
    return Number.isFinite(g) ? g : 1;
  };
  // Each layer fades toward its level times its spatial gain, and leans toward where its place is.
  function refreshLayers() {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const name of LAYER_NAMES) {
      const cap = name === 'water' ? WATER_CAP : 1;
      const wander = drift[name] ?? 1;
      layerOut[name].gain.setTargetAtTime(Math.min(cap, (levels[name] || 0) * spatialOf(name) * wander), t, 0.8);
      const p = hearing.pan[layerPlace[name]];
      if (layerPan[name]) layerPan[name].pan.setTargetAtTime(Number.isFinite(p) ? p : 0, t, 0.6);
    }
    const m = Number.isFinite(hearing.muffle) ? Math.min(1, Math.max(0, hearing.muffle)) : 0;
    townTone.frequency.setTargetAtTime(TOWN_TONE[0] * Math.pow(TOWN_TONE[1] / TOWN_TONE[0], m), t, 0.5);
  }

  // ---- one-shots ----
  const dest = (name) => (name ? layerInput[name] : fx);
  // Two blips a fraction apart: the common shape of a short sung note.
  const env = (g, t, peak, attack, dur) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  };
  function blip(t, f0, dur, peak, type = 'sine', f1 = f0, to = null) {
    const c = ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, peak, 0.005, dur);
    o.connect(g); g.connect(to || fx);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function bell(t, f, dur, peak, wet = 0.6, to = null) {
    const parts = [[1, 1], [2.76, 0.35], [5.4, 0.12]];
    for (const [ratio, p] of parts) {
      const c = ctx, o = c.createOscillator(), g = c.createGain();
      o.frequency.value = f * ratio;
      env(g, t, peak * p, 0.004, dur * (p === 1 ? 1 : 0.5));
      o.connect(g); g.connect(to || fx);
      if (wet) { const w = c.createGain(); w.gain.value = wet; g.connect(w); w.connect(reverb); }
      o.start(t); o.stop(t + dur + 0.1);
    }
  }
  function noiseBurst(t, type, freq, dur, peak, to = null) {
    const c = ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf;
    f.type = type; f.frequency.value = freq; f.Q.value = 0.9;
    env(g, t, peak, 0.004, dur);
    src.connect(f); f.connect(g); g.connect(to || fx);
    src.start(t, Math.random() * 2, dur + 0.05);
  }
  function sweep(t, type, f0, f1, dur, peak, to = null) {
    const c = ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf;
    f.type = type; f.Q.value = 1.1;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.linearRampToValueAtTime(f1, t + dur);
    env(g, t, peak, dur * 0.3, dur * 0.7);
    src.connect(f); f.connect(g); g.connect(to || fx);
    src.start(t, Math.random() * 2, dur + 0.05);
  }
  function rooster(t) {
    const c = ctx, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(560, t);
    o.frequency.linearRampToValueAtTime(980, t + 0.35);
    o.frequency.linearRampToValueAtTime(820, t + 0.7);
    o.frequency.linearRampToValueAtTime(640, t + 1.0);
    f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.8;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.08);
    g.gain.setValueAtTime(0.045, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
    o.connect(f); f.connect(g); g.connect(fx);
    o.start(t); o.stop(t + 1.1);
  }

  // Every cue takes (t, opts). opts.n is a count where it makes sense (tiles in a road or zone).
  const CUES = {
    // Soft and short, like paper and wood: a hover is barely there, and a click is a small round tap.
    hover: (t) => blip(t, 1250, 0.014, 0.0055, 'sine', 1320),
    tick: (t) => blip(t, 820, 0.018, 0.012, 'sine'),
    note: (t) => blip(t, 784, 0.14, 0.02, 'sine', 880),
    select: (t) => { blip(t, 520, 0.035, 0.026, 'triangle', 600); noiseBurst(t, 'bandpass', 1500, 0.01, 0.01); },
    open: (t) => { blip(t, 392, 0.12, 0.026, 'triangle', 523.25); noiseBurst(t, 'bandpass', 1800, 0.08, 0.008); },
    close: (t) => { blip(t, 523.25, 0.1, 0.022, 'triangle', 392); noiseBurst(t, 'bandpass', 1400, 0.07, 0.007); },
    tool: (t) => blip(t, 587.33, 0.05, 0.028, 'triangle', 698.46),
    // Tactile: a wooden tap, with a soft thock under it for buildings.
    click: (t) => { blip(t, 1050, 0.022, 0.03, 'triangle', 780); noiseBurst(t, 'bandpass', 1900, 0.012, 0.016); },
    place: (t) => { CUES.click(t); blip(t + 0.005, 150, 0.14, 0.075, 'sine', 110); },
    // One tick per tile as a road grows in the preview, climbing a little as the route gets longer.
    'road-grow': (t, o) => { const f = 520 * Math.pow(2, (Math.min(o.n || 1, 30) / 30) * 0.9); blip(t, f, 0.035, 0.017, 'triangle', f * 1.015); },
    // A road built: one rising tick per tile, staggered, then a click to finish. Capped so long roads stay short.
    road: (t, o) => {
      const n = Math.max(1, Math.min(o.n || 1, 14)), gap = Math.max(0.03, 0.4 / n);
      for (let i = 0; i < n; i++) blip(t + i * gap, 440 * Math.pow(2, i * 0.1), 0.05, 0.022, 'triangle');
      CUES.click(t + n * gap);
    },
    undo: (t) => sweep(t, 'bandpass', 1300, 400, 0.22, 0.07),
    // Zones: a soft brush swish with a click per painted tile, capped.
    zone: (t, o) => {
      sweep(t, 'bandpass', 1800, 2400, 0.35, 0.05);
      const n = Math.max(1, Math.min(o.n || 1, 10));
      for (let i = 0; i < n; i++) CUES.click(t + i * 0.05);
    },
    erase: (t) => sweep(t, 'lowpass', 900, 200, 0.2, 0.07),
    bulldoze: (t) => { blip(t, 110, 0.3, 0.13, 'sine', 50); noiseBurst(t, 'lowpass', 400, 0.25, 0.12); },
    upgrade: (t) => [523.25, 659.25, 783.99].forEach((f, i) => blip(t + i * 0.09, f, 0.32, 0.09, 'triangle')),
    goal: (t) => [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => bell(t + i * 0.12, f, 1.4, 0.14)),
    renew: (t) => [523.25, 783.99, 1046.5].forEach((f, i) => bell(t + i * 0.14, f, 2.8, 0.18)),
    charge: (t) => { sweep(t, 'lowpass', 300, 2600, 0.7, 0.12); blip(t, 260, 0.7, 0.04, 'sine', 620); },
    postcard: (t) => { noiseBurst(t, 'highpass', 3000, 0.22, 0.07); blip(t + 0.3, 120, 0.05, 0.16); },
    // Collecting the postcard: a soft pop as the icons burst out, then a clink per coin and a wooden tock per part as
    // they land, each a step higher than the last.
    burst: (t) => { noiseBurst(t, 'bandpass', 1400, 0.12, 0.07); blip(t, 330, 0.14, 0.06, 'sine', 660); },
    coin: (t, o) => { const f = 1318.5 * Math.pow(2, Math.min(o.n || 1, 16) / 24); blip(t, f, 0.09, 0.035, 'triangle', f * 1.02); blip(t + 0.02, f * 2, 0.06, 0.012, 'sine'); },
    part: (t, o) => { const f = 392 * Math.pow(2, Math.min(o.n || 1, 16) / 24); blip(t, f, 0.06, 0.05, 'square', f * 0.9); noiseBurst(t, 'bandpass', 900, 0.03, 0.03); },
    // A family arriving: two soft rising notes. A sparkle: one tiny high twinkle.
    // Fireworks, heard from across town: a thin rising whistle, then a soft low boom and, now and then, a crackle.
    'firework-launch': (t) => { if (Math.random() < 0.5) sweep(t, 'bandpass', 900, 2600, 0.9, 0.012); },
    firework: (t, o) => {
      const n = Math.max(1, Math.min(o.n || 1, 3));
      for (let i = 0; i < n; i++) {
        const tt = t + i * 0.07 + Math.random() * 0.05;
        blip(tt, 95, 0.5, 0.08, 'sine', 38);
        noiseBurst(tt, 'lowpass', 320, 0.45, 0.09);
        if (Math.random() < 0.35) for (let k = 0; k < 6; k++) noiseBurst(tt + 0.35 + Math.random() * 0.5, 'highpass', 3500, 0.01, 0.012);
      }
    },
    arrive: (t) => { bell(t, 659.25, 1.1, 0.07, 0.5); bell(t + 0.16, 987.77, 1.4, 0.06, 0.5); },
    sparkle: (t) => { blip(t, 2093, 0.14, 0.02, 'sine', 2349); blip(t + 0.07, 3135.96, 0.12, 0.014, 'sine'); },
    deny: (t) => blip(t, 220, 0.1, 0.022, 'sine', 180),
    dusk: (t) => bell(t, 329.63, 2.2, 0.16),
    // A market morning: a handbell rung quickly in the square. A festival noon: a peal down the scale, twice.
    market: (t) => { for (let i = 0; i < 8; i++) bell(t + i * 0.16, i % 2 ? 1174.66 : 1318.51, 0.5, 0.05, 0.4); },
    festival: (t) => [1046.5, 987.77, 880, 783.99, 698.46, 659.25].forEach((f, i) => {
      bell(t + i * 0.32, f, 2.2, 0.08); bell(t + 2.4 + i * 0.32, f, 2.2, 0.07);
    }),
    dawn: (t) => { rooster(t); bell(t + 1.1, 659.25, 2.4, 0.14); },
  };

  // ---- ambient events ----
  // A call is one of several patterns at a random pitch; now and then a second bird answers from a little away.
  function chirp(t) {
    const d = dest('birds'), pattern = pick(BIRD_PATTERNS);
    const base = rand(2400, 3600);
    pattern.forEach((off) => blip(t + off, base * rand(0.95, 1.08), 0.07, 0.025, 'sine', base * rand(1.15, 1.5), d));
    if (Math.random() < 0.3) {
      const b2 = base * rand(1.2, 1.4), t2 = t + rand(0.5, 1.2);
      pattern.slice(0, 2).forEach((off) => blip(t2 + off, b2, 0.06, 0.02, 'sine', b2 * 1.25, d));
    }
  }
  function hoot(t) {
    const d = dest('owls');
    blip(t, 420, 0.7, 0.05, 'sine', 400, d);
    blip(t + 0.9, 360, 1.0, 0.04, 'sine', 340, d);
  }
  function leaf(t) { noiseBurst(t, 'bandpass', rand(3500, 5000), 0.03, 0.05, dest('rustle')); }
  // A dog a few gardens away: one to three short barks, each its own pitch drop.
  function bark(t) {
    const d = dest('dogs'), pitch = rand(0.8, 1.25), n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const at = t + i * rand(0.2, 0.3), c = ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(520 * pitch, at);
      o.frequency.exponentialRampToValueAtTime(300 * pitch, at + 0.09);
      f.type = 'bandpass'; f.frequency.value = 900 * pitch; f.Q.value = 2.2;
      env(g, at, 0.032, 0.012, 0.1);
      o.connect(f); f.connect(g); g.connect(d);
      o.start(at); o.stop(at + 0.15);
      noiseBurst(at, 'bandpass', 1200, 0.05, 0.01, d);
    }
  }
  // A cuckoo in the trees: its two falling notes, two to four times.
  function cuckoo(t) {
    const d = dest('cuckoo'), f = rand(640, 760), n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      blip(t + i * 0.8, f, 0.2, 0.03, 'sine', f * 0.98, d);
      blip(t + i * 0.8 + 0.27, f * 0.8, 0.3, 0.026, 'sine', f * 0.79, d);
    }
  }
  // Frogs by the water: a quick train of low pulses, now and then answered by a second frog.
  function croak(t) {
    const d = dest('frogs');
    const voice = (at, f, k) => {
      for (let i = 0; i < k; i++) {
        const c = ctx, o = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain(), s = at + i * 0.055;
        o.type = 'square'; o.frequency.value = f;
        bp.type = 'bandpass'; bp.frequency.value = f * 2.4; bp.Q.value = 2;
        env(g, s, 0.03, 0.004, 0.035);
        o.connect(bp); bp.connect(g); g.connect(d);
        o.start(s); o.stop(s + 0.06);
      }
    };
    voice(t, rand(170, 300), 2 + Math.floor(Math.random() * 4));
    if (Math.random() < 0.35) voice(t + rand(0.4, 0.9), rand(260, 380), 2 + Math.floor(Math.random() * 2));
  }
  // Thunder far off: a slow, low roll, sometimes with a crack in front of it.
  function thunder(t) {
    const d = dest('thunder'), c = ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    const len = rand(3, 5.5);
    src.buffer = noiseBuf; src.loop = true;
    f.type = 'lowpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(320, t);
    f.frequency.exponentialRampToValueAtTime(55, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + rand(0.6, 1.4)); // a slow swell, never a crack in the ears
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f); f.connect(g); g.connect(d);
    src.start(t, Math.random() * 2); src.stop(t + len + 0.1);
    if (Math.random() < 0.2) noiseBurst(t, 'lowpass', 700, 0.5, 0.025, d);
  }
  // A fire in a hearth: tiny sparks over the low breath built in buildLayer.
  function crackle(t) { noiseBurst(t, 'highpass', rand(1800, 4200), rand(0.006, 0.02), rand(0.01, 0.045), dest('hearth')); }
  // Crickets in the grass: a short train of tiny pulses, each cricket at its own pitch, never a steady tone.
  function cricket(t) {
    const d = dest('crickets'), f = rand(3900, 4700), k = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < k; i++) blip(t + i * 0.045, f, 0.022, 0.012, 'sine', f * 0.99, d);
  }
  // The farmyard: now a cow far off, now a few hens, now a sheep. Low and round, heard from the fields.
  function farmyard(t) {
    const d = dest('farmyard'), c = ctx, r = Math.random();
    if (r < 0.35) {
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(), base = rand(110, 140), len = rand(1.1, 1.7);
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * 1.12, t + len * 0.3);
      o.frequency.linearRampToValueAtTime(base * 0.86, t + len);
      f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 2.4;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.25);
      g.gain.setValueAtTime(0.05, t + len * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(f); f.connect(g); g.connect(d);
      o.start(t); o.stop(t + len + 0.05);
    } else if (r < 0.8) {
      const n = 3 + Math.floor(Math.random() * 4), base = rand(650, 900);
      for (let i = 0; i < n; i++) {
        const at = t + i * rand(0.11, 0.2), fq = base * rand(0.92, 1.12);
        blip(at, fq, 0.06, 0.016, 'triangle', fq * 0.8, d);
        noiseBurst(at, 'bandpass', fq * 2, 0.025, 0.006, d);
      }
    } else {
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(), vib = c.createOscillator(), vd = c.createGain();
      const base = rand(330, 420), len = rand(0.6, 0.9);
      o.type = 'sawtooth'; o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 0.94, t + len);
      vib.frequency.value = 7; vd.gain.value = base * 0.03; vib.connect(vd); vd.connect(o.frequency);
      f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2.5;
      env(g, t, 0.03, 0.08, len);
      o.connect(f); f.connect(g); g.connect(d);
      o.start(t); vib.start(t); o.stop(t + len + 0.2); vib.stop(t + len + 0.2);
    }
  }
  // A workshop down the lane: a few unhurried mallet knocks on wood, or a short hand saw.
  function workshop(t) {
    const d = dest('workshop');
    if (Math.random() < 0.7) {
      const n = 2 + Math.floor(Math.random() * 3), gap = rand(0.35, 0.6), f = rand(170, 230);
      for (let i = 0; i < n; i++) {
        blip(t + i * gap, f, 0.08, 0.04, 'sine', f * 0.8, d);
        noiseBurst(t + i * gap, 'bandpass', rand(900, 1300), 0.04, 0.018, d);
      }
    } else {
      for (let i = 0; i < 4; i++) sweep(t + i * 0.42, 'bandpass', i % 2 ? 1800 : 1300, i % 2 ? 1300 : 1800, 0.36, 0.012, d);
    }
  }
  // Rain off the roofs: a single drop on a sill, a gutter or a puddle, each its own small pitch.
  function drip(t) {
    const d = dest('drips'), f = rand(1400, 3200);
    blip(t, f, rand(0.025, 0.05), rand(0.006, 0.016), 'sine', f * rand(0.55, 0.75), d);
    if (Math.random() < 0.25) noiseBurst(t, 'bandpass', rand(1500, 2600), 0.02, 0.006, d);
  }
  // How often each scheduled creature sounds at full level, in seconds (a quieter level spaces them out).
  const EVERY = {
    dogs: [[25, 70], bark], cuckoo: [[30, 70], cuckoo], frogs: [[1.5, 5], croak], thunder: [[40, 100], thunder],
    hearth: [[0.08, 0.7], crackle], crickets: [[0.3, 1.1], cricket], farmyard: [[9, 24], farmyard],
    workshop: [[8, 20], workshop], drips: [[0.06, 0.32], drip],
  };

  // ---- music ----
  // Each instrument plays one note: (t, hz, dur in seconds, peak). They all go into musicIn and the music's own room.
  function partials(t, hz, dur, peak, parts, tau, type = 'sine', release = 0.15) {
    const c = ctx;
    for (const [ratio, amt, decayMul = 1] of parts) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = hz * ratio;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * amt), t + 0.006);
      g.gain.setTargetAtTime(0.0001, t + 0.006, tau * decayMul / 3);
      g.gain.setTargetAtTime(0.0001, t + dur, release);
      o.connect(g); g.connect(musicIn);
      o.start(t); o.stop(t + Math.min(dur + release * 6, tau * decayMul + 0.2) + 0.05);
    }
  }
  const VOICES = {
    // A soft felt piano: a few partials that fade faster as they go up, and low notes that ring longer.
    piano: (t, hz, dur, peak) => partials(t, hz, dur, peak, [[1, 1], [2, 0.35, 0.7], [3, 0.12, 0.5], [4.01, 0.05, 0.4]],
      Math.min(3, Math.max(0.7, 2.4 * Math.sqrt(262 / hz))), 'sine', 0.25),
    // A plucked harp or kalimba: bright for a moment, then a short warm tail.
    harp: (t, hz, dur, peak) => partials(t, hz, dur, peak, [[1, 1], [2, 0.3, 0.5], [3, 0.08, 0.3]], 0.9, 'triangle', 0.3),
    // A music box: a glassy bell, high and sparse, with a lot of room around it.
    musicbox: (t, hz, dur, peak) => partials(t, hz, Math.max(dur, 0.8), peak, [[1, 1], [3.01, 0.22, 0.5], [5.43, 0.06, 0.3]], 1.6, 'sine', 0.6),
    // A wooden flute: a gentle swell, a little vibrato once the note settles, and a breath of noise.
    flute: (t, hz, dur, peak) => {
      const c = ctx, o = c.createOscillator(), g = c.createGain(), vib = c.createOscillator(), vd = c.createGain();
      o.type = 'sine'; o.frequency.value = hz;
      vib.frequency.value = 5; vd.gain.setValueAtTime(0, t); vd.gain.linearRampToValueAtTime(hz * 0.004, t + 0.35);
      vib.connect(vd); vd.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.09);
      g.gain.setValueAtTime(peak, t + Math.max(0.1, dur - 0.05));
      g.gain.setTargetAtTime(0.0001, t + Math.max(0.1, dur - 0.05), 0.12);
      o.connect(g); g.connect(musicIn);
      o.start(t); vib.start(t); o.stop(t + dur + 0.8); vib.stop(t + dur + 0.8);
      noiseBurst(t, 'bandpass', Math.min(6000, hz * 2), Math.min(0.12, dur), peak * 0.08, musicIn);
    },
    // A pad: a slow-swelling chord tone, sine and triangle a hair apart.
    pad: (t, hz, dur, peak) => {
      const c = ctx;
      for (const [type, mul, amt] of [['sine', 1, 1], ['triangle', 1.004, 0.35]]) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.value = hz * mul;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak * amt, t + Math.min(1.5, dur * 0.4));
        g.gain.setValueAtTime(peak * amt, t + dur);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 2);
        o.connect(g); g.connect(musicIn);
        o.start(t); o.stop(t + dur + 2.1);
      }
    },
    // A round upright bass: one plucked triangle with a short glow.
    bass: (t, hz, dur, peak) => partials(t, hz, dur, peak, [[1, 1], [2, 0.18, 0.5]], 1.4, 'triangle', 0.2),
    // Festive percussion (pitch is ignored). Sleigh bells: a shake of bright noise and two tiny bells.
    sleigh: (t, hz, dur, peak) => {
      for (let i = 0; i < 3; i++) noiseBurst(t + i * 0.018, 'highpass', 6500, 0.05, peak * (1 - i * 0.25), musicIn);
      partials(t, 2350, 0.12, peak * 0.35, [[1, 1], [1.51, 0.5]], 0.25, 'sine', 0.1);
    },
    // A hollow wooden block: a short knock with a little pitch.
    block: (t, hz, dur, peak) => { partials(t, 820, 0.05, peak, [[1, 1], [2.7, 0.3, 0.4]], 0.09, 'sine', 0.04); },
    // A brushed snare from the bandstand: a soft burst of mid noise.
    snare: (t, hz, dur, peak) => { noiseBurst(t, 'bandpass', 2400, 0.09, peak, musicIn); partials(t, 190, 0.05, peak * 0.4, [[1, 1]], 0.06, 'triangle', 0.03); },
  };
  const PEAK = { piano: 0.075, harp: 0.045, musicbox: 0.05, flute: 0.05, pad: 0.03, bass: 0.07, sleigh: 0.03, block: 0.06, snare: 0.035 };

  function playEvent(ev, t, spb, level) {
    const play = VOICES[ev.voice];
    if (!play) return;
    const each = (PEAK[ev.voice] * ev.vel * level) / Math.sqrt(ev.midi.length);
    for (const m of ev.midi) play(t, hzOf(m), ev.dur * spb, each);
  }

  function beginTune(t) {
    tune = composeTune(Math.floor(Math.random() * 2 ** 31), moment);
    tuneAt = t + 0.1; tuneIdx = 0;
    setNowPlaying(tune.title);
  }
  function endTune(t, gap = gapAfter()) {
    tune = null;
    nextTuneAt = t + gap;
    setNowPlaying(null);
  }
  function music(t) {
    if (!tune) {
      if (t >= nextTuneAt) beginTune(t);
      if (!tune) return;
    }
    const spb = 60 / tune.bpm;
    while (tuneIdx < tune.events.length && tuneAt + tune.events[tuneIdx].at * spb <= t + LOOK_AHEAD) {
      const ev = tune.events[tuneIdx++];
      playEvent(ev, Math.max(t, tuneAt + ev.at * spb), spb, tune.level);
    }
    if (t >= tuneAt + tune.beats * spb) endTune(t);
  }
  // Skips to a fresh tune: the playing one fades out quickly and the next begins a moment later.
  function skipTune() {
    if (!ctx) return;
    const t = ctx.currentTime;
    musicIn.gain.setTargetAtTime(0, t, 0.25);
    musicIn.gain.setTargetAtTime(1, t + 1.4, 0.05);
    endTune(t, 1.6);
  }

  // ---- scheduler ----
  function tick() {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t >= nextDrift) {
      for (const name of LAYER_NAMES) drift[name] = rand(0.7, 1);
      nextDrift = t + rand(DRIFT_S[0], DRIFT_S[1]);
      refreshLayers();
    }
    const near = (name) => (levels[name] || 0) * spatialOf(name);
    if (near('birds') > 0.05 && t >= nextBird) { chirp(t); nextBird = t + rand(4, 9) / Math.max(0.35, levels.birds); }
    if (near('owls') > 0.05 && t >= nextOwl) { hoot(t); nextOwl = t + rand(30, 60); }
    if (near('rustle') > 0.05 && t >= nextLeaf) { leaf(t); nextLeaf = t + rand(0.4, 1.6); }
    for (const [name, [[lo, hi], play]] of Object.entries(EVERY)) {
      const lv = (levels[name] || 0) * spatialOf(name);
      if (lv > 0.05 && t >= nextAt[name]) { play(t); nextAt[name] = t + rand(lo, hi) / Math.max(0.35, lv); }
      else if (lv <= 0.05 && t >= nextAt[name]) nextAt[name] = t + rand(lo, hi) * 0.5; // first call comes a little after it starts
    }
    music(t);
  }

  // Starts the scheduler once. A second unlock only resumes the context, so the music clock is never reset under playing chords.
  function start() {
    if (timer) return;
    const t = ctx.currentTime;
    nextBird = t + 0.4; nextOwl = t + 8; nextLeaf = t + 0.5; nextDrift = t;
    nextTuneAt = t + FIRST_TUNE_S;
    setMusicCommand((cmd) => { if (cmd === 'next') skipTune(); });
    timer = setInterval(tick, TICK_MS);
  }

  return {
    // Called from a user gesture. Creates the context on first use, resumes it, and starts the music and ambience.
    unlock() {
      try {
        if (!ctx) {
          ctx = new AC();
          build(settings || DEFAULTS);
          refreshLayers();
        }
        if (ctx.state === 'suspended') ctx.resume();
        start();
        return true;
      } catch { return false; }
    },
    get ready() { return !!ctx; },
    // Bus volumes from the sound store. Smooth, so a slider never clicks.
    apply(s) {
      settings = s;
      if (!ctx) return;
      for (const b of BUSES) buses[b].gain.setTargetAtTime(busGain(s, b), ctx.currentTime, 0.05);
    },
    // Ambience levels for the moment (soundscape.layersFor) and what the camera hears of each place (soundmap.hear).
    setLevels(l) { levels = { ...l }; refreshLayers(); },
    setHearing(h) {
      if (!h || typeof h !== 'object') return;
      hearing = { gain: { ...(h.gain || {}) }, pan: { ...(h.pan || {}) }, muffle: h.muffle };
      refreshLayers();
    },
    // The older two-source form ({ town, river }): town covers every place on land, river the water.
    setSources(g) {
      if (!g) return;
      const gain = {};
      for (const p of PLACES) if (p !== 'sky') gain[p] = p === 'water' ? (g.river ?? 1) : (g.town ?? 1);
      hearing = { gain, pan: {}, muffle: 0 };
      refreshLayers();
    },
    setNight(on) { night = !!on; },
    // What the next tune is written for: { hour, night, season, weather, festival }. When day turns to night (or back)
    // during a gap, the next tune comes sooner, to greet the change.
    setMoment(m) {
      const evWas = moment.event || '';
      moment = { ...m };
      const n = !!m.night;
      // a turn of day or night, or a festive season beginning, greets the change with a tune soon
      if (ctx && !tune && ((momentNight !== null && n !== momentNight) || (m.event && m.event !== evWas))) {
        nextTuneAt = Math.min(nextTuneAt, ctx.currentTime + REGREET_S);
      }
      momentNight = n;
    },
    nextTune() { skipTune(); },
    get playing() { return tune ? tune.title : null; },
    // Plays a named cue. Repeats come no faster than MIN_GAP allows, so fast hover, drag or a long road stays clean.
    cue(name, opts = {}) {
      if (!ctx || ctx.state !== 'running' || !CUES[name]) return;
      const t = ctx.currentTime;
      const gap = MIN_GAP[name] ?? 0.05;
      if (lastCue[name] !== undefined && t - lastCue[name] < gap) return;
      lastCue[name] = t;
      CUES[name](t, opts || {});
    },
    // Pauses the whole engine while the tab is hidden, and resumes it when it is shown again.
    setActive(on) {
      if (!ctx) return;
      if (on && ctx.state === 'suspended') ctx.resume();
      else if (!on && ctx.state === 'running') ctx.suspend();
    },
    // Stops the scheduler. The game never needs this; tests use it so the process can exit.
    stop() { if (timer) clearInterval(timer); timer = null; },
  };
}

// A noise buffer of `seconds` length, shared by every noise source.
function noise(c, seconds) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// Soft pink noise (Paul Kellet's filter): even energy per octave, so beds of it sound like rain and wind, not hiss.
// The tail past the loop point is faded into the start, so the loop has no seam to thump.
function pink(c, seconds) {
  const len = Math.floor(c.sampleRate * seconds), fade = Math.floor(c.sampleRate * 0.1);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0), tail = new Float32Array(fade);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len + fade; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    const v = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
    if (i < len) d[i] = v; else tail[i - len] = v;
  }
  for (let i = 0; i < fade; i++) { const k = i / fade; d[i] = d[i] * k + tail[i] * (1 - k); }
  return buf;
}

// A decaying noise impulse: the room that the bells and the music sit in.
function room(c, seconds) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}
