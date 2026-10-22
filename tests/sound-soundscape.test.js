import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYERS, LAYER_NAMES, layersFor, transitionCue, cueFor, MOODS, moodFor } from '../src/audio/soundscape.js';

const top = (L) => LAYER_NAMES.filter((k) => L[k] >= 0.5).sort();

test('every layer has a place, and every level is within 0..1', () => {
  for (const name of LAYER_NAMES) assert.ok(['town', 'river', 'sky'].includes(LAYERS[name].place), name);
  for (const night of [false, true]) for (const season of [null, 'spring', 'summer', 'autumn', 'winter', 'bogus'])
    for (const weather of ['clear', 'rain', 'wind', 'snow', 'bogus']) {
      const L = layersFor({ night, season, weather });
      for (const k of LAYER_NAMES) assert.ok(L[k] >= 0 && L[k] <= 1, `${k} ${night} ${season} ${weather}`);
    }
});

test('day and night have distinct soundscapes', () => {
  const day = layersFor({ night: false });
  const night = layersFor({ night: true });
  assert.ok(day.birds > 0.5 && night.birds === 0, 'birds by day only');
  assert.ok(night.crickets > 0.5 && day.crickets === 0, 'crickets at night');
  assert.ok(night.owls > 0.3 && day.owls === 0, 'owls at night');
  assert.ok(night.traffic < day.traffic, 'quieter streets at night');
});

test('summer adds cicadas by day, autumn adds rustle, winter adds hush', () => {
  assert.ok(layersFor({ season: 'summer' }).cicadas > 0.5);
  assert.equal(layersFor({ season: 'spring' }).cicadas, 0);
  assert.ok(layersFor({ season: 'autumn' }).rustle > 0.3);
  assert.ok(layersFor({ season: 'winter' }).hush > 0.2);
  assert.ok(layersFor({ season: 'winter' }).birds < layersFor({ season: 'spring' }).birds);
});

test('weather adds its own sound and mutes the birds', () => {
  const clear = layersFor({ weather: 'clear' });
  const rain = layersFor({ weather: 'rain' });
  assert.ok(rain.rain > 0.5 && clear.rain === 0);
  assert.ok(rain.birds < clear.birds);
  assert.ok(layersFor({ weather: 'wind' }).wind > 0.3);
  assert.ok(layersFor({ weather: 'snow' }).hush > layersFor({ weather: 'clear' }).hush);
});

test('unknown season or weather counts as spring and clear, so nothing breaks before those systems exist', () => {
  assert.deepEqual(layersFor({ season: 'monsoon', weather: 'hail' }), layersFor({ season: 'spring', weather: 'clear' }));
  assert.deepEqual(layersFor({}), layersFor({ night: false, season: null, weather: 'clear' }));
});

test('the bell rings only when the day actually changes', () => {
  assert.equal(transitionCue(false, false), null);
  assert.equal(transitionCue(true, true), null);
  assert.equal(transitionCue(true, false), 'dawn');
  assert.equal(transitionCue(false, true), 'dusk');
  assert.equal(transitionCue(undefined, 1), 'dusk', 'a missing flag counts as day');
});

test('cueFor maps each action event to its own sound, and ignores the rest', () => {
  assert.equal(cueFor({ type: 'placed', id: 'x' }), 'place');
  assert.equal(cueFor({ type: 'bulldozed', id: 'x' }), 'bulldoze');
  assert.equal(cueFor({ type: 'upgraded', id: 'x' }), 'upgrade');
  assert.equal(cueFor({ type: 'roadsChanged', kind: 'draw' }), 'road');
  assert.equal(cueFor({ type: 'roadsChanged', kind: 'undo' }), 'undo');
  assert.equal(cueFor({ type: 'roadsChanged', kind: 'erase' }), 'erase');
  assert.equal(cueFor({ type: 'zonePainted' }), 'zone');
  assert.equal(cueFor({ type: 'zoneCleared' }), 'erase');
  assert.equal(cueFor({ type: 'goalDone' }), 'goal');
  assert.equal(cueFor({ type: 'renewed' }), 'renew');
  assert.equal(cueFor({ type: 'boosted' }), 'charge');
  assert.equal(cueFor({ type: 'toast', text: 'Not enough coins yet' }), 'deny');
  assert.equal(cueFor({ type: 'toast', text: 'Saved' }), null, 'ordinary notes stay quiet');
  assert.equal(cueFor({ type: 'changed' }), null);
  assert.equal(cueFor(null), null);
  assert.equal(cueFor({}), null);
});

test('each day or night mood has chords and a scale, and night is the lower, sparser one', () => {
  for (const m of Object.values(MOODS)) {
    assert.ok(m.chords.length >= 3 && m.chords.every((c) => c.length === 3));
    assert.ok(m.scale.length >= 4);
    assert.ok(m.noteChance > 0 && m.noteChance <= 1);
    assert.ok(m.noteEvery[0] > 0 && m.noteEvery[1] >= m.noteEvery[0]);
  }
  assert.equal(moodFor(true), MOODS.night);
  assert.equal(moodFor(false), MOODS.day);
  assert.ok(MOODS.night.padLevel < MOODS.day.padLevel);
  assert.ok(MOODS.night.noteChance < MOODS.day.noteChance);
});
