// The top-right slot: the menu, Settings, Milestones, the Inspect card and the Happiness panel never overlap, so opening
// one closes the one that was open. The slot is plain logic; the wiring checks read the sources. No browser is run here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSlot } from '../src/ui/slot.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// A surface that tracks its own open state, the way the real ones do.
function surface(slot, id, log) {
  const s = { open: false, el: { classList: { names: new Set(), add(n) { this.names.add(n); }, remove(n) { this.names.delete(n); } } } };
  slot.register(id, { isOpen: () => s.open, close: () => { s.open = false; log.push('close ' + id); }, el: s.el });
  s.show = () => { slot.claim(id); s.open = true; };
  return s;
}

test('opening a surface closes the one that was open, and only that one', () => {
  const log = [], slot = createSlot({ setTimer: () => {} });
  const menu = surface(slot, 'menu', log), inspect = surface(slot, 'inspect', log), settings = surface(slot, 'settings', log);
  inspect.show();
  assert.deepEqual(slot.open(), ['inspect']);
  menu.show(); // the menu closes the Inspect card
  assert.deepEqual(slot.open(), ['menu']);
  inspect.show(); // a building click closes the menu
  assert.deepEqual(slot.open(), ['inspect']);
  settings.show();
  assert.deepEqual(slot.open(), ['settings']);
  assert.deepEqual(log, ['close inspect', 'close menu', 'close inspect']);
});

test('claiming with nothing open closes nothing and does not delay the new surface', () => {
  const slot = createSlot({ setTimer: () => {} }), log = [];
  const menu = surface(slot, 'menu', log);
  assert.equal(slot.claim('menu'), false);
  assert.equal(menu.el.classList.names.has('mo-late'), false);
  assert.deepEqual(log, []);
});

test('a hand-off marks the incoming surface for a moment so the two never sit on each other', () => {
  let later;
  const slot = createSlot({ setTimer: (fn) => { later = fn; } }), log = [];
  const a = surface(slot, 'a', log), b = surface(slot, 'b', log);
  a.show();
  assert.equal(slot.claim('b'), true);
  assert.equal(b.el.classList.names.has('mo-late'), true);
  later();
  assert.equal(b.el.classList.names.has('mo-late'), false);
  assert.equal(a.el.classList.names.has('mo-late'), false);
});

test('every top-right surface claims the slot before it opens and registers how to close', () => {
  assert.match(read('src/ui/modules/menu.js'), /topRight\.claim\('menu'\)/);
  assert.match(read('src/ui/modules/menu.js'), /topRight\.register\('menu'/);
  assert.match(read('src/ui/modules/milestones.js'), /topRight\.claim\('milestones'\)/);
  assert.match(read('src/ui/modules/milestones.js'), /topRight\.register\('milestones'/);
  assert.match(read('src/ui/modules/happiness.js'), /topRight\.claim\('happiness'\)/);
  const panels = read('src/ui/panels.js');
  assert.equal((panels.match(/topRight\.claim\('inspect'\)/g) || []).length, 2, 'building card and tree card');
  assert.equal((panels.match(/topRight\.claim\('settings'\)/g) || []).length, 2, 'Settings and its questions');
  const ui = read('src/ui/ui.js');
  assert.match(ui, /topRight\.register\('inspect'/);
  assert.match(ui, /topRight\.register\('settings'/);
});

test('the menu tiles lay out an icon, a name and a line of state, and the hand-off delay is in motion.css', () => {
  const css = read('css/topbar.css');
  assert.match(css, /\.menugrid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);grid-auto-rows:66px/);
  assert.match(css, /\.menugrid \.goalsib \.chg\{position:static/);
  assert.match(read('css/motion.css'), /\.mo-late:not\(\[hidden\]\)\{transition-delay/);
  assert.match(read('src/ui/hud.js'), /dataset\.sub = LOCK_SUB\[lock\]/);
});
