// The bottom toolbar: one tile per tool with its own icon, a chevron that folds the bar, and a staggered arrival.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const TOOLS = ['roads', 'zones', 'build', 'services', 'parks', 'decor', 'terrain', 'traffic', 'districts', 'bulldoze'];

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
