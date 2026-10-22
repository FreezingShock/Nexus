import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, MONTH_NAMES, dateOfDay, dawnOfDay, dayIndexOf, dayLengthS, dayOfDate, hourOfDays, monthDaysOf } from '../src/core/calendar.js';
import { HOLIDAYS, holidayOn, holidaysBetween, marketOn, nextHolidayDay } from '../src/core/holidays.js';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { migrations, sanitize, unwrap, wrap } from '../src/sim/save.js';
import { offlineWindow, SKIP_INCOME } from '../src/sim/offline.js';
import { getLayout } from '../src/world/layout.js';

const layout = getLayout();
const DAY = dayLengthS(DEFAULTS), MD = monthDaysOf(DEFAULTS);
const mk = (o = {}) => createSim({ layout, now: () => 1e12, ...o });

test('a new town wakes at eight on the 1st of March, Year 1, in spring', () => {
  const d = dateOfDay(0, MD);
  assert.deepEqual([d.year, MONTH_NAMES[d.month], d.day, d.season], [1, 'March', 1, 0]);
  assert.equal(hourOfDays(0), 8);
  assert.equal(dayIndexOf(0), 0);
});

test('a day turns over at midnight, a month is three days and a year is twelve months', () => {
  assert.equal(dayIndexOf(2 / 3 - 0.001), 0);
  assert.equal(dayIndexOf(2 / 3), 1, 'sixteen hours after eight');
  assert.equal(dateOfDay(3, MD).month, 3, 'April');
  assert.equal(dateOfDay(9, MD).season, 1, 'June is summer');
  assert.equal(dateOfDay(27, MD).season, 3, 'December is winter');
  const jan = dateOfDay(30, MD);
  assert.deepEqual([jan.year, jan.month, jan.day], [2, 0, 1], 'the year turns at January');
  assert.equal(dateOfDay(30, MD).season, 3, 'and winter carries on across it');
  assert.equal(dateOfDay(36, MD).season, 0, 'the next March is spring again');
  assert.equal(dayOfDate(2, 0, 1, MD), 30);
  assert.equal(dayOfDate(1, 0, 1, MD), -1, 'before the town began');
});

test('festivals fall on the right days for every month length', () => {
  for (const md of [2, 3, 4]) {
    for (const h of HOLIDAYS.filter((x) => !x.weather)) {
      let hits = 0;
      for (let d = 0; d < 12 * md * 3; d++) if (holidayOn(d, md)?.id === h.id) hits++;
      assert.equal(hits, 3, h.name + ' comes once a year (md ' + md + ')');
    }
  }
  assert.equal(holidayOn(4, 3).id, 'blossom', 'the middle of April');
  assert.equal(marketOn(0), false);
  assert.equal(marketOn(2), true);
  assert.equal(marketOn(5), true);
});

test('counting festivals between two days matches walking them one by one', () => {
  for (const md of [2, 3, 4]) {
    for (const [a, b] of [[0, 1], [0, 36], [5, 200], [37, 41], [100, 99], [0, 12 * md * 5]]) {
      const walk = new Map();
      let markets = 0;
      for (let d = a + 1; d <= b; d++) {
        const h = holidayOn(d, md);
        if (h) walk.set(h.id, (walk.get(h.id) || 0) + 1);
        if (marketOn(d)) markets++;
      }
      const got = holidaysBetween(a, b, md);
      assert.deepEqual(new Map(got.festivals.map((f) => [f.id, f.count])), walk, 'festivals ' + a + '..' + b + ' md ' + md);
      assert.equal(got.markets, markets, 'markets ' + a + '..' + b + ' md ' + md);
    }
  }
  assert.ok(nextHolidayDay(0, 3) > 0);
});

test('the day turning raises events: a new day, a festival, a market', () => {
  const sim = mk();
  const events = [];
  sim.subscribe((e) => events.push(e));
  sim.state.days = 3 + 2 / 3 - 0.3 / DAY; // just before midnight leading into day number 4 (Blossom Fair, mid April)
  sim.setCalendar(DEFAULTS);
  assert.equal(sim.state.dayIdx, 3);
  for (let i = 0; i < 40 && sim.state.dayIdx < 4; i++) sim.tick();
  assert.equal(sim.state.dayIdx, 4);
  assert.equal(events.filter((e) => e.type === 'newDay').length, 1);
  const f = events.find((e) => e.type === 'holiday');
  assert.equal(f.id, 'blossom');
  assert.equal(f.title, 'Blossom Fair');
  assert.equal(sim.state.holiday, 'blossom');
  assert.equal(sim.state.month, 3);
  assert.equal(sim.state.dayOfMonth, 2);
  sim.state.days = 4 + 2 / 3 - 0.3 / DAY;
  sim.setCalendar(DEFAULTS);
  for (let i = 0; i < 40 && sim.state.dayIdx < 5; i++) sim.tick();
  assert.ok(events.some((e) => e.type === 'market'), 'day 5 is a market day');
});

test('days are saved, and an older save turns its clock into days', () => {
  const sim = mk();
  sim.state.days = 12.5;
  assert.equal(sanitize({ ...freshState(), days: 12.5 }).days, 12.5);
  assert.equal(sanitize({ ...freshState(), days: -3 }).days, 0);
  assert.equal(sanitize({ ...freshState(), days: 'x' }).days, 0);
  const old = { ...freshState(), clockS: 7200 };
  delete old.days;
  const r = unwrap(JSON.stringify({ v: 7, savedAt: 1, state: old }));
  assert.ok(r.ok);
  assert.equal(r.state.days, 10, 'two hours at the old twelve-minute day');
  assert.equal(migrations.length, 7);
  const round = unwrap(JSON.stringify(wrap({ ...freshState(), days: 41.25 }, 5)));
  assert.equal(round.state.days, 41.25);
});

test('skipping jumps to a dawn in closed form and pays a share of the time away', () => {
  const sim = mk();
  const events = [];
  sim.subscribe((e) => events.push(e));
  sim.state.coins = 0;
  const ticks = sim.ticks;
  assert.equal(sim.skipToDay(4), true, 'Blossom Fair morning');
  assert.equal(sim.ticks, ticks, 'one evaluation, never a loop over ticks');
  assert.equal(sim.state.dayIdx, 4);
  assert.ok(Math.abs(sim.state.hour - 6) < 1e-6, 'it lands at dawn');
  assert.ok(Math.abs(sim.state.days - dawnOfDay(4)) < 1e-9);
  assert.equal(sim.state.holiday, 'blossom', 'and the festival opens');
  assert.ok(events.some((e) => e.type === 'holiday' && e.id === 'blossom'));
  const skipped = events.find((e) => e.type === 'skipped');
  assert.equal(skipped.days, 4);
  const secs = (dawnOfDay(4)) * DAY;
  const expect = sim.rate() * offlineWindow(secs).effectiveS * SKIP_INCOME;
  assert.ok(skipped.coins > 0 && Math.abs(skipped.coins - expect) < 1e-6 * Math.max(1, expect));
  assert.ok(Math.abs(sim.state.coins - skipped.coins) < 1e-6);
  assert.ok(Math.abs(sim.state.clockS - secs) < 1e-6, 'the clock is on the target too');
});

test('skipping backwards, to today, or too far does nothing', () => {
  const sim = mk();
  sim.skipToDay(10);
  const days = sim.state.days, coins = sim.state.coins;
  assert.equal(sim.skipToDay(10), false);
  assert.equal(sim.skipToDay(3), false);
  assert.equal(sim.skipToDay(NaN), false);
  assert.equal(sim.skipToDay(10 + 24 * MD + 1), false);
  assert.equal(sim.state.days, days);
  assert.equal(sim.state.coins, coins);
  sim.dispatch({ type: 'skipToDay', day: 12 });
  assert.equal(sim.state.dayIdx, 12, 'the command reaches the same code');
});

test('a skip names the festivals it passed over and counts the market days', () => {
  const sim = mk();
  let ev;
  sim.subscribe((e) => { if (e.type === 'skipped') ev = e; });
  sim.skipToDay(40);
  assert.ok(ev.festivals.some((f) => f.id === 'midsummer'));
  assert.ok(ev.markets >= 10);
  assert.match(ev.text, /Midsummer Fete/);
});

test('time away counts days and reports the festivals it passed', () => {
  const sim = mk();
  const out = sim.catchUp(1e12 - 3 * 3600 * 1000);
  assert.ok(out.days > 0);
  assert.ok(out.festivals.length > 0);
});
