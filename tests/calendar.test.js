import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CALENDAR_KEY, DAY_LENGTHS, DEFAULTS, SEASONS, SOUND_WEATHER, WEATHER, atmosphereTargets, clockText,
  createCalendarStore, dayLengthS, hourOf, lightAt, nextSeed, pickWeather, sanitizeCalendar, seasonIndexOf,
  seasonLengthS, unitOf, weatherSpanS, yearOf,
} from '../src/core/calendar.js';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { sanitize } from '../src/sim/save.js';
import { getLayout } from '../src/world/layout.js';
import { offlineWindow } from '../src/sim/offline.js';

const layout = getLayout();
const normal = { ...DEFAULTS };          // a 2-minute day, 3-day months
const DAY = DAY_LENGTHS.normal, SEASON = seasonLengthS(DEFAULTS); // the default season, whatever it is

test('the clock starts at eight in the morning and wraps every in-game day', () => {
  assert.equal(hourOf(0, DAY), 8);
  assert.ok(Math.abs(hourOf(DAY / 3, DAY) - 16) < 1e-9);
  assert.ok(Math.abs(hourOf(DAY, DAY) - 8) < 1e-9);
  assert.equal(hourOf(-50, DAY), 8, 'a negative clock counts as zero');
});

test('noon is full daylight, midnight is full night, and dawn and dusk are warm', () => {
  const noon = lightAt(12), midnight = lightAt(0), dawn = lightAt(6), dusk = lightAt(18);
  assert.equal(noon.night, 0);
  assert.equal(noon.daylight, 1);
  assert.equal(midnight.night, 1);
  assert.equal(midnight.daylight, 0);
  assert.ok(dawn.warm > 0.9 && dusk.warm > 0.9, 'the warm tint peaks at sunrise and sunset');
  assert.ok(lightAt(10).warm < 0.2, 'the middle of the day is not warm');
  // The sun arcs: it rises in the east (negative x here) and sets in the west.
  assert.ok(lightAt(7).dir[0] < 0 && lightAt(17).dir[0] > 0);
});

test('after dark the light comes from the moon side of the sky', () => {
  const day = lightAt(12).dir, night = lightAt(0).dir;
  assert.ok(day[1] > 0, 'the sun is up at noon');
  assert.ok(night[1] > 0, 'the moon is up at midnight');
  assert.ok(night[1] > 0.9, 'at midnight the moon is nearly overhead');
});

test('seasons and years follow the season length, and a season is four to a year', () => {
  assert.equal(seasonIndexOf(0, SEASON), 0);
  assert.equal(seasonIndexOf(SEASON, SEASON), 1);
  assert.equal(seasonIndexOf(3 * SEASON + 1, SEASON), 3);
  assert.equal(seasonIndexOf(4 * SEASON, SEASON), 0, 'winter is followed by spring');
  assert.equal(yearOf(4 * SEASON - 1, SEASON), 0);
  assert.equal(yearOf(4 * SEASON, SEASON), 1);
  assert.equal(seasonLengthS({ ...normal, seasonLength: 'short' }), DAY * 6);
  assert.equal(seasonLengthS({ ...normal, seasonLength: 'long' }), DAY * 12);
  assert.equal(dayLengthS({ ...normal, dayLength: 'quick' }), DAY_LENGTHS.quick);
});

test('weather rolls are seeded, in range, and season-shaped', () => {
  const s1 = nextSeed(7), s2 = nextSeed(7);
  assert.equal(s1, s2, 'the same seed gives the same roll');
  for (let i = 0, seed = 1; i < 200; i++) {
    seed = nextSeed(seed);
    const u = unitOf(seed);
    assert.ok(u >= 0 && u < 1);
    const span = weatherSpanS(u);
    assert.ok(span >= 90 && span <= 240, 'a roll lasts 1.5 to 4 minutes of clock');
  }
  assert.equal(pickWeather(0, 0), 'clear');
  assert.equal(pickWeather(0.9999, 0), 'fog', 'the last kind in the spring table');
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(pickWeather(i / 500, 3));
  assert.ok(seen.has('snow') && !seen.has('leaves'), 'winter snows and never drops leaves');
  const autumn = new Set();
  for (let i = 0; i < 500; i++) autumn.add(pickWeather(i / 500, 2));
  assert.ok(autumn.has('leaves') && !autumn.has('snow'), 'autumn drops leaves and never snows');
});

test('every weather maps to one of the sound layer names', () => {
  const allowed = new Set(['clear', 'rain', 'wind', 'snow']);
  for (const k of WEATHER) assert.ok(allowed.has(SOUND_WEATHER[k]), k);
  assert.equal(SOUND_WEATHER.leaves, 'wind');
  assert.equal(SOUND_WEATHER.cloudy, 'clear');
});

test('atmosphere targets: winter lies white, spring blossoms, summer is the plain look', () => {
  const winter = atmosphereTargets({ hour: 12, weather: 'clear', season: 'winter' });
  assert.ok(winter.cover >= 0.9, 'snow lies in winter');
  assert.equal(atmosphereTargets({ hour: 12, weather: 'clear', season: 'spring' }).blossom > 0, true);
  const summer = atmosphereTargets({ hour: 12, weather: 'clear', season: 'summer' });
  assert.equal(summer.cover, 0);
  assert.equal(summer.blossom, 0);
  assert.equal(summer.petals, 0);
  assert.equal(atmosphereTargets({ hour: 12, weather: 'snow', season: 'autumn' }).cover, 1, 'snowfall covers the town in any season');
  const rain = atmosphereTargets({ hour: 12, weather: 'rain', season: 'autumn' });
  assert.ok(rain.rain === 1 && rain.wet === 1 && rain.cloud > 0.5);
  assert.equal(atmosphereTargets({ hour: 12, weather: 'clear', season: 2 }).foliage, atmosphereTargets({ hour: 12, weather: 'clear', season: 'autumn' }).foliage, 'season may be an index');
});

test('the clock reads as hours and minutes', () => {
  assert.equal(clockText(8.5), '08:30');
  assert.equal(clockText(0), '00:00');
  assert.equal(clockText(23.999), '00:00', 'rounds up to the next day');
});

test('calendar choices: hostile values fall back to the defaults', () => {
  assert.deepEqual(sanitizeCalendar(null), DEFAULTS);
  assert.deepEqual(sanitizeCalendar({ timeLock: 'noon', season: 'monsoon', weather: 3, dayLength: 'quick' }), { ...DEFAULTS, dayLength: 'quick' });
});

function memStore({ broken = false } = {}) {
  const m = new Map();
  return {
    m,
    getItem: (k) => { if (broken) throw new Error('denied'); return m.get(k) ?? null; },
    setItem: (k, v) => { if (broken) throw new Error('quota'); m.set(k, v); },
  };
}

test('the calendar store keeps choices per browser and ignores bad input', () => {
  const st = memStore();
  const seen = [];
  const store = createCalendarStore({ storage: st, onChange: (o) => seen.push(o) });
  assert.equal(store.set('timeLock', 'night'), true);
  assert.equal(store.set('timeLock', 'noon'), false, 'unknown values are refused');
  assert.equal(store.set('nope', 'x'), false);
  assert.equal(store.get().timeLock, 'night');
  assert.equal(seen.length, 1);
  assert.equal(JSON.parse(st.m.get(CALENDAR_KEY)).options.timeLock, 'night');
  const again = createCalendarStore({ storage: st });
  assert.equal(again.get().timeLock, 'night', 'the choice survives a reload');
});

test('the calendar store never throws when storage is broken', () => {
  const store = createCalendarStore({ storage: memStore({ broken: true }) });
  assert.equal(store.set('season', 'winter'), true, 'the choice still applies for this visit');
  assert.equal(store.get().season, 'winter');
  assert.equal(createCalendarStore({ storage: memStore({ broken: true }) }).get().season, 'auto');
});

test('the sim keeps a clock: ticks advance it, and the derived sky follows it', () => {
  const sim = createSim({ layout, now: () => 1e12 });
  const start = sim.state.clockS;
  sim.tick(); sim.tick(); sim.tick();
  assert.equal(sim.state.clockS, start + 3);
  assert.equal(sim.state.hour, hourOf(sim.state.clockS, DAY), 'the hour is worked out from the clock');
  assert.ok(['spring', 'summer', 'autumn', 'winter'].includes(sim.state.season));
  assert.ok(['clear', 'rain', 'wind', 'snow'].includes(sim.state.weather));
  assert.ok(WEATHER.includes(sim.state.weatherKind));
  assert.ok([0, 1].includes(sim.state.night));
});

test('locks change what is shown and never stop the clock', () => {
  const sim = createSim({ layout, now: () => 1e12 });
  sim.setCalendar({ ...DEFAULTS, timeLock: 'night', season: 'winter', weather: 'fog' });
  assert.equal(sim.state.night, 1);
  assert.equal(sim.state.hour, 0);
  assert.equal(sim.state.season, 'winter');
  assert.equal(sim.state.weatherKind, 'fog');
  const before = sim.state.clockS;
  sim.tick();
  assert.equal(sim.state.clockS, before + 1, 'the clock keeps going under a lock');
  sim.setCalendar({ ...DEFAULTS, timeLock: 'day' });
  assert.equal(sim.state.hour, 12);
  assert.equal(sim.state.night, 0);
  sim.setCalendar(DEFAULTS);
  assert.equal(sim.state.season, ['spring', 'summer', 'autumn', 'winter'][seasonIndexOf(sim.state.clockS, SEASON)], 'the real season comes back when the lock lifts');
});

test('a snowfall in a new winter raises the first-snow event once', () => {
  const sim = createSim({ layout, now: () => 1e12 });
  const events = [];
  sim.subscribe((e) => events.push(e));
  const snowSeed = () => { let c = 1; while (pickWeather(unitOf(nextSeed(c)), 3) !== 'snow') c++; return c; };
  const winterStart = 3 * SEASON;
  sim.state.days = winterStart / DAY + 0.1; // December
  sim.state.clockS = winterStart;
  sim.state.weatherSeed = snowSeed();
  sim.state.weatherUntil = winterStart;
  sim.tick(); // the roll is due: it snows, and this is the first snow of the year
  assert.equal(sim.state.weatherRoll, 'snow');
  assert.equal(events.filter((e) => e.type === 'firstSnow').length, 1);
  assert.equal(sim.state.snowYear, 0);
  sim.state.weatherSeed = snowSeed();
  sim.state.weatherUntil = sim.state.clockS;
  sim.tick(); // snow again in the same winter: no second event
  assert.equal(events.filter((e) => e.type === 'firstSnow').length, 1);
});

test('time passed away moves the clock in closed form, never tick by tick', () => {
  const NOW = 1e12, away = 3 * 3600;
  const sim = createSim({ layout, now: () => NOW });
  const before = sim.state.clockS;
  sim.catchUp(NOW - away * 1000);
  const eff = offlineWindow(away).effectiveS;
  assert.equal(sim.state.clockS, before + eff);
});

test('the calendar fields are derived: a save keeps the roll, not the sky', () => {
  const f = freshState();
  const s = sanitize({ ...f, clockS: 500, weatherRoll: 'rain', season: 'winter', hour: 3, weather: 'snow', weatherKind: 'snow', night: 1 });
  assert.equal(s.weatherRoll, 'rain');
  assert.equal(s.clockS, 500);
  assert.equal(s.season, 'spring', 'the season is recomputed on load, not read from the save');
  assert.equal(s.hour, 8);
  assert.equal(s.night, 0);
});
