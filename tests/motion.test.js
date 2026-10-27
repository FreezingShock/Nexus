// Every floating surface opts in to the shared open and close motion (css/motion.css) and keeps its hidden toggle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('motion sheet is linked and the global hidden rule leaves animated surfaces alone', () => {
  assert.match(read('index.html'), /css\/motion\.css/);
  assert.match(read('css/ui.css'), /\[hidden\]:not\(\[data-mo\]\)\{display:none!important\}/);
  const css = read('css/motion.css');
  assert.match(css, /\[data-mo\]\[hidden\]\{[^}]*visibility:hidden/);
  assert.match(css, /transition-delay:[^;]*var\(--mo-out\)/, 'visibility waits for the fade');
});

test('static panels carry data-mo in index.html', () => {
  const html = read('index.html');
  for (const id of ['inspect', 'fly', 'hp-panel', 'offline']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*data-mo`), id);
  }
});

test('script-built surfaces set data-mo', () => {
  assert.match(read('src/ui/notebook.js'), /data-mo="flip"/, 'the pages flip open (Goals, Settings, Shortcuts, Paint town)');
  const files = ['tooltips', 'zoning', 'districts', 'placement', 'road-tool', 'frame-stats', 'notes'];
  for (const f of files) assert.match(read(`src/ui/modules/${f}.js`), /data(set)?[.-]?mo|dataset\.mo/, f);
});

test('no animated surface still has its own display:none hidden rule or a one-way open keyframe', () => {
  for (const f of ['happiness', 'placement', 'roads', 'graphics']) assert.doesNotMatch(read(`css/${f}.css`), /\[hidden\]\{display:none\}/, f);
  assert.doesNotMatch(read('css/milestones.css'), /#achv\{[^}]*animation/);
});
