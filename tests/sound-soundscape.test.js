import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYERS, LAYER_NAMES, layersFor, transitionCue, cueFor, clockCue, busyness } from '../src/audio/soundscape.js';

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

test('town creatures keep their hours and seasons: dogs by day, cuckoo in spring, frogs on warm nights', () => {
  assert.ok(layersFor({ season: 'spring' }).dogs > 0 && layersFor({ night: true }).dogs === 0);
  assert.ok(layersFor({ season: 'spring' }).cuckoo > layersFor({ season: 'summer' }).cuckoo);
  assert.equal(layersFor({ season: 'autumn' }).cuckoo, 0);
  assert.equal(layersFor({ season: 'spring', night: true }).cuckoo, 0);
  assert.ok(layersFor({ season: 'summer', night: true }).frogs > 0.5);
  assert.equal(layersFor({ season: 'winter', night: true }).frogs, 0);
  assert.equal(LAYERS.frogs.place, 'river', 'frogs are heard from the water');
});

test('rain brings distant thunder (more in summer), and a winter night has a fire in the hearth', () => {
  assert.equal(layersFor({ weather: 'clear' }).thunder, 0);
  assert.ok(layersFor({ weather: 'rain', season: 'summer' }).thunder > layersFor({ weather: 'rain', season: 'autumn' }).thunder);
  assert.equal(LAYERS.thunder.place, 'sky');
  assert.ok(layersFor({ season: 'winter', night: true }).hearth > layersFor({ season: 'winter' }).hearth);
  assert.equal(layersFor({ season: 'summer', night: true }).hearth, 0);
  assert.ok(layersFor({ season: 'autumn', weather: 'snow' }).hearth >= 0.5, 'snow lights the fires');
});

test('market days and festivals liven the streets by day, and a small town hums softer than a big one', () => {
  assert.ok(layersFor({ market: true }).murmur > layersFor({}).murmur);
  assert.ok(layersFor({ festival: true }).murmur > layersFor({}).murmur);
  assert.equal(layersFor({ night: true, market: true }).murmur, layersFor({ night: true }).murmur);
  assert.ok(layersFor({ people: 5 }).murmur < layersFor({ people: 500 }).murmur);
  assert.deepEqual(layersFor({ people: null }), layersFor({}), 'no head-count counts as a full town');
  assert.equal(busyness(0), 0.45);
  assert.equal(busyness(300), 1);
  assert.equal(busyness(1e6), 1);
  assert.ok(busyness(100) > busyness(50));
});

test('the town bells ring on market mornings and festival noons, and not on a jump of the clock', () => {
  assert.equal(clockCue(8.9, 9.05, { market: true }), 'market');
  assert.equal(clockCue(8.9, 9.05, {}), null, 'an ordinary nine is quiet');
  assert.equal(clockCue(11.8, 12.1, { festival: true }), 'festival');
  assert.equal(clockCue(9.05, 9.2, { market: true }), null, 'only the crossing rings');
  assert.equal(clockCue(2, 12, { festival: true }), null, 'a time lock jumping the clock rings nothing');
  assert.equal(clockCue(null, 9.1, { market: true }), null);
  assert.equal(clockCue(23.9, 0.1, { market: true }), null);
});
