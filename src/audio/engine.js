// The Web Audio engine: buses, ambience layers, one-shot cues and the music. Browser only, and entirely procedural: no
// audio files are fetched, so nothing leaves the page after load. Nothing is created until unlock() runs from a user
// gesture (browsers block audio before one). Without Web Audio the engine does nothing, and the game carries on.
import { BUSES, busGain } from './mix.js';
import { LAYERS, LAYER_NAMES } from './soundscape.js';
import { composeTune, gapAfter, hzOf, FIRST_TUNE_S, REGREET_S } from './composer.js';
import { setNowPlaying, setMusicCommand } from './cuehub.js';

const TICK_MS = 150;       // the scheduler wakes this often
const LOOK_AHEAD = 0.35;   // seconds of music scheduled ahead of the clock
const REVERB_S = 2.4;      // length of the generated room
const MUSIC_WET = 0.35;    // how much of the music goes to its room
const MUSIC_TONE = 2600;   // the music's soft lowpass, so nothing in a tune is ever sharp
// Cozy and low: each layer's trim sits well under 1, so the bed of sound stays under the music and the clicks.
const TRIM = { murmur: 0.35, traffic: 0.3, water: 0.3, wind: 0.45, rain: 0.35, hush: 0.4, rustle: 0.2, birds: 0.7, owls: 0.8, crickets: 0.7, cicadas: 0.6,
  dogs: 0.7, cuckoo: 0.8, frogs: 0.7, thunder: 0.9, hearth: 0.5 };
const WATER_CAP = 0.3;     // the river is never loud; distance decides how close it comes (attenuation.js)
const MIN_GAP = { hover: 0.11, tick: 0.05, 'road-grow': 0.055, click: 0.04, select: 0.04, note: 2, arrive: 4, sparkle: 0.25, market: 8, festival: 8, firework: 0.18, 'firework-launch': 0.35 }; // seconds between repeats
const DRIFT_S = [6, 14];   // each layer wanders between these gaps, so the bed never settles into a loop
const BIRD_PATTERNS = [[0, 0.09], [0, 0.09, 0.2], [0, 0.07, 0.14, 0.26], [0, 0.12]];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

export function createEngine({ win = globalThis } = {}) {
  const AC = win.AudioContext || win.webkitAudioContext;
  const off = () => ({
    unlock: () => false, apply() {}, setLevels() {}, setSources() {}, setNight() {}, setMoment() {}, nextTune() {}, cue() {},
    setActive() {}, stop() {}, get playing() { return null; },
    get ready() { return false; },
  });
  if (!AC) return off();

  let ctx = null, buses = null, reverb = null, noiseBuf = null, timer = null;
  let musicIn = null, musicVerb = null;
  let settings = null, night = false, levels = {}, sources = { town: 1, river: 1 };
  const layerInput = {}, layerOut = {}, layerPlace = {}, drift = {};
  let nextDrift = 0;
  let nextBird = 0, nextOwl = 0, nextLeaf = 0;
  const nextAt = { dogs: 0, cuckoo: 0, frogs: 0, thunder: 0, hearth: 0 };
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
    reverb = c.createConvolver();
    reverb.buffer = room(c, REVERB_S);
    reverb.connect(buses.effects);
    noiseBuf = noise(c, 3);
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
    out.connect(buses.ambience);
    layerOut[name] = out;
    layerPlace[name] = LAYERS[name].place;
    // Sustained layers are built here; chirps, hoots and leaves are scheduled into `inp` by tick().
    layerInput[name] = inp;
    switch (name) {
      case 'murmur': filtered(inp, 'bandpass', 700, 0.5, { depth: 120, rate: 0.13 }); break;
      case 'traffic': filtered(inp, 'lowpass', 520, 0.7, { depth: 150, rate: 0.21 }); break;
      case 'water': filtered(inp, 'bandpass', 1600, 0.8, { depth: 300, rate: 0.09 }); break;
      case 'wind': filtered(inp, 'lowpass', 700, 0.3, { depth: 300, rate: 0.05 }); break;
      case 'rain': filtered(inp, 'highpass', 2400, 0.4); break;
      case 'hush': filtered(inp, 'lowpass', 300, 0.2); break;
      case 'rustle': filtered(inp, 'bandpass', 3000, 1.2); break;
      case 'crickets': tone(inp, 4200, 0.035, { depth: 0.025, rate: 7.5 }); tone(inp, 4480, 0.02, { depth: 0.015, rate: 6.2 }); break;
      case 'cicadas': tone(inp, 5200, 0.02, { depth: 0.015, rate: 23 }); break;
      case 'hearth': filtered(inp, 'lowpass', 240, 0.4, { depth: 60, rate: 0.3 }); break; // the fire's low breath; pops are scheduled
      default: break; // birds, owls, dogs, cuckoo, frogs and thunder are event-driven
    }
  }
  function filtered(dest, type, freq, q, wob) {
    const c = ctx;
    const src = c.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    src.connect(f); f.connect(dest);
    if (wob) wobble(c, f.frequency, wob.depth, wob.rate);
    src.start(ctx.currentTime, Math.random() * 2);
  }

  function tone(dest, freq, peak, wob) {
    const c = ctx;
    const o = c.createOscillator();
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = peak;
    o.connect(g); g.connect(dest);
    if (wob) wobble(c, g.gain, wob.depth, wob.rate);
    o.start();
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
  // Each layer fades toward its level times its spatial gain. Sky layers (rain, wind, hush) ignore distance.
  function refreshLayers() {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const name of LAYER_NAMES) {
      const place = layerPlace[name];
      const spatial = place === 'sky' ? 1 : (sources[place] ?? 1);
      const cap = name === 'water' ? WATER_CAP : 1;
      const wander = drift[name] ?? 1;
      layerOut[name].gain.setTargetAtTime(Math.min(cap, (levels[name] || 0) * spatial * wander), t, 0.8);
    }
  }

  // ---- one-shots ----
  const dest = (name) => (name ? layerInput[name] : buses.effects);
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
    o.connect(g); g.connect(to || buses.effects);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function bell(t, f, dur, peak, wet = 0.6, to = null) {
    const parts = [[1, 1], [2.76, 0.35], [5.4, 0.12]];
    for (const [ratio, p] of parts) {
      const c = ctx, o = c.createOscillator(), g = c.createGain();
      o.frequency.value = f * ratio;
      env(g, t, peak * p, 0.004, dur * (p === 1 ? 1 : 0.5));
      o.connect(g); g.connect(to || buses.effects);
      if (wet) { const w = c.createGain(); w.gain.value = wet; g.connect(w); w.connect(reverb); }
      o.start(t); o.stop(t + dur + 0.1);
    }
  }
  function noiseBurst(t, type, freq, dur, peak, to = null) {
    const c = ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf;
    f.type = type; f.frequency.value = freq; f.Q.value = 0.9;
    env(g, t, peak, 0.004, dur);
    src.connect(f); f.connect(g); g.connect(to || buses.effects);
    src.start(t, Math.random() * 2, dur + 0.05);
  }
  function sweep(t, type, f0, f1, dur, peak, to = null) {
    const c = ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf;
    f.type = type; f.Q.value = 1.1;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.linearRampToValueAtTime(f1, t + dur);
    env(g, t, peak, dur * 0.3, dur * 0.7);
    src.connect(f); f.connect(g); g.connect(to || buses.effects);
    src.start(t, Math.random() * 2, dur + 0.05);
  }
  function rooster(t) {
    const c = ctx, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(560, t);
    o.frequency.linearRampToValueAtTime(980, t + 0.35);
    o.frequency.linearRampToValueAtTime(820, t + 0.7);
    o.frequency.linearRampToValueAtTime(640, t + 1.0);
    f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 1.4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.08);
    g.gain.setValueAtTime(0.09, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
    o.connect(f); f.connect(g); g.connect(buses.effects);
    o.start(t); o.stop(t + 1.1);
  }

  // Every cue takes (t, opts). opts.n is a count where it makes sense (tiles in a road or zone).
  const CUES = {
    // Soft and short: a glance sound, never a chatter.
    hover: (t) => { blip(t, 1750, 0.016, 0.012, 'sine', 1900); blip(t, 3500, 0.01, 0.003, 'sine'); },
    tick: (t) => blip(t, 1000, 0.02, 0.02, 'sine'),
    note: (t) => blip(t, 880, 0.12, 0.03, 'sine', 990),
    select: (t) => blip(t, 620, 0.04, 0.045, 'triangle', 820),
    open: (t) => blip(t, 440, 0.12, 0.04, 'triangle', 660),
    close: (t) => blip(t, 660, 0.1, 0.035, 'triangle', 440),
    tool: (t) => blip(t, 740, 0.05, 0.045, 'sine', 980),
    // Tactile: a crisp click, with a soft thock under it for buildings.
    click: (t) => { blip(t, 1900, 0.02, 0.05, 'sine', 1300); noiseBurst(t, 'highpass', 3200, 0.012, 0.03); },
    place: (t) => { CUES.click(t); blip(t + 0.005, 150, 0.14, 0.1, 'sine', 110); },
    // One tick per tile as a road grows in the preview, climbing a little as the route gets longer.
    'road-grow': (t, o) => { const f = 520 * Math.pow(2, (Math.min(o.n || 1, 30) / 30) * 0.9); blip(t, f, 0.035, 0.025, 'triangle', f * 1.015); },
    // A road built: one rising tick per tile, staggered, then a click to finish. Capped so long roads stay short.
    road: (t, o) => {
      const n = Math.max(1, Math.min(o.n || 1, 14)), gap = Math.max(0.03, 0.4 / n);
      for (let i = 0; i < n; i++) blip(t + i * gap, 440 * Math.pow(2, i * 0.1), 0.05, 0.03, 'triangle');
      CUES.click(t + n * gap);
    },
    undo: (t) => sweep(t, 'bandpass', 1500, 400, 0.22, 0.1),
    // Zones: a soft brush swish with a click per painted tile, capped.
    zone: (t, o) => {
      sweep(t, 'bandpass', 1800, 2400, 0.35, 0.05);
      const n = Math.max(1, Math.min(o.n || 1, 10));
      for (let i = 0; i < n; i++) CUES.click(t + i * 0.05);
    },
    erase: (t) => sweep(t, 'lowpass', 900, 200, 0.2, 0.1),
    bulldoze: (t) => { blip(t, 110, 0.3, 0.2, 'sine', 50); noiseBurst(t, 'lowpass', 400, 0.25, 0.2); },
    upgrade: (t) => [523.25, 659.25, 783.99].forEach((f, i) => blip(t + i * 0.09, f, 0.32, 0.09, 'triangle')),
    goal: (t) => [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => bell(t + i * 0.12, f, 1.4, 0.14)),
    renew: (t) => [523.25, 783.99, 1046.5].forEach((f, i) => bell(t + i * 0.14, f, 2.8, 0.18)),
    charge: (t) => { sweep(t, 'lowpass', 300, 2600, 0.7, 0.12); blip(t, 260, 0.7, 0.04, 'sine', 620); },
    postcard: (t) => { noiseBurst(t, 'highpass', 3000, 0.22, 0.07); blip(t + 0.3, 120, 0.05, 0.16); },
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
    deny: (t) => blip(t, 220, 0.1, 0.03, 'sine', 180),
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
      f.type = 'bandpass'; f.frequency.value = 1100 * pitch; f.Q.value = 1.6;
      env(g, at, 0.05, 0.008, 0.1);
      o.connect(f); f.connect(g); g.connect(d);
      o.start(at); o.stop(at + 0.15);
      noiseBurst(at, 'bandpass', 1500, 0.05, 0.015, d);
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
    g.gain.exponentialRampToValueAtTime(0.16, t + rand(0.2, 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f); f.connect(g); g.connect(d);
    src.start(t, Math.random() * 2); src.stop(t + len + 0.1);
    if (Math.random() < 0.3) noiseBurst(t, 'lowpass', 1200, 0.35, 0.05, d);
  }
  // A fire in a hearth: tiny sparks over the low breath built in buildLayer.
  function crackle(t) { noiseBurst(t, 'highpass', rand(1800, 4200), rand(0.006, 0.02), rand(0.01, 0.045), dest('hearth')); }
  // How often each scheduled creature sounds at full level, in seconds (a quieter level spaces them out).
  const EVERY = {
    dogs: [[20, 55], bark], cuckoo: [[25, 60], cuckoo], frogs: [[1.2, 4.5], croak], thunder: [[30, 80], thunder],
    hearth: [[0.08, 0.7], crackle],
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
  };
  const PEAK = { piano: 0.075, harp: 0.045, musicbox: 0.05, flute: 0.05, pad: 0.03, bass: 0.07 };

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
    if (levels.birds > 0.05 && t >= nextBird) { chirp(t); nextBird = t + rand(4, 9) / Math.max(0.35, levels.birds); }
    if (levels.owls > 0.05 && t >= nextOwl) { hoot(t); nextOwl = t + rand(30, 60); }
    if (levels.rustle > 0.05 && t >= nextLeaf) { leaf(t); nextLeaf = t + rand(0.4, 1.6); }
    for (const [name, [[lo, hi], play]] of Object.entries(EVERY)) {
      const lv = (levels[name] || 0) * (layerPlace[name] === 'sky' ? 1 : (sources[layerPlace[name]] ?? 1));
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
          build(settings || { master: 0.8, music: 0.5, effects: 0.7, ambience: 0.6, muted: false });
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
    // Ambience levels for the moment (soundscape.layersFor) and the spatial gains (attenuation.sourceGains).
    setLevels(l) { levels = { ...l }; refreshLayers(); },
    setSources(g) { sources = { ...sources, ...g }; refreshLayers(); },
    setNight(on) { night = !!on; },
    // What the next tune is written for: { hour, night, season, weather, festival }. When day turns to night (or back)
    // during a gap, the next tune comes sooner, to greet the change.
    setMoment(m) {
      moment = { ...m };
      const n = !!m.night;
      if (ctx && !tune && momentNight !== null && n !== momentNight) {
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
