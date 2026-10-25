// Dark paper (src/core/theme.js): the mode store, auto following the computer, and the stylesheet wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THEME_KEY, MODES, resolve, readMode, createThemeStore, cleanMode } from '../src/core/theme.js';
import { themeMarkup } from '../src/ui/theme-settings.js';

const memStore = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};
const fakeMedia = (dark) => {
  const mq = { matches: dark, fns: [], addEventListener: (_, f) => mq.fns.push(f), flip(v) { mq.matches = v; mq.fns.forEach((f) => f()); } };
  return { mq, media: () => mq };
};

test('modes resolve to a look; anything unknown is light', () => {
  assert.equal(resolve('light', true), 'light');
  assert.equal(resolve('dark', false), 'dark');
  assert.equal(resolve('auto', true), 'dark');
  assert.equal(resolve('auto', false), 'light');
  assert.equal(resolve('purple', true), 'light');
  assert.equal(cleanMode(undefined), 'light');
  assert.deepEqual(MODES, ['light', 'dark', 'auto']);
});

test('a first visit is light paper, and broken storage never throws', () => {
  assert.equal(readMode(memStore()), 'light');
  assert.equal(readMode(memStore({ [THEME_KEY]: '{oops' })), 'light');
  assert.equal(readMode({ getItem() { throw new Error('blocked'); } }), 'light');
  const root = { dataset: {} };
  const t = createThemeStore({ storage: { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } }, root });
  assert.equal(root.dataset.theme, 'light');
  assert.equal(t.set('dark'), true); // still applies for this visit
  assert.equal(root.dataset.theme, 'dark');
});

test('choosing dark is saved and painted on the root', () => {
  const storage = memStore(), root = { dataset: {} };
  const seen = [];
  const t = createThemeStore({ storage, root, onChange: (v) => seen.push(v.look) });
  assert.equal(t.set('dark'), true);
  assert.equal(t.set('dark'), false);
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.dataset.themeMode, 'dark');
  assert.deepEqual(JSON.parse(storage.m.get(THEME_KEY)), { v: 1, mode: 'dark' });
  assert.deepEqual(seen, ['dark']);
  assert.equal(createThemeStore({ storage, root: { dataset: {} } }).get().mode, 'dark');
});

test('Match my computer follows the computer live, the others ignore it', () => {
  const { mq, media } = fakeMedia(false), root = { dataset: {} };
  const t = createThemeStore({ storage: memStore(), root, media });
  t.set('auto');
  assert.equal(root.dataset.theme, 'light');
  mq.flip(true);
  assert.equal(root.dataset.theme, 'dark');
  assert.match(themeMarkup(t.get()), /asks for dark paper/);
  t.set('light');
  mq.flip(false); mq.flip(true);
  assert.equal(root.dataset.theme, 'light');
});

test('the page loads dark paper last and sets the theme before the first paint', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const links = [...html.matchAll(/href="(css\/[^"]+)"/g)].map((m) => m[1]);
  assert.equal(links.at(-1), 'css/theme-dark.css');
  const boot = html.indexOf(THEME_KEY), firstCss = html.indexOf('css/fonts.css');
  assert.ok(boot > 0 && boot < firstCss, 'the boot script runs before any stylesheet');
  const css = readFileSync(new URL('../css/theme-dark.css', import.meta.url), 'utf8');
  for (const tok of ['--paper', '--ink', '--text', '--line', '--action']) assert.match(css, new RegExp(':root\\[data-theme="dark"\\]\\{[^}]*' + tok + ':'), tok);
});

test('words are written in --text, never straight in --ink, so dark paper can lift them', () => {
  const dir = new URL('../css/', import.meta.url);
  for (const f of ['ui.css', 'hud.css', 'menus.css', 'title.css', 'notebook.css', 'pages.css', 'settings.css', 'topbar.css']) {
    const css = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(css, /(^|[;{\s])color:var\(--ink\)/, f);
  }
});
