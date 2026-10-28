import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_KEYS, SHORTCUT_GROUPS } from '../src/ui/shortcuts.js';
import { HOVER_TIPS } from '../src/ui/hovers.js';
import { isNoteEvent, noteFor, NOTE_ICONS, KINDS, toastKind, toastNote, chipAmount } from '../src/ui/notes.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const html = read('index.html');
const moduleSrc = readdirSync(join(ROOT, 'src/ui/modules')).filter((f) => f.endsWith('.js')).map((f) => read('src/ui/modules/' + f)).join('\n');
const uiSrc = readdirSync(join(ROOT, 'src/ui')).filter((f) => f.endsWith('.js')).map((f) => read('src/ui/' + f)).join('\n');

// ---- shortcuts: the sheet must list the keys the game really uses ----

test('every tool key is labelled on its tool button in index.html', () => {
  for (const [key, tool] of Object.entries(TOOL_KEYS)) {
    if (tool === 'traffic') continue; // moved off the bar into the Views chip
    const re = new RegExp(`data-tool="${tool}"[^>]*><kbd>${key.toUpperCase()}</kbd>`);
    assert.match(html, re, `tool ${tool} should show ${key.toUpperCase()}`);
  }
});

test('every shortcut row that names a file still finds its key in that file', () => {
  const missing = [];
  for (const g of SHORTCUT_GROUPS) for (const r of g.rows) {
    if (!r.file) continue;
    if (!read(r.file).includes(r.needle)) missing.push(`${r.keys.join('+')} in ${r.file}`);
  }
  assert.deepEqual(missing, []);
});

test('every shortcut row has keys and text', () => {
  for (const g of SHORTCUT_GROUPS) {
    assert.ok(g.title && g.rows.length, g.title);
    for (const r of g.rows) { assert.ok(r.keys.length && r.text, JSON.stringify(r)); }
  }
});

// ---- hover tips: each selector must point at something that exists ----

test('every hover tip selector points at an element the game makes', () => {
  const missing = [];
  for (const [sel] of HOVER_TIPS) {
    const data = sel.match(/^\[data-tool="(\w+)"\]$/);
    const id = sel.match(/^#([\w-]+)$/);
    if (data) { if (!html.includes(`data-tool="${data[1]}"`)) missing.push(sel); }
    else if (id) {
      const needle = `id="${id[1]}"`;
      const made = `'${id[1]}'`;
      if (!html.includes(needle) && !moduleSrc.includes(made) && !uiSrc.includes(made)) missing.push(sel);
    } else missing.push(sel);
  }
  assert.deepEqual(missing, []);
});

// ---- postcard notes ----

test('reward events get a postcard note, and nothing else does', () => {
  assert.ok(noteFor({ type: 'goalDone', text: 'Goal done: Coins 1,000' }));
  assert.ok(noteFor({ type: 'renewed', text: 'Renewed: +1 point' }));
  assert.ok(noteFor({ type: 'boosted', text: 'Charged up' }));
  assert.equal(noteFor({ type: 'toast', text: 'Not enough coins yet' }), null);
  assert.equal(noteFor({ type: 'upgraded', id: 3, text: 'Shop upgraded' }), null);
  assert.equal(noteFor({ type: 'goalDone', text: '' }), null);
  assert.equal(isNoteEvent(null), false);
});

test('every note icon exists', () => {
  for (const name of ['star', 'sprout', 'bolt', 'medal']) assert.ok(NOTE_ICONS[name], name);
  for (const t of ['goalDone', 'renewed', 'boosted', 'milestone']) assert.ok(NOTE_ICONS[noteFor({ type: t, text: 'x' }).icon]);
});

test('a milestone gets a strip with its own title and the colour of its stage, and a bad colour is ignored', () => {
  const n = noteFor({ type: 'milestone', title: 'Gold · Builder', tint: '#E6BC62', text: '40 buildings placed · +20,000 coins', sub: 'You reached 40 buildings placed', coins: 20000, parts: 150.7, extra: 'Avenue opens' });
  assert.equal(n.title, 'Gold · Builder');
  assert.equal(n.color, '#E6BC62');
  assert.equal(n.icon, 'medal');
  assert.equal(n.text, 'You reached 40 buildings placed', 'the strip says what happened; the rewards go on chips');
  assert.deepEqual([n.coins, n.parts, n.extra], [20000, 150, 'Avenue opens']);
  assert.equal(noteFor({ type: 'milestone', tint: 'red; background:url(x)', text: 'x' }).color, KINDS.milestone.color);
  assert.equal(noteFor({ type: 'milestone', text: 'x' }).title, 'A milestone');
  assert.equal(noteFor({ type: 'goalDone', kind: 'daily', text: 'x' }).kind, 'daily');
});

test('every kind has a colour, an icon and a life', () => {
  for (const [k, d] of Object.entries(KINDS)) {
    assert.match(d.color, /^#[0-9A-F]{6}$/i, k);
    assert.ok(NOTE_ICONS[d.icon], k + ' icon');
    assert.ok(d.life >= 2000 && d.life <= 8000, k + ' life');
  }
});

test('plain toasts are sorted by what they say', () => {
  assert.equal(toastKind('Not enough coins yet'), 'warn');
  assert.equal(toastKind('Needs 40 Parts'), 'warn');
  assert.equal(toastKind('Nothing to undo'), 'warn');
  assert.equal(toastKind('Already painted'), 'warn');
  assert.equal(toastKind('Avenue unlocked'), 'unlock');
  assert.equal(toastKind('Saved nexus-photo.png'), 'photo');
  assert.equal(toastKind('Oak tree cleared · Ctrl+Z brings it back'), 'done');
  assert.equal(toastKind('Home: the classic town view.'), 'info');
  assert.equal(toastNote('Avenue unlocked', 'warn').kind, 'warn', 'an event can say its kind');
  assert.equal(toastNote('x', 'house').kind, 'info', 'an unknown kind falls back to the words');
  assert.equal(toastNote('x').short, true);
});

test('reward chips keep big numbers short', () => {
  assert.equal(chipAmount(240), '+240');
  assert.equal(chipAmount(3000), '+3,000');
  assert.equal(chipAmount(13500), '+13.5k');
  assert.equal(chipAmount(150000), '+150k');
  assert.equal(chipAmount(1000000), '+1M');
  assert.equal(chipAmount(2500000), '+2.5M');
});

test('every toast goes through the notes module, and note events skip the plain toast', () => {
  assert.match(read('src/ui/ui.js'), /if \(e\.text && !isNoteEvent\(e\)\) hud\.toast/);
  assert.match(read('src/ui/hud.js'), /useToasts\(fn\)/);
  assert.match(read('src/ui/modules/notes.js'), /hud\.useToasts\(/);
  assert.match(read('src/ui/modules/notes.js'), /burst\(gains, kinds\)/, 'rewards fly into the counters like the postcard');
  assert.doesNotMatch(html, /id="toast"/, 'the old single toast is gone');
});

test('the bottom-left chip says "/ for shortcuts" and / opens the page', () => {
  const html = read('index.html'), sheet = read('src/ui/modules/shortcut-sheet.js');
  assert.match(html, /id="keyhint"[^>]*>\s*<kbd>\/<\/kbd><span>for shortcuts<\/span>/);
  assert.doesNotMatch(html, /Drag to pan/, 'the long list of controls is gone from the corner');
  assert.match(sheet, /getElementById\('keyhint'\)/);
  assert.match(sheet, /e\.key === '\/' \|\| e\.key === '\?'/);
});

test('tool flyouts sit above the toolbar chevron', () => {
  const ui = read('css/ui.css'), bar = read('css/toolbar.css'), menus = read('css/menus.css');
  assert.match(bar, /--fly-b:calc\(max\(18px,env\(safe-area-inset-bottom,0px\)\) \+ 128px \+ 34px\)/, 'chevron top (bar + 128px + 24px tab) plus a gap');
  assert.match(bar, /#toolfold\[aria-expanded="false"\]\)\{--fly-b:/);
  assert.match(ui, /\.fly\{position:absolute;[^}]*bottom:var\(--fly-b\)/);
  assert.match(menus, /\.fly\.bdchip\{[^}]*bottom:var\(--fly-b\)/);
});
