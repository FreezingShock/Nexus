import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { atmosMarkup } from '../src/ui/atmos.js';
import { DEFAULTS, SEASONS, WEATHER } from '../src/core/calendar.js';

const state = { season: 'spring', hour: 9, weatherKind: 'clear', night: 0 };

test('season and weather are picture tiles that keep their storage keys and values', () => {
  const html = atmosMarkup({ ...DEFAULTS, season: 'autumn' }, state);
  for (const v of ['auto', ...SEASONS]) assert.match(html, new RegExp(`stile season" data-key="season" data-value="${v}"`));
  for (const v of ['auto', ...WEATHER]) assert.match(html, new RegExp(`data-key="weather" data-value="${v}"`));
  for (const v of ['auto', 'day', 'night']) assert.match(html, new RegExp(`data-key="timeLock" data-value="${v}"`));
  assert.match(html, /data-key="season" data-value="autumn" aria-pressed="true"/);
  assert.match(html, /Follow the clock/);
  assert.match(html, /data-key="dayLength"/);
  assert.match(html, /data-key="seasonLength"/);
});

test('Settings is a notebook page with four bookmark tabs and every save action', () => {
  const js = readFileSync(new URL('../src/ui/panels.js', import.meta.url), 'utf8');
  for (const id of ['sky', 'gfx', 'snd', 'town']) assert.match(js, new RegExp(`id: '${id}'`));
  for (const id of ['atmos', 'gfx', 'snd']) assert.match(js, new RegExp(`id="${id}"`));
  for (const act of ['exp', 'imp', 'rest', 'pcv', 'rst', 'yes', 'no']) assert.match(js, new RegExp(`data-act="${act}"|act === '${act}'`), act);
  assert.match(js, /book\.register\('settings', \{[^]*tabs: TABS/);
  assert.doesNotMatch(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /id="settings"/, 'the old side card is gone');
});
