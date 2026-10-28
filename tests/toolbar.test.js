// The bottom toolbar: one tile per tool with its own icon, a chevron that folds the bar, and a staggered arrival.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const TOOLS = ['roads', 'zones', 'build', 'services', 'parks', 'decor', 'terrain', 'districts', 'bulldoze'];

test('every tool tile keeps its hooks, key hint, stagger index and an inline icon', () => {
  const html = read('index.html');
  TOOLS.forEach((t, i) => {
    const m = html.match(new RegExp(`<button class="tool" style="--i:(\\d+)" data-tool="${t}" aria-pressed="false"><kbd>.</kbd><span class="ico"[^>]*><svg[^>]*>[\\s\\S]*?</svg></span><span class="t">`));
    assert.ok(m, t);
    assert.equal(Number(m[1]), i, t + ' index');
  });
});

test('the chevron controls the bar and the sheet and module are wired', () => {
  const html = read('index.html');
  assert.match(html, /id="toolfold"[^>]*aria-expanded="true"[^>]*aria-controls="tools"/);
  assert.match(html, /css\/toolbar\.css/);
  assert.match(html, /id="tools"/);
  const css = read('css/toolbar.css');
  assert.match(css, /#tools\.off\{[^}]*visibility:hidden/);
  assert.match(css, /#tools\.off \.tool\{[^}]*opacity:0/);
  assert.match(css, /var\(--i,0\)\*50ms/, 'tiles stagger by index');
  const js = read('src/ui/modules/toolbar-fold.js');
  assert.match(js, /classList\.toggle\('off'/);
  assert.match(js, /try \{ return localStorage/);
  assert.match(read('src/ui/modules/index.js'), /toolbar-fold/);
});

test('the tools sit in named groups, and the lock hint only speaks for gated tools', async () => {
  const html = read('index.html');
  for (const g of ['Build', 'Community', 'Land']) assert.match(html, new RegExp(`class="gcap">${g}<`));
  assert.match(read('src/ui/modules/index.js'), /toolbar-groups/);
  const { lockHint } = await import('../src/ui/toolbar-hints.js');
  const fresh = { roadUnlocks: [], decorUnlocks: [], parts: 0, event: null, keepsakes: [] };
  assert.equal(lockHint('zones', fresh).locked, 0);
  const shut = lockHint('roads', fresh);
  assert.ok(shut.locked > 0 && !shut.ready && /Parts/.test(shut.tip));
  assert.ok(lockHint('roads', { ...fresh, parts: 1e9 }).ready);
  const all = { ...fresh, roadUnlocks: ['bike', 'one', 'bus', 'free'] };
  assert.equal(lockHint('roads', all).tip, '');
});
