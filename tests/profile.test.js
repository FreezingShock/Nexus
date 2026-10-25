// The mayor profile (src/core/profile.js): name, picture, rank and bests, kept per browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileStore, sanitizeProfile, rankFor, initials, cleanName, playTime, RANKS, EMBLEMS, PROFILE_KEY } from '../src/core/profile.js';
import { totalStages } from '../src/sim/achievements.js';
import { EMBLEM_ICONS, GROUP_ICONS } from '../src/ui/title-icons.js';
import { GROUPS } from '../src/sim/achievements.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const NOW = Date.UTC(2026, 9, 25);

test('the rank ladder climbs with stages and the top is reachable', () => {
  assert.equal(rankFor(0).rank.name, 'Newcomer');
  assert.equal(rankFor(-5).index, 0);
  assert.equal(rankFor(NaN).index, 0);
  assert.equal(rankFor(RANKS[3].stages).index, 3);
  assert.equal(rankFor(RANKS[3].stages - 1).index, 2);
  assert.equal(rankFor(9999).next, null);
  assert.equal(rankFor(9999).frac, 1);
  const half = rankFor((RANKS[1].stages + RANKS[2].stages) / 2);
  assert.ok(half.frac > 0.4 && half.frac < 0.6);
  for (let i = 1; i < RANKS.length; i++) assert.ok(RANKS[i].stages > RANKS[i - 1].stages);
  assert.ok(RANKS.at(-1).stages <= totalStages(), 'the top rank can be earned');
});

test('initials and names', () => {
  assert.equal(initials(''), '');
  assert.equal(initials('nate'), 'NA');
  assert.equal(initials('Ada  Lovelace'), 'AL');
  assert.equal(initials('Jean Paul Sartre'), 'JS');
  assert.equal(cleanName('  <b>Mayor</b>\n  Nate  '), 'bMayor/b Nate');
  assert.equal(cleanName('x'.repeat(50)).length, 24);
});

test('a broken or missing record falls back to friendly defaults', () => {
  const p = sanitizeProfile({ emblem: 'dragon', color: 'red', playMs: -4, towns: 'lots', since: 'yesterday' }, NOW);
  assert.equal(p.emblem, 'initials');
  assert.equal(p.playMs, 0);
  assert.equal(p.towns, 0);
  assert.equal(p.since, '2026-10-25');
  assert.ok(EMBLEMS.every((e) => e === 'initials' || EMBLEM_ICONS[e]), 'every emblem is drawn');
  assert.ok(GROUPS.every((g) => GROUP_ICONS[g.id]), 'every milestone group has a badge icon');
});

test('the store keeps choices and bests, only ever adding', () => {
  const s = mem();
  const p = createProfileStore({ storage: s, now: () => NOW });
  assert.equal(p.set('name', 'Nate'), true);
  assert.equal(p.set('name', 'Nate'), false);
  assert.equal(p.set('playMs', 5), false, 'only the picture fields can be set');
  p.set('emblem', 'tulip');
  p.firstTown(); p.firstTown();
  assert.equal(p.get().towns, 1);
  p.newTown();
  assert.equal(p.get().towns, 2);
  p.note({ pop: 120, stages: 7 }); p.note({ pop: 80, stages: 3 });
  assert.equal(p.get().popRecord, 120);
  assert.equal(p.get().bestStages, 7);
  p.addPlay(15000); p.addPlay(-3); p.addPlay(60 * 60 * 1000);
  assert.equal(p.get().playMs, 15000, 'a step bigger than ten minutes is a sleeping laptop, not play');
  const again = createProfileStore({ storage: s, now: () => NOW + 1e9 }).get();
  assert.deepEqual({ name: again.name, emblem: again.emblem, towns: again.towns, since: again.since }, { name: 'Nate', emblem: 'tulip', towns: 2, since: '2026-10-25' });
  assert.ok(s.m.has(PROFILE_KEY));
});

test('storage that throws never breaks the profile', () => {
  const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  const p = createProfileStore({ storage: bad, now: () => NOW });
  p.set('name', 'Ada'); p.addPlay(1000);
  assert.equal(p.get().name, 'Ada');
});

test('play time reads like a person would say it', () => {
  assert.equal(playTime(0), 'under a minute');
  assert.equal(playTime(45 * 60000), '45 min');
  assert.equal(playTime(60 * 60000), '1 h');
  assert.equal(playTime(200 * 60000), '3 h 20 min');
});

test('the passes are placeholders: no price, no link, no network', async () => {
  const { PASSES, ROWS, PAGES } = await import('../src/ui/title.js');
  const { ICONS } = await import('../src/ui/title-icons.js');
  const { readFileSync } = await import('node:fs');
  assert.deepEqual(PASSES.map((p) => p.id), ['lantern', 'charter']);
  for (const p of PASSES) {
    assert.ok(ICONS[p.icon] && p.perks.length >= 3 && p.note && p.cta, p.id);
    assert.doesNotMatch(JSON.stringify(p), /[$€£]|\d+\.\d\d|https?:/, 'no prices or links');
  }
  assert.ok(ROWS.some((r) => r.id === 'pass') && PAGES.pass);
  const js = readFileSync(new URL('../src/ui/title.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|window\.open|location\.href\s*=/);
});
