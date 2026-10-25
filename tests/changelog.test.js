// The changelog (src/changelog.js) feeds the Changes page. Every release has notes, the newest matches the version.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHANGELOG, KINDS, newSince, cmpVersion, kindCounts } from '../src/changelog.js';
import { VERSION } from '../src/version.js';
import { ICONS, KIND_ICONS } from '../src/ui/title-icons.js';
import { ROWS, PAGES } from '../src/ui/title.js';

test('the newest changelog entry is the current version: add your notes when you bump it', () => {
  assert.equal(CHANGELOG[0].v, VERSION);
});

test('entries are newest first, with unique versions and well-formed lines', () => {
  const vs = CHANGELOG.map((e) => e.v);
  assert.equal(new Set(vs).size, vs.length);
  for (let i = 1; i < CHANGELOG.length; i++) {
    assert.equal(cmpVersion(vs[i - 1], vs[i]), 1, vs[i - 1] + ' before ' + vs[i]);
    assert.ok(CHANGELOG[i - 1].date >= CHANGELOG[i].date);
  }
  for (const e of CHANGELOG) {
    assert.match(e.v, /^\d+\.\d+\.\d+$/);
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(e.name && e.blurb && e.items.length > 0, e.v);
    for (const it of e.items) {
      assert.ok(KINDS[it.k], e.v + ': unknown kind ' + it.k);
      assert.ok(it.t.length > 10 && /[.!]$/.test(it.t), e.v + ': ' + it.t);
      if ('pr' in it) assert.ok(Number.isInteger(it.pr) && it.pr > 0);
    }
  }
});

test('every kind has an icon, and counts follow the kinds', () => {
  for (const k of Object.keys(KINDS)) assert.ok(KIND_ICONS[k], k);
  const counts = kindCounts({ items: [{ k: 'fix' }, { k: 'new' }, { k: 'fix' }] });
  assert.deepEqual(counts, [{ k: 'new', n: 1 }, { k: 'fix', n: 2 }]);
});

test('what is new since a version', () => {
  assert.deepEqual(newSince(''), []);
  assert.deepEqual(newSince(VERSION), []);
  assert.deepEqual(newSince(CHANGELOG[2].v).map((e) => e.v), [CHANGELOG[0].v, CHANGELOG[1].v]);
  assert.equal(cmpVersion('0.10.0', '0.9.0'), 1);
  assert.equal(cmpVersion('0.9.0', '0.9.0'), 0);
});

test('every menu row has an icon and a page, and the page has its builder', () => {
  const js = readFileSync(new URL('../src/ui/title.js', import.meta.url), 'utf8');
  for (const r of ROWS) {
    assert.ok(ICONS[r.id], r.id);
    assert.ok(PAGES[r.id] && PAGES[r.id].title && PAGES[r.id].c, r.id);
    assert.match(js, new RegExp('\\b' + r.id + ': \\(\\) =>'), r.id);
  }
});
