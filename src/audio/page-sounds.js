// Sounds for the notebook pages, on the title screen and in the town. The game's sound engine only starts with the town
// (after Play), so the pages keep this tiny one of their own: a paper rustle when a page turns, and a short chime that is
// different for each page. Procedural Web Audio, no files. The AudioContext is made on the first page opened (a click, so
// browsers allow it); the title's is closed when the title goes. It follows the player's sound settings: muted is silent, the effects volume sets the level.
import { busGain } from './mix.js';

// Each page's chime: notes in Hz with their start in seconds. Kept small and in one warm key (C major, pentatonic-ish).
export const PAGE_CHIMES = {
  howto: [[523.25, 0], [659.25, 0.09], [783.99, 0.18]],             // a rising "let's go"
  changes: [[783.99, 0], [987.77, 0.08], [1174.66, 0.16], [1567.98, 0.26]], // sparkly: something new
  credits: [[392, 0], [523.25, 0.12], [659.25, 0.24]],              // warm and low, a thank-you
  settings: [[587.33, 0], [783.99, 0.1]],                           // two tidy clicks of a dial
  profile: [[659.25, 0], [783.99, 0.1], [1046.5, 0.2]],             // a proud little fanfare
  pass: [[880, 0], [1108.73, 0.1], [1318.51, 0.2], [1760, 0.32]],   // a lantern lighting
  new: [[440, 0], [392, 0.12]],                                     // a gentle "are you sure?"
  // the town's pages (src/ui/book.js)
  goals: [[523.25, 0], [659.25, 0.1], [783.99, 0.2], [1046.5, 0.3]], // a pennant going up
  milestones: [[659.25, 0], [830.61, 0.09], [987.77, 0.18]],          // a small medal ring
  sky: [[880, 0], [783.99, 0.12], [1046.5, 0.24]],                     // a breeze changing
  paint: [[587.33, 0], [698.46, 0.08], [880, 0.16]],                   // a brush stroke
  shortcuts: [[987.77, 0], [987.77, 0.1]],                             // two key taps
  journal: [[440, 0], [554.37, 0.1], [659.25, 0.2], [554.37, 0.32]],      // a pen scratch and a soft close
  mytown: [[392, 0], [493.88, 0.1], [587.33, 0.2], [783.99, 0.32]],     // a little town bell
};
export const CLOSE_CHIME = [[659.25, 0], [523.25, 0.08]];

// The plan for one sound, without Web Audio: the rustle's direction and the notes. Tested in node.
export function pagePlan(name, closing = false) {
  return { rustle: closing ? 'close' : 'open', notes: closing ? CLOSE_CHIME : (PAGE_CHIMES[name] || PAGE_CHIMES.howto) };
}

export function createPageSounds({ getSettings, win = globalThis } = {}) {
  const AC = win.AudioContext || win.webkitAudioContext;
  let ctx = null, out = null, noiseBuf = null;
  const level = () => busGain(getSettings ? getSettings() : null, 'effects');

  function start() {
    if (ctx || !AC) return !!ctx;
    try {
      ctx = new AC();
      out = ctx.createGain();
      out.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch { ctx = null; }
    return !!ctx;
  }

  // A page turning: filtered noise that sweeps up as it opens and down as it closes.
  function rustle(t, dir) {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf;
    f.type = 'bandpass'; f.Q.value = 0.9;
    const [a, b] = dir === 'close' ? [3600, 1400] : [1400, 3800];
    f.frequency.setValueAtTime(a, t); f.frequency.exponentialRampToValueAtTime(b, t + 0.28);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t); src.stop(t + 0.35);
  }
  // A soft bell: a sine with a quieter octave above it, fading slowly.
  function bell(t, freq) {
    for (const [mul, peak] of [[1, 0.07], [2, 0.018]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq * mul;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + 0.95);
    }
  }

  function play(name, closing = false) {
    const v = level();
    if (!(v > 0) || !start()) return;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      out.gain.value = v;
      const t = ctx.currentTime + 0.02, plan = pagePlan(name, closing);
      rustle(t, plan.rustle);
      for (const [f, at] of plan.notes) bell(t + 0.12 + at, f);
    } catch { /* sound is a nicety; the page opens anyway */ }
  }

  return {
    open: (name) => play(name, false),
    close: () => play(null, true),
    // A tiny tick when the pointer comes onto a row of the card.
    hover() {
      const v = level();
      if (!(v > 0) || !ctx) return; // never the first sound: a hover is not a gesture that may start audio
      try {
        const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
        out.gain.value = v;
        o.type = 'sine'; o.frequency.setValueAtTime(1750, t); o.frequency.exponentialRampToValueAtTime(1950, t + 0.02);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.014, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.04);
      } catch { /* nothing */ }
    },
    dispose() { if (ctx) { try { ctx.close(); } catch { /* already closed */ } ctx = null; } },
  };
}
