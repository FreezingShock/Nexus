// The notebook pages: one sheet for the title and the town (src/ui/notebook.js), the town's page registry (book.js),
// the menu rows and the pages they open. The sheet's logic runs here against tiny fake elements; layout, motion and
// sound are checked by nate on localhost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNotebook, notebookMarkup, tabsMarkup } from '../src/ui/notebook.js';
import { PAGE_CHIMES } from '../src/audio/page-sounds.js';
import { MENU_ROWS } from '../src/ui/modules/menu.js';
import { GOAL_TABS } from '../src/ui/modules/progress.js';
import { shortcutsHtml } from '../src/ui/modules/shortcut-sheet.js';
import { SHORTCUT_GROUPS } from '../src/ui/shortcuts.js';
import { milestonesHtml } from '../src/ui/milestone-list.js';
import { GOALS, GROUPS } from '../src/sim/achievements.js';
import { freshState } from '../src/sim/state.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// An element with just what the notebook touches.
function fake() {
  const ls = {};
  return {
    hidden: true, innerHTML: '', textContent: '', scrollTop: 0, dataset: {}, children: [],
    style: { setProperty() {} },
    classList: { set: new Set(), toggle(n, on) { if (on) this.set.add(n); else this.set.delete(n); } },
    addEventListener(k, fn) { (ls[k] ||= []).push(fn); },
    fire(k, e) { for (const fn of ls[k] || []) fn(e); },
    querySelector: () => null, focus() {},
  };
}
function sheetOf() {
  const els = {};
  const get = (id) => (els[id] ||= fake());
  return { els, get };
}

test('the sheet opens one page at a time, toggles, switches tabs and tells its host', () => {
  const { els, get } = sheetOf(), log = [], played = [];
  const pages = {
    a: { title: 'A', sub: 'first', c: '#fff', render: () => '<p>a</p>', closed: () => log.push('closed a') },
    b: { title: 'B', sub: () => 'live', c: '#000', tabs: [{ id: 'x', label: 'X', color: '#111' }, { id: 'y', label: 'Y', color: '#222' }],
      render: ({ tab }) => '<p>b ' + tab + '</p>' },
  };
  const nb = createNotebook({ get, prefix: 'pg', pages, sounds: { open: (n) => played.push(n), close: () => played.push('close') },
    onShow: (n, was) => log.push('show ' + n + ' from ' + was), onHide: (n) => log.push('hide ' + n) });
  nb.show('a');
  assert.equal(nb.current(), 'a');
  assert.equal(els['pg-sheet'].hidden, false);
  assert.equal(els['pg-sheet-title'].textContent, 'A');
  assert.equal(els['pg-sheet-body'].innerHTML, '<p>a</p>');
  assert.equal(els['pg-tabs'].hidden, true, 'a page without sections has no tabs');
  nb.show('b'); // switching pages closes the first one
  assert.equal(els['pg-sheet-sub'].textContent, 'live');
  assert.equal(els['pg-sheet-body'].innerHTML, '<p>b x</p>', 'the first tab by default');
  assert.equal(els['pg-tabs'].hidden, false);
  nb.pickTab('y');
  assert.equal(els['pg-sheet-body'].innerHTML, '<p>b y</p>');
  nb.show('b'); // the same page again closes it
  assert.equal(nb.isOpen(), false);
  assert.equal(els['pg-sheet'].hidden, true);
  assert.equal(els['pg-sheet-body'].innerHTML, '<p>b y</p>', 'the page stays while it folds away');
  nb.show('b');
  assert.equal(nb.tab(), 'y', 'a page remembers its tab');
  els['pg-back'].fire('click');
  assert.equal(nb.isOpen(), false);
  assert.deepEqual(log, ['show a from null', 'closed a', 'show b from a', 'hide b', 'show b from null', 'hide b']);
  assert.deepEqual(played, ['a', 'b', 'close', 'b', 'close']);
});

test('clicks in the body go to the open page, and a refresh keeps the place without rising in again', () => {
  const { els, get } = sheetOf(); let got = null;
  const nb = createNotebook({ get, prefix: 'pg', pages: { a: { title: 'A', sub: '', c: '', render: () => 'x', click: (e, ctx) => { got = ctx.page + e.v; } } } });
  els['pg-sheet-body'].fire('click', { v: 1 });
  assert.equal(got, null, 'nothing open, nothing handled');
  nb.show('a');
  els['pg-sheet-body'].fire('click', { v: 2 });
  assert.equal(got, 'a2');
  els['pg-sheet-body'].scrollTop = 120;
  nb.refresh();
  assert.equal(els['pg-sheet-body'].scrollTop, 120);
  assert.ok(els['pg-sheet-body'].classList.set.has('nb-still'));
});

test('one sheet markup for the title and the town, with tabs, Back and the flip', () => {
  const html = notebookMarkup('pg');
  for (const id of ['pg-scrim', 'pg-sheet', 'pg-tabs', 'pg-back', 'pg-sheet-ico', 'pg-sheet-title', 'pg-sheet-sub', 'pg-sheet-body']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /data-mo="flip"/);
  assert.match(tabsMarkup([{ id: 'x', label: 'X', color: '#123' }], 'x'), /role="tab" data-tab="x" aria-selected="true" style="--tc:#123/);
  assert.match(read('src/ui/title.js'), /notebookMarkup\('tt'\)/);
  assert.match(read('src/ui/book.js'), /notebookMarkup\('pg'\)/);
  assert.doesNotMatch(read('css/title.css'), /\.tt-sheet|\.tt-scrim/, 'the title keeps no copy of the sheet styles');
  const css = read('css/notebook.css');
  assert.match(css, /\.nb-tabs\{position:absolute;left:calc\(100% - 3px\)/, 'tabs stick out of the right edge');
  assert.match(read('css/pages.css'), /\.nb-stage\{position:absolute;inset:0;z-index:50/, 'above the HUD, under the title');
});

test('every town page is registered, has a chime and an icon, and the menu opens the right one', () => {
  const sources = { goals: 'src/ui/modules/progress.js', settings: 'src/ui/panels.js', shortcuts: 'src/ui/modules/shortcut-sheet.js', paint: 'src/ui/modules/paint-town.js' };
  for (const [page, file] of Object.entries(sources)) {
    assert.match(read(file), new RegExp(`book\\.register\\('${page}'`), page);
    assert.ok(PAGE_CHIMES[page] || page === 'settings', page + ' has a chime');
    assert.ok(MENU_ROWS.some((r) => r.page === page), page + ' is in the menu');
  }
  assert.ok(PAGE_CHIMES.settings);
  const ids = MENU_ROWS.map((r) => r.id);
  assert.deepEqual([...new Set(ids)], ids);
  for (const id of ['goalsbtn', 'night', 'paintbtn', 'photobtn', 'keysbtn', 'settingsbtn']) assert.ok(ids.includes(id), id);
  assert.ok(MENU_ROWS.every((r) => r.label && r.c), 'every row has a name and a colour');
  assert.ok(!MENU_ROWS.find((r) => r.id === 'night').page, 'Time of day stays a one-click toggle');
});

test('Goals and Milestones share one page, G and M open their tabs', () => {
  assert.deepEqual(GOAL_TABS.map((t) => t.id), ['today', 'milestones']);
  const js = read('src/ui/modules/progress.js');
  assert.match(js, /e\.key === 'g'[^\n]*open\('today'\)/);
  assert.match(js, /e\.key === 'm'[^\n]*open\('milestones'\)/);
  for (const id of ['gch', 'gchbar', 'gboost', 'glist', 'gbonus', 'gmlist', 'gren', 'grenew']) assert.match(js, new RegExp(`id="${id}"`), id);
});

test('the Milestones tab lists every goal on All and only its group when filtered', () => {
  const s = freshState();
  const all = milestonesHtml(s, 'all');
  for (const g of GOALS) assert.match(all, new RegExp(`data-goal="${g.id}"`), g.id);
  assert.match(all, /id="ms-near"/);
  for (const gr of GROUPS) assert.match(all, new RegExp(`data-v="${gr.id}"`), 'a chip for ' + gr.id);
  const one = milestonesHtml(s, GROUPS[0].id);
  assert.doesNotMatch(one, /id="ms-near"/);
  for (const g of GOALS) assert.equal(one.includes(`class="ag" data-goal="${g.id}"`), g.group === GROUPS[0].id, g.id);
});

test('the Shortcuts page lists every group and keeps the tips button', () => {
  const html = shortcutsHtml();
  for (const g of SHORTCUT_GROUPS) assert.ok(html.includes(g.title), g.title);
  assert.match(html, /data-act="tips"/);
});

test('a page never touches the sim just by opening, and tool keys wait while one is open', () => {
  const ui = read('src/ui/ui.js');
  assert.match(ui, /if \(e\.key === 'Escape' && book\.isOpen\(\)\) \{ book\.close\(\); return; \}/);
  assert.ok(ui.indexOf('if (book.isOpen()) return;') < ui.indexOf('if (TOOL_KEYS[k])'));
  assert.doesNotMatch(read('src/ui/book.js') + read('src/ui/notebook.js'), /send\(|dispatch\(|togglePause/);
});

test('the menu dresses every button as a row: icon tile, name, live line and key', async () => {
  // A small fake DOM: just what menu.js touches.
  const el = (id) => {
    const kids = [];
    const e = {
      id, innerHTML: '', dataset: {}, attrs: {}, kids,
      classList: { names: new Set(), add(n) { this.names.add(n); }, contains(n) { return this.names.has(n); } },
      style: { setProperty() {} },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
      addEventListener() {}, appendChild(c) { kids.push(c); return c; },
      querySelector(sel) {
        if (sel === 'svg,.qmark') return { outerHTML: '<svg data-own="' + id + '"></svg>' };
        if (sel === '.mi-text') return (this.text ||= el(id + '-text'));
        if (sel === '.mi-sub') return (this.sub ||= { textContent: '' });
        return null;
      },
      querySelectorAll: () => [],
    };
    return e;
  };
  const els = {};
  const saved = { document: globalThis.document };
  globalThis.document = { getElementById: (id) => (els[id] ||= el(id)), createElement: () => el('hr'), addEventListener() {} };
  try {
    const { default: menu } = await import('../src/ui/modules/menu.js');
    menu.create({ sim: { state: { charge: 10, achievements: {}, best: {} } } });
    const grid = els.menugrid;
    const rows = grid.kids.filter((k) => k.id !== 'hr');
    assert.deepEqual(rows.map((r) => r.id), MENU_ROWS.map((r) => r.id), 'rows in menu order');
    for (const r of MENU_ROWS) {
      const html = els[r.id].innerHTML;
      assert.match(html, /class="mi-ico"><svg/, r.id + ' icon tile');
      assert.ok(html.includes(`<b>${r.label}</b>`), r.id + ' name');
      assert.match(html, /class="mi-sub"/, r.id + ' line');
      if (r.key) assert.ok(html.includes(`<kbd>${r.key}</kbd>`), r.id + ' key');
      assert.ok(els[r.id].classList.contains('mrow'));
    }
    assert.equal(grid.kids.filter((k) => k.id === 'hr').length, MENU_ROWS.filter((r) => r.gap).length);
  } finally { globalThis.document = saved.document; }
});
