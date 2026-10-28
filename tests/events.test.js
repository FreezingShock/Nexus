// Seasonal events (src/core/events.js): Fourth of July, Halloween and Christmas build up across their month.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS, eventLine, eventOn, nextEventStart } from '../src/core/events.js';
import { HOLIDAYS, holidayOn } from '../src/core/holidays.js';
import { dayOfDate } from '../src/core/calendar.js';
import { createSim } from '../src/sim/sim.js';
import { getLayout } from '../src/world/layout.js';
import { eventInfo, yearRibbon } from '../src/ui/date-text.js';
import { iconFor } from '../src/ui/holiday-icons.js';
import { noteFor } from '../src/ui/notes.js';

test('every event builds to a real holiday inside its months, with lights and an icon', () => {
  for (const e of EVENTS) {
    const h = HOLIDAYS.find((x) => x.id === e.peak);
    assert.ok(h && e.months.includes(h.month), e.id);
    assert.ok(e.lights.length >= 2 && e.start && /^#[0-9A-F]{6}$/i.test(e.accent));
    assert.ok(iconFor(e.id), e.id + ' has a glyph');
  }
  for (const h of HOLIDAYS) assert.ok(iconFor(h.id), h.id + ' has a glyph');
});

test('decorations go up day by day and are all up by the holiday, for every month length', () => {
  for (const md of [2, 3, 4]) {
    for (const e of EVENTS) {
      const first = dayOfDate(2, e.months[0], 1, md);
      const days = Array.from({ length: md }, (_, i) => eventOn(first + i, md, [e.id]));
      assert.ok(days.every((d) => d && d.id === e.id), e.id + ' covers its month');
      assert.equal(days[0].day, 0);
      for (let i = 1; i < md; i++) assert.ok(days[i].cover >= days[i - 1].cover, 'cover never drops');
      const peak = days.find((d) => d.peak && !d.fireworks) || days.find((d) => d.peak);
      assert.equal(holidayOn(first + peak.day, md).id, e.peak, e.id + ' peaks on its holiday (md ' + md + ')');
      assert.equal(peak.cover, 1);
      assert.equal(eventOn(first - 1, md, [e.id])?.id === e.id, false, 'not before its month');
      assert.equal(eventOn(first + md, md, [e.id])?.id === e.id, false, 'and over after it');
    }
  }
});

test('fireworks on the Fourth and on New Year\'s Eve, not on Halloween', () => {
  const md = 3;
  const on = (m, at) => eventOn(dayOfDate(1, m, at, md) < 0 ? dayOfDate(2, m, at, md) : dayOfDate(1, m, at, md), md);
  assert.equal(on(6, 2).fireworks, true);
  assert.equal(on(11, 3).fireworks, true, "New Year's Eve");
  assert.equal(on(11, 2).fireworks, false, 'Christmas Day is calm');
  assert.equal(on(9, 3).fireworks, false);
  assert.equal(on(9, 3).peak, true);
});

test('the sim keeps the event on state and raises a postcard as the decorations start', () => {
  const sim = createSim({ layout: getLayout(), now: () => 1e12 });
  const events = [];
  sim.subscribe((e) => events.push(e));
  assert.equal(sim.state.event, '');
  const july1 = dayOfDate(1, 6, 1, 3);
  sim.skipToDay(july1);
  assert.equal(sim.state.event, 'july4');
  assert.ok(events.some((e) => e.type === 'eventStart' && e.id === 'july4'), JSON.stringify(events.map((e) => e.type)));
  assert.ok(sim.state.eventCover > 0 && sim.state.eventCover < 1);
  assert.equal(sim.state.eventPeak, 0);
  sim.skipToDay(july1 + 1);
  assert.equal(sim.state.eventPeak, 1);
  assert.equal(sim.state.fireworks, 1);
  assert.equal(sim.state.eventCover, 1);
  sim.skipToDay(july1 + 3);
  assert.equal(sim.state.event, '');
  const n = noteFor({ type: 'eventStart', title: 'Christmas season', text: 'Lights.', tint: '#C2483A' });
  assert.equal(n.title, 'Christmas season');
});

test('the calendar words: the season under way, the next one, and the ribbon', () => {
  assert.equal(nextEventStart(0, 3).id, 'july4');
  const info = eventInfo({ dayIdx: 0 }, 3);
  assert.equal(info.now, false);
  assert.match(info.line, /Fourth of July season in \d+ days/);
  const xmas = dayOfDate(1, 11, 1, 3);
  const now = eventInfo({ dayIdx: xmas }, 3);
  assert.equal(now.now, true);
  assert.equal(now.line, 'Christmas season · tomorrow');
  assert.equal(eventLine(eventOn(xmas + 1, 3)), 'Christmas!');
  const r = yearRibbon({ month: 2 }, 3);
  assert.equal(r[11].event, 'christmas');
  assert.equal(r[9].holiday, 'halloween');
  assert.equal(r[3].event, '');
});

test('Snoopy Days is on by default, can be switched off, and builds to the Blossom Fair', async () => {
  const md = 3, first = dayOfDate(2, 3, 1, md);
  assert.equal(eventOn(first, md)?.id, undefined, 'eventOn without a town list runs only the regular events');
  assert.equal(eventOn(first, md, ['snoopy']).id, 'snoopy');
  assert.equal(yearRibbon({ month: 0, festive: { optIn: [] } }, md)[3].event, '');
  assert.equal(yearRibbon({ month: 0, festive: { optIn: ['snoopy'] } }, md)[3].event, 'snoopy');
  const sim = createSim({ layout: getLayout() });
  assert.deepEqual(sim.state.festive.optIn, ['snoopy'], 'a new town has it on');
  sim.dispatch({ type: 'setEventOptIn', event: 'snoopy', on: false });
  assert.deepEqual(sim.state.festive.optIn, []);
  sim.dispatch({ type: 'setEventOptIn', event: 'nope', on: true });
  assert.deepEqual(sim.state.festive.optIn, []);
  sim.dispatch({ type: 'setEventOptIn', event: 'snoopy', on: true });
  assert.deepEqual(sim.state.festive.optIn, ['snoopy']);
  sim.skipToDay(first + 1);
  assert.equal(sim.state.event, 'snoopy');
  sim.dispatch({ type: 'setEventOptIn', event: 'snoopy', on: false });
  assert.deepEqual(sim.state.festive.optIn, []);
  const { sanitizeFestive } = await import('../src/core/festive.js');
  assert.deepEqual(sanitizeFestive({ optIn: ['snoopy', 'christmas', 7] }).optIn, ['snoopy']);
  // saves from before it existed, and dev saves that never got it offered, arrive with it on
  assert.deepEqual(sanitizeFestive({ amount: 'all' }).optIn, ['snoopy']);
  assert.deepEqual(sanitizeFestive({ optIn: [] }).optIn, ['snoopy']);
  // a town that switched it off keeps it off
  assert.deepEqual(sanitizeFestive({ optIn: [], offered: ['snoopy'] }).optIn, []);
  assert.deepEqual(sanitizeFestive({ optIn: [], offered: ['snoopy', 'junk'] }).offered, ['snoopy']);
});
