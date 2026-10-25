import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_CHIMES, CLOSE_CHIME, pagePlan, createPageSounds } from '../src/audio/page-sounds.js';
import { ROWS } from '../src/ui/title.js';

test('every page has its own chime, and closing rustles the other way', () => {
  for (const r of ROWS) assert.ok(PAGE_CHIMES[r.id], r.id);
  const tunes = Object.values(PAGE_CHIMES).map((n) => JSON.stringify(n));
  assert.equal(new Set(tunes).size, tunes.length, 'no two pages share a chime');
  for (const notes of Object.values(PAGE_CHIMES)) for (const [f, at] of notes) assert.ok(f > 200 && f < 2000 && at >= 0 && at < 0.5);
  assert.deepEqual(pagePlan('changes'), { rustle: 'open', notes: PAGE_CHIMES.changes });
  assert.deepEqual(pagePlan('changes', true), { rustle: 'close', notes: CLOSE_CHIME });
  assert.equal(pagePlan('nope').notes, PAGE_CHIMES.howto);
});

test('without Web Audio, or while muted, nothing is made and nothing throws', () => {
  const s = createPageSounds({ getSettings: () => null, win: {} });
  s.open('howto'); s.close(); s.hover(); s.dispose();
  let made = 0;
  const win = { AudioContext: function () { made++; throw new Error('no'); } };
  const muted = createPageSounds({ getSettings: () => ({ master: 1, effects: 1, muted: true }), win });
  muted.open('howto');
  assert.equal(made, 0, 'muted never starts a context');
  const on = createPageSounds({ getSettings: () => ({ master: 1, effects: 1, muted: false }), win });
  on.open('howto');
  assert.equal(made, 1, 'a failing context is tried and survived');
});
