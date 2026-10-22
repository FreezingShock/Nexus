import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { getLayout } from '../src/world/layout.js';
import { longDate, pick, quickSkips, shortDate, todayLine, upcoming, yearLine } from '../src/ui/date-text.js';
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

test('quick skips and the date picker only offer days ahead', () => {
  const q = quickSkips(s, 3);
  assert.equal(q[0].day, 1);
  assert.ok(q.every((x) => x.day > s.dayIdx));
  assert.equal(pick(s, 3, 1, 2, 1).ok, false, 'today');
  assert.equal(pick(s, 3, 1, 3, 2).ok, true);
  assert.equal(pick(s, 3, 1, 3, 2).day, 4);
  assert.equal(pick(s, 3, 9, 3, 2).ok, false, 'too far ahead');
  assert.equal(pick(s, 3, 1, 0, 1).ok, false, 'before the town began');
});

test('festivals and skips come out as postcard notes', () => {
  const n = noteFor({ type: 'holiday', title: 'Blossom Fair', text: 'Petals.' });
  assert.equal(n.title, 'Blossom Fair');
  assert.equal(noteFor({ type: 'skipped', text: '3 days slip by.' }).title, 'Days drift by');
});
