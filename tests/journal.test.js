// The town journal: words (core/journal.js), the sim system that writes them, the page markup and the save shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_ENTRIES, POP_STEPS, awayText, entryFor, groups, hasStoryToday, hash, sanitizeEntries, storyFor } from '../src/core/journal.js';
import { journalHtml } from '../src/ui/journal-view.js';
import { createSim } from '../src/sim/sim.js';
import { sanitize, unwrap, wrap } from '../src/sim/save.js';
import { freshState } from '../src/sim/state.js';
import { SHORTCUT_GROUPS } from '../src/ui/shortcuts.js';
import { PAGE_CHIMES } from '../src/audio/page-sounds.js';
import { MENU_ROWS } from '../src/ui/modules/menu.js';

const WHEN = { d: 12, y: 1, m: 6, n: 15 };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the same key always writes the same words', () => {
  const a = entryFor({ kind: 'holiday', key: 'hol:july4:1', a: { title: 'Fourth of July', text: 'Flags.' } }, WHEN);
  const b = entryFor({ kind: 'holiday', key: 'hol:july4:1', a: { title: 'Fourth of July', text: 'Flags.' } }, WHEN);
  assert.deepEqual(a, b);
  assert.equal(a.k, 'festival');
  assert.ok(a.s && a.s.who && a.s.say);
  assert.deepEqual(storyFor('plain', 'x'), storyFor('plain', 'x'));
  assert.equal(hash('abc'), hash('abc'));
});

test('population steps, away lines and unknown kinds', () => {
  assert.ok(POP_STEPS.includes(100));
  assert.match(entryFor({ kind: 'pop', key: 'pop:100', a: { n: 100 } }, WHEN).t, /hundred/i);
  assert.match(awayText({ days: 3, awayS: 1e5, festivals: [{ name: 'Halloween' }, { name: 'Lantern Night' }] }), /3 days.*Halloween and Lantern Night/);
  assert.equal(entryFor({ kind: 'nope', key: 'k' }, WHEN), null);
});

test('hostile saved entries are clamped and capped', () => {
  const raw = [null, 5, { i: 1 }, { i: 'a', t: 'x', k: 'evil' },
    { i: 'ok', t: '<b>hi</b>', k: 'town', d: -4, y: 'x', m: 99, n: 0, s: { who: 'A', say: 'B' } }];
  const out = sanitizeEntries(raw);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].d, out[0].y, out[0].m, out[0].n], [0, 1, 11, 1]);
  assert.equal(sanitizeEntries(new Array(500).fill({ i: 'a', t: 'x', k: 'town' })).length, MAX_ENTRIES);
  assert.deepEqual(sanitizeEntries('nope'), []);
});

test('the page escapes saved text and groups by month, newest first', () => {
  const es = [
    { i: 'a', d: 1, y: 1, m: 2, n: 1, k: 'town', t: 'old' },
    { i: 'b', d: 40, y: 1, m: 3, n: 2, k: 'story', t: '<script>x</script>', s: { who: '<i>', say: 'hi' } },
  ];
  const html = journalHtml(es);
  assert.ok(!html.includes('<script>') && !html.includes('<i>who') && html.includes('&lt;i&gt;'));
  assert.ok(html.indexOf('Apr') < html.indexOf('Mar'));
  assert.equal(groups(es, 'story').length, 1);
  assert.match(journalHtml([], 'folk'), /No stories yet/);
});

test('a town with no journal gets a first page, then writes events once', () => {
  const sim = createSim();
  const st = sim.state;
  assert.deepEqual(Object.keys(st.journal), ['entries', 'seen']);
  for (let i = 0; i < 6; i++) sim.tick();
  assert.equal(st.journal.entries[0].i, 'start');
  assert.equal(st.journal.entries.filter((e) => e.i === 'start').length, 1);
  st.pop = 120;
  for (let i = 0; i < 6; i++) sim.tick();
  const pops = st.journal.entries.filter((e) => e.i.startsWith('pop:'));
  assert.ok(pops.length <= 1);
});

test('stories are one day in three and stable', () => {
  let n = 0;
  for (let d = 0; d < 300; d++) { if (hasStoryToday(d)) n++; assert.equal(hasStoryToday(d), hasStoryToday(d)); }
  assert.ok(n > 60 && n < 140, String(n));
});

test('the journal survives the save envelope and an old save without one', () => {
  const s = freshState();
  s.journal.entries.push({ i: 'k', d: 1, y: 1, m: 2, n: 1, k: 'town', t: 'hello' });
  s.journal.seen.push('k');
  const back = sanitize(unwrap(JSON.stringify(wrap(s, 1))).state);
  assert.deepEqual(back.journal, s.journal);
  const old = { ...freshState() }; delete old.journal;
  assert.deepEqual(sanitize(old).journal, { entries: [], seen: [] });
});

test('the page is wired: key, menu row, chime, shortcut row and stylesheet', () => {
  assert.ok(PAGE_CHIMES.journal);
  assert.ok(MENU_ROWS.some((r) => r.page === 'journal'));
  const row = SHORTCUT_GROUPS.flatMap((g) => g.rows).find((r) => r.keys[0] === 'J' && r.file === 'src/ui/modules/journal.js');
  assert.ok(row && read(row.file).includes(row.needle));
  assert.match(read('index.html'), /css\/journal\.css/);
});
