import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { getLayout } from '../src/world/layout.js';
import { longDate, monthCells, nextMonthSkip, quickSkips, yearRibbon, shortDate, todayLine, upcoming, yearLine } from '../src/ui/date-text.js';
import { noteFor } from '../src/ui/notes.js';

const sim = createSim({ layout: getLayout(), now: () => 1e12 });
const s = sim.state;

test('the plaque and the hover card read the date in words', () => {
  assert.equal(shortDate(s), 'Mar 1');
  assert.equal(longDate(s), '1 March, Year 1');
  assert.equal(yearLine(s), 'Year 1 · Spring');
  assert.equal(todayLine(s), '');
});

test('upcoming festivals are in order, with distances', () => {
  const up = upcoming(s, 3, 3);
  assert.deepEqual(up.map((u) => u.id), ['blossom', 'midsummer', 'harvest']);
  assert.equal(up[0].inDays, 4);
  assert.ok(up[0].inDays < up[1].inDays);
});

test('quick skips only offer days ahead', () => {
  const q = quickSkips(s, 3);
  assert.equal(q[0].day, 1);
  assert.ok(q.every((x) => x.day > s.dayIdx));
});

test('the month page marks past, today and ahead, with festivals and markets', () => {
  const cells = monthCells(s, 3);
  assert.equal(cells.length, 3);
  assert.deepEqual(cells.map((c) => c.when), ['today', 'ahead', 'ahead']);
  assert.ok(cells[2].market, 'day 3 of March is a market day');
  const april = monthCells({ ...s, dayIdx: 4, dayOfMonth: 2, month: 3 }, 3);
  assert.deepEqual(april.map((c) => c.when), ['past', 'today', 'ahead']);
  assert.equal(april[1].holiday, 'blossom');
});

test('next month skips to its first day, and the ribbon marks this month', () => {
  assert.equal(nextMonthSkip(s, 3).day, 3);
  assert.equal(nextMonthSkip({ ...s, dayIdx: 2, dayOfMonth: 3 }, 3).day, 3);
  const r = yearRibbon(s, 3);
  assert.equal(r.length, 12);
  assert.equal(r.filter((m) => m.current).length, 1);
  assert.equal(r[2].season, 'spring');
  assert.equal(r[3].holiday, 'blossom');
});

test('festivals and skips come out as postcard notes', () => {
  const n = noteFor({ type: 'holiday', title: 'Blossom Fair', text: 'Petals.' });
  assert.equal(n.title, 'Blossom Fair');
  assert.equal(noteFor({ type: 'skipped', text: '3 days slip by.' }).title, 'Days drift by');
});
