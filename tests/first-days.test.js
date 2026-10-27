// Your first days (src/ui/first-days.js): the optional list for new players.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { getLayout } from '../src/world/layout.js';
import { modelById } from '../src/world/models.js';
import { HINTS, STEPS, markSeen, nextPulse, FIRST_KEY, advance, countLine, isComplete, isVeteran, loadFirst, sanitize, saveFirst, stepsDoneIn } from '../src/ui/first-days.js';

const sim = () => createSim({ layout: getLayout(), now: () => Date.UTC(2026, 9, 27, 12) });
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const modelOf = (cat) => { for (const id of ['cottage', 'shop-row', 'cafe', 'green', 'clinic', 'school', 'park']) { const m = modelById(id); if (m && m.cat === cat) return id; } return null; };

test('there are six unique steps, each with words and a known tool', () => {
  assert.equal(STEPS.length, 6);
  assert.equal(new Set(STEPS.map((s) => s.id)).size, 6);
  for (const s of STEPS) assert.ok(s.head && s.text && s.done, s.id);
});

test('the starter village ticks nothing, so a new town sees the whole list', () => {
  const s = sim(), done = stepsDoneIn(s.state, s.grid);
  assert.ok(Object.values(done).every((v) => v === false), JSON.stringify(done));
  assert.equal(isVeteran(done), false);
});

test('a player building ticks its step, and the starter ones do not', () => {
  const s = sim();
  const base = s.state.placed.find((r) => r.starter);
  const park = modelOf('park');
  assert.ok(park, 'a park model exists');
  s.state.placed.push({ ...base, id: 'b2000', model: park, starter: false });
  const done = stepsDoneIn(s.state, s.grid);
  assert.equal(done.park, true);
  assert.equal(done.shop, false);
  assert.equal(isVeteran(done), true);
});

test('an upgraded building ticks the upgrade step', () => {
  const s = sim();
  s.state.levels[s.state.placed[0].id] = 2;
  assert.equal(stepsDoneIn(s.state, s.grid).upgrade, true);
});

test('advance keeps ticked steps ticked and reports only the new ones', () => {
  let data = sanitize({});
  let r = advance(data, { road: true });
  assert.deepEqual(r.fresh.map((x) => x.id), ['road']);
  data = r.data;
  r = advance(data, { road: false, park: true });
  assert.deepEqual(r.fresh.map((x) => x.id), ['park']);
  assert.deepEqual(r.data.done, ['road', 'park']);
  assert.equal(advance(r.data, { road: true, park: true }).fresh.length, 0);
  assert.equal(countLine(r.data), '2 of 6');
  assert.equal(isComplete(r.data), false);
  assert.equal(isComplete(advance(r.data, Object.fromEntries(STEPS.map((x) => [x.id, true]))).data), true);
});

test('stored data is sanitised and storage failures are swallowed', () => {
  assert.deepEqual(sanitize({ done: ['road', 'nope', 'road'], welcomed: 'yes', hidden: true }), { welcomed: false, hidden: true, done: ['road'], seen: [] });
  assert.deepEqual(loadFirst({ getItem() { throw new Error('blocked'); } }), { welcomed: false, hidden: false, done: [], seen: [] });
  assert.doesNotThrow(() => saveFirst({ setItem() { throw new Error('full'); } }, {}));
  const st = mem();
  saveFirst(st, { welcomed: true, hidden: false, done: ['park'], seen: ['road'] });
  assert.ok(st.m.has(FIRST_KEY));
  assert.deepEqual(loadFirst(st), { welcomed: true, hidden: false, done: ['park'], seen: ['road'] });
});

test('the glow points at the next untried tool and moves on', () => {
  let d = sanitize({});
  assert.equal(nextPulse(d), 'roads');
  d = markSeen(d, 'roads');
  assert.equal(nextPulse(d), 'zones');
  d = advance(d, { home: true }).data;
  assert.equal(nextPulse(d), 'build');
  assert.equal(markSeen(d, 'nonsense'), d);
  for (const t of ['build', 'parks', 'services']) d = markSeen(d, t);
  assert.equal(nextPulse(d), null, 'the upgrade step has no tool, so the glow ends');
  assert.equal(nextPulse({ ...sanitize({}), hidden: true }), null);
});

test('the welcome postcard has three short hints', () => {
  assert.equal(HINTS.length, 3);
  for (const h of HINTS) assert.ok(h.head && h.text.length < 120);
});
