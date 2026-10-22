// The Web Audio engine: buses, ambience layers, one-shot cues and the music. Browser only, and entirely procedural: no
// audio files are fetched, so nothing leaves the page after load. Nothing is created until unlock() runs from a user
// gesture (browsers block audio before one). Without Web Audio the engine does nothing, and the game carries on.
import { BUSES, busGain } from './mix.js';
import { LAYERS, LAYER_NAMES, moodFor } from './soundscape.js';

const TICK_MS = 150;       // the scheduler wakes this often
const LOOK_AHEAD = 0.35;   // seconds of music scheduled ahead of the clock
const CHORD_S = 6.5;       // one chord every this many seconds
const REVERB_S = 2.4;      // length of the generated room
const PAD_LEVEL = 0.12;    // total loudness of a chord before the mood's padLevel
const TRIM = { murmur: 0.5, traffic: 0.55, water: 0.7, wind: 0.8, rain: 0.45, hush: 0.5, rustle: 0.25, birds: 1, owls: 1, crickets: 1, cicadas: 1 };

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

export function createEngine({ win = globalThis } = {}) {
  const AC = win.AudioContext || win.webkitAudioContext;
  const off = () => ({
    unlock: () => false, apply() {}, setLevels() {}, setSources() {}, setNight() {}, cue() {}, setActive() {}, stop() {},
    get ready() { return false; },
  });
  if (!AC) return off();

  let ctx = null, buses = null, reverb = null, noiseBuf = null, timer = null;
  let settings = null, night = false, levels = {}, sources = { town: 1, river: 1 };
  const layerInput = {}, layerOut = {}, layerPlace = {};
  let nextChord = 0, nextNote = 0, nextBird = 0, nextOwl = 0, nextLeaf = 0, chordIndex = 0;
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
      default: break; // birds and owls are event-driven
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
      layerOut[name].gain.setTargetAtTime((levels[name] || 0) * spatial, t, 0.8);
    }
  }

  // ---- one-shots ----
  const dest = (name) => (name ? layerInput[name] : buses.effects);
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

  const CUES = {
    hover: (t) => blip(t, 1400, 0.02, 0.018),
    select: (t) => blip(t, 620, 0.04, 0.05, 'triangle', 820),
    open: (t) => blip(t, 440, 0.12, 0.045, 'triangle', 660),
    close: (t) => blip(t, 660, 0.1, 0.04, 'triangle', 440),
    tool: (t) => blip(t, 740, 0.05, 0.05, 'sine', 980),
    place: (t) => { blip(t, 190, 0.12, 0.16, 'sine', 120); noiseBurst(t, 'lowpass', 900, 0.06, 0.15); },
    road: (t) => { sweep(t, 'bandpass', 300, 1200, 0.28, 0.12); blip(t + 0.26, 900, 0.04, 0.05); },
    undo: (t) => sweep(t, 'bandpass', 1500, 400, 0.22, 0.1),
    zone: (t) => sweep(t, 'bandpass', 1800, 2400, 0.35, 0.08),
    erase: (t) => sweep(t, 'lowpass', 900, 200, 0.2, 0.1),
    bulldoze: (t) => { blip(t, 110, 0.3, 0.2, 'sine', 50); noiseBurst(t, 'lowpass', 400, 0.25, 0.2); },
    upgrade: (t) => [523.25, 659.25, 783.99].forEach((f, i) => blip(t + i * 0.09, f, 0.32, 0.09, 'triangle')),
    goal: (t) => [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => bell(t + i * 0.12, f, 1.4, 0.14)),
    renew: (t) => [523.25, 783.99, 1046.5].forEach((f, i) => bell(t + i * 0.14, f, 2.8, 0.18)),
    charge: (t) => { sweep(t, 'lowpass', 300, 2600, 0.7, 0.12); blip(t, 260, 0.7, 0.04, 'sine', 620); },
    postcard: (t) => { noiseBurst(t, 'highpass', 3000, 0.22, 0.07); blip(t + 0.3, 120, 0.05, 0.16); },
    deny: (t) => blip(t, 220, 0.1, 0.03, 'sine', 180),
    dusk: (t) => bell(t, 329.63, 2.2, 0.16),
    dawn: (t) => { rooster(t); bell(t + 1.1, 659.25, 2.4, 0.14); },
  };

  // ---- ambient events ----
  function chirp(t) {
    const d = dest('birds'), base = rand(2200, 3600), n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) blip(t + i * 0.09, base * rand(0.95, 1.1), 0.07, 0.035, 'sine', base * rand(1.2, 1.6), d);
  }
  function hoot(t) {
    const d = dest('owls');
    blip(t, 420, 0.7, 0.06, 'sine', 400, d);
    blip(t + 0.9, 360, 1.0, 0.05, 'sine', 340, d);
  }
  function leaf(t) { noiseBurst(t, 'bandpass', rand(3500, 5000), 0.03, 0.05, dest('rustle')); }

  // ---- music ----
  function scheduleChord(t) {
    const mood = moodFor(night);
    const chord = mood.chords[chordIndex++ % mood.chords.length];
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1100;
    lp.connect(buses.music);
    const peak = (PAD_LEVEL * mood.padLevel) / chord.length;
    for (const f of chord) {
      for (const [type, mul] of [['sine', 1], ['triangle', 1.004]]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.value = f * mul;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak * (type === 'sine' ? 1 : 0.4), t + 1.8);
        g.gain.setValueAtTime(peak * (type === 'sine' ? 1 : 0.4), t + CHORD_S);
        g.gain.exponentialRampToValueAtTime(0.0001, t + CHORD_S + 2.5);
        o.connect(g); g.connect(lp);
        o.start(t); o.stop(t + CHORD_S + 2.6);
      }
    }
  }
  function scheduleNote(t) {
    const mood = moodFor(night);
    if (Math.random() > mood.noteChance) return;
    const c = ctx, o = c.createOscillator(), g = c.createGain(), w = c.createGain();
    o.type = 'sine';
    o.frequency.value = pick(mood.scale);
    env(g, t, 0.07, 0.01, night ? 2.8 : 2.0);
    o.connect(g); g.connect(buses.music);
    w.gain.value = 0.5; g.connect(w); w.connect(reverb);
    o.start(t); o.stop(t + 3.2);
  }

  // ---- scheduler ----
  function tick() {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (levels.birds > 0.05 && t >= nextBird) { chirp(t); nextBird = t + rand(1.2, 4.0) / Math.max(0.35, levels.birds); }
    if (levels.owls > 0.05 && t >= nextOwl) { hoot(t); nextOwl = t + rand(22, 40); }
    if (levels.rustle > 0.05 && t >= nextLeaf) { leaf(t); nextLeaf = t + rand(0.4, 1.6); }
    while (t + LOOK_AHEAD >= nextChord) { scheduleChord(nextChord); nextChord += CHORD_S; }
    while (t + LOOK_AHEAD >= nextNote) {
      scheduleNote(nextNote);
      const m = moodFor(night);
      nextNote += rand(m.noteEvery[0], m.noteEvery[1]);
    }
  }

  // Starts the scheduler once. A second unlock only resumes the context, so the music clock is never reset under playing chords.
  function start() {
    if (timer) return;
    const t = ctx.currentTime;
    nextChord = t + 0.2; nextNote = t + 1.5; nextBird = t + 0.4; nextOwl = t + 6; nextLeaf = t + 0.5;
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
    // Plays a named cue once. Repeats of the same cue within 50 ms are dropped, so fast hover or drag stays clean.
    cue(name) {
      if (!ctx || ctx.state !== 'running' || !CUES[name]) return;
      const t = ctx.currentTime;
      if (lastCue[name] !== undefined && t - lastCue[name] < 0.05) return;
      lastCue[name] = t;
      CUES[name](t);
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
