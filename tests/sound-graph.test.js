// Drives the engine's graph code against a stub AudioContext, so typos in the build, cue and scheduler paths show up in
// node. It checks that the calls are made, not what they sound like; that part is listened to on localhost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/audio/engine.js';
import { DEFAULTS } from '../src/audio/mix.js';
import { nowPlaying, musicCommand } from '../src/audio/cuehub.js';

class Node {
  constructor() { this.connections = []; }
  connect(n) { this.connections.push(n); return n; }
}
const param = (v = 0) => ({
  value: v, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {},
});
const audioNode = (extra = {}) => Object.assign(new Node(), { gain: param(1), frequency: param(0), Q: param(1), start() {}, stop() {} }, extra);

function stubContext() {
  const calls = { oscillators: 0, sources: 0 };
  const ctx = {
    currentTime: 0, sampleRate: 4000, state: 'running', destination: new Node(),
    createGain: () => audioNode(),
    createOscillator: () => { calls.oscillators++; return audioNode({ type: 'sine' }); },
    createBiquadFilter: () => audioNode({ type: 'lowpass' }),
    createBufferSource: () => { calls.sources++; return audioNode({ loop: false, buffer: null }); },
    createConvolver: () => audioNode({ buffer: null }),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
    resume() { this.state = 'running'; return Promise.resolve(); },
    suspend() { this.state = 'suspended'; return Promise.resolve(); },
  };
  return { ctx, calls };
}

function engineWith(stub) {
  return createEngine({ win: { AudioContext: class { constructor() { return stub.ctx; } } } });
}

const CUE_NAMES = ['hover', 'select', 'open', 'close', 'tool', 'place', 'road', 'undo', 'zone', 'erase', 'bulldoze',
  'upgrade', 'goal', 'renew', 'charge', 'postcard', 'deny', 'dusk', 'dawn', 'market', 'festival', 'click', 'tick', 'note', 'road-grow', 'road', 'zone', 'burst', 'coin', 'part'];

test('unlock builds the graph once, and every cue plays without throwing', () => {
  const stub = stubContext();
  const engine = engineWith(stub);
  engine.apply(DEFAULTS);
  assert.equal(engine.unlock(), true);
  assert.equal(engine.ready, true);
  assert.ok(stub.calls.oscillators > 0, 'layers and music create oscillators');
  stub.ctx.currentTime = 1;
  for (const name of CUE_NAMES) engine.cue(name, { n: 5 });
  engine.cue('road', { n: 40 }); // a long road is capped, not scheduled 40 times
  assert.equal(engine.cue('no-such-cue'), undefined);
  engine.stop();
});

test('a repeat unlock resumes the context but does not rebuild it', () => {
  const stub = stubContext();
  const engine = engineWith(stub);
  engine.unlock();
  const before = stub.calls.oscillators;
  stub.ctx.state = 'suspended';
  assert.equal(engine.unlock(), true);
  assert.equal(stub.ctx.state, 'running');
  assert.equal(stub.calls.oscillators, before, 'no second graph');
  engine.stop();
});

test('cues are dropped while the context is not running, and repeats within 50 ms are dropped', () => {
  const stub = stubContext();
  const engine = engineWith(stub);
  engine.cue('select'); // before unlock: nothing
  engine.unlock();
  const sources = () => stub.calls.sources;
  stub.ctx.currentTime = 2;
  engine.cue('deny');
  const afterFirst = sources();
  engine.cue('deny');
  assert.equal(sources(), afterFirst, 'the repeat is dropped');
  stub.ctx.currentTime = 3;
  engine.cue('deny');
  assert.ok(sources() >= afterFirst, 'a later cue plays again');
  engine.setActive(false);
  assert.equal(stub.ctx.state, 'suspended');
  engine.setActive(true);
  assert.equal(stub.ctx.state, 'running');
  engine.stop();
});

test('levels and spatial gains apply to every layer without throwing, sky and place alike', () => {
  const stub = stubContext();
  const engine = engineWith(stub);
  engine.unlock();
  engine.setLevels({ birds: 1, murmur: 0.6, rain: 0.8, water: 0.5, crickets: 0.9 });
  engine.setSources({ town: 0.3, river: 0.7 });
  engine.setNight(true);
  engine.setNight(false);
  engine.stop();
});

test('the scheduler plays chords, chirps, hoots and leaves once the clock moves on', async () => {
  const stub = stubContext();
  const engine = engineWith(stub);
  engine.unlock();
  engine.setLevels({ birds: 1, owls: 1, rustle: 1, crickets: 1, cicadas: 1 });
  const before = stub.calls.oscillators + stub.calls.sources;
  stub.ctx.currentTime = 9; // past the first owl and leaf times, so the scheduler fires them
  await new Promise((r) => setTimeout(r, 220)); // one scheduler tick (150 ms)
  assert.ok(stub.calls.oscillators + stub.calls.sources > before, 'something was scheduled');
  engine.setNight(true);
  stub.ctx.currentTime = 20;
  await new Promise((r) => setTimeout(r, 220));
  engine.stop();
});

test('a tune starts a few seconds after unlock, plays its instruments, and Next tune moves on', async () => {
  const stub = stubContext();
  const engine = engineWith(stub);
  engine.unlock();
  engine.setMoment({ hour: 12, night: false, season: 'summer', weather: 'clear' });
  engine.setLevels({ dogs: 1, cuckoo: 1, frogs: 1, thunder: 1, hearth: 1 });
  assert.equal(engine.playing, null, 'quiet at first');
  stub.ctx.currentTime = 30;
  await new Promise((r) => setTimeout(r, 220));
  assert.ok(engine.playing, 'a tune is playing');
  assert.equal(nowPlaying(), engine.playing, 'Settings hears the title');
  const before = stub.calls.oscillators;
  stub.ctx.currentTime = 34;
  await new Promise((r) => setTimeout(r, 220));
  assert.ok(stub.calls.oscillators > before, 'notes were scheduled');
  musicCommand('next');
  assert.equal(engine.playing, null, 'the old tune is let go');
  stub.ctx.currentTime = 37;
  await new Promise((r) => setTimeout(r, 220));
  assert.ok(engine.playing, 'and a new one begins');
  engine.setMoment({ hour: 0, night: true, season: 'winter', weather: 'snow' });
  engine.stop();
});

test('with stereo panners, hearing pans and muffles place layers, and the new creatures play', async () => {
  const stub = stubContext();
  let panners = 0;
  stub.ctx.createStereoPanner = () => { panners++; return audioNode({ pan: param(0) }); };
  const engine = engineWith(stub);
  engine.unlock();
  assert.ok(panners > 0, 'place layers get a panner');
  engine.setLevels({ crickets: 1, farmyard: 1, workshop: 1, drips: 1, rain: 0.7, water: 1 });
  engine.setHearing({ gain: { wild: 1, farm: 1, work: 1, homes: 1, water: 0.5 }, pan: { water: 0.3, farm: -0.2 }, muffle: 0.6 });
  engine.setHearing(null); // ignored
  const before = stub.calls.oscillators + stub.calls.sources;
  stub.ctx.currentTime = 40;
  await new Promise((r) => setTimeout(r, 220));
  assert.ok(stub.calls.oscillators + stub.calls.sources > before, 'drips, crickets and the farmyard were scheduled');
  engine.stop();
});
