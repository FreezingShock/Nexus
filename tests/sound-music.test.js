// The tune composer (src/audio/composer.js): pure note events, checked in node. What the tunes sound like is listened
// to on localhost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { composeTune, phaseOf, STYLES, SEASON_COLOUR, VOICES, MODES, noteOf, hzOf, gapAfter, GAP_S, rng } from '../src/audio/composer.js';
import { playingLine } from '../src/ui/sound-settings.js';

const MOMENTS = [];
for (const hour of [6, 12, 18, 23]) for (const season of ['spring', 'summer', 'autumn', 'winter', undefined])
  for (const weather of ['clear', 'rain', 'snow']) for (const festival of [false, true])
    MOMENTS.push({ hour, night: hour === 23, season, weather, festival });

test('the time of day sets the tune character, and night always wins', () => {
  assert.equal(phaseOf(6, false), 'dawn');
  assert.equal(phaseOf(12, false), 'day');
  assert.equal(phaseOf(19, false), 'dusk');
  assert.equal(phaseOf(12, true), 'night');
  assert.equal(phaseOf(undefined, false), 'day');
  assert.equal(phaseOf(30, false), 'dawn', 'hours wrap');
});

test('every style and season names only instruments the engine has, and modes that exist', () => {
  for (const s of Object.values(STYLES)) {
    for (const v of [s.lead, s.comp, s.bass]) assert.ok(VOICES.includes(v), v);
    for (const m of s.modes) assert.ok(MODES[m], m);
    for (const p of [...s.progs, ...s.alt]) assert.equal(p.length, 4);
    assert.ok(s.bpm[0] <= s.bpm[1] && s.level > 0 && s.level <= 1);
  }
  for (const c of Object.values(SEASON_COLOUR)) assert.ok(VOICES.includes(c.voice));
});

test('a tune is well formed for every moment: sorted events in range, a title, a sensible length', () => {
  let seed = 1;
  for (const m of MOMENTS) for (let i = 0; i < 6; i++) {
    const t = composeTune(seed++ * 7919, m);
    assert.ok(t.title && typeof t.title === 'string');
    assert.ok(t.bpm >= 40 && t.bpm <= 120, `bpm ${t.bpm}`);
    const seconds = t.beats * 60 / t.bpm;
    assert.ok(seconds > 35 && seconds < 130, `length ${seconds}`);
    let last = -1;
    for (const e of t.events) {
      assert.ok(e.at >= last && e.at < t.beats, 'sorted, inside the tune');
      last = e.at;
      assert.ok(VOICES.includes(e.voice), e.voice);
      assert.ok(e.dur > 0 && e.vel > 0 && e.vel <= 1);
      for (const n of e.midi) assert.ok(n >= 24 && n <= 100, `note ${n}`);
    }
    for (const v of ['bass']) assert.ok(t.events.some((e) => e.voice === v));
  }
});

test('a seed always writes the same tune, and different seeds write different ones', () => {
  const m = { hour: 12, season: 'spring', weather: 'clear' };
  assert.deepEqual(composeTune(42, m), composeTune(42, m));
  const titles = new Set(), melodies = new Set();
  for (let s = 1; s < 40; s++) {
    const t = composeTune(s * 104729, m);
    titles.add(t.title);
    melodies.add(t.events.filter((e) => e.voice === STYLES.day.lead).map((e) => e.midi[0]).join(','));
  }
  assert.ok(titles.size > 10, 'many titles');
  assert.ok(melodies.size > 30, 'many melodies');
});

test('the melody ends at home: the last melody note is the key note', () => {
  for (let s = 1; s < 30; s++) {
    const t = composeTune(s * 31337, { hour: 12, season: 'autumn' });
    const mel = t.events.filter((e) => e.voice === STYLES.day.lead || e.voice === SEASON_COLOUR.autumn.voice).filter((e) => e.midi.length === 1 && e.midi[0] > t.key + 6);
    const lastNote = mel[mel.length - 1].midi[0];
    assert.equal((lastNote - t.key) % 12, 0, `ends on ${lastNote} in key ${t.key}`);
  }
});

test('night tunes are slower and quieter than day tunes; rain slows the music and festivals quicken it', () => {
  const avg = (m, f) => { let x = 0; for (let s = 1; s <= 40; s++) x += f(composeTune(s * 7, m)); return x / 40; };
  assert.ok(avg({ hour: 0, night: true }, (t) => t.bpm) < avg({ hour: 12 }, (t) => t.bpm));
  assert.ok(composeTune(3, { hour: 0, night: true }).level < composeTune(3, { hour: 12 }).level);
  assert.ok(avg({ hour: 12, weather: 'rain' }, (t) => t.bpm) < avg({ hour: 12 }, (t) => t.bpm));
  assert.ok(avg({ hour: 12, festival: true }, (t) => t.bpm) > avg({ hour: 12 }, (t) => t.bpm));
  assert.equal(composeTune(5, { hour: 12, weather: 'rain' }).events.some((e) => e.voice === 'harp'), false, 'rain trades the harp for a pad');
});

test('notes and pitches: degrees climb the scale, and A4 is 440 Hz', () => {
  assert.equal(noteOf(60, 'ionian', 0), 60);
  assert.equal(noteOf(60, 'ionian', 2), 64);
  assert.equal(noteOf(60, 'aeolian', 2), 63);
  assert.equal(noteOf(60, 'ionian', 7), 72);
  assert.equal(noteOf(60, 'ionian', -1), 59);
  assert.equal(hzOf(69), 440);
  const r = rng(9); const a = r.next(); assert.ok(a >= 0 && a < 1);
});

test('the quiet between tunes is a long breath of town sound', () => {
  assert.equal(gapAfter(() => 0), GAP_S[0]);
  assert.equal(gapAfter(() => 1), GAP_S[1]);
  assert.ok(GAP_S[0] >= 30, 'long enough to hear the town');
});

test('the now-playing line names the tune or the quiet between tunes, and escapes the title', () => {
  assert.match(playingLine('Lantern Walk'), /Now playing: <b>Lantern Walk<\/b>/);
  assert.match(playingLine(null), /Between tunes/);
  assert.ok(!playingLine('<i>').includes('<i>'));
});
