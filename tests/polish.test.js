import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_KEYS, SHORTCUT_GROUPS } from '../src/ui/shortcuts.js';
import { HOVER_TIPS } from '../src/ui/hovers.js';
import { TIP_STEPS, activeTip, loadSeen, saveSeen, TIPS_KEY } from '../src/ui/tips.js';
import { isNoteEvent, noteFor, NOTE_ICONS } from '../src/ui/notes.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const html = read('index.html');
const moduleSrc = readdirSync(join(ROOT, 'src/ui/modules')).filter((f) => f.endsWith('.js')).map((f) => read('src/ui/modules/' + f)).join('\n');
const uiSrc = readdirSync(join(ROOT, 'src/ui')).filter((f) => f.endsWith('.js')).map((f) => read('src/ui/' + f)).join('\n');

// ---- shortcuts: the sheet must list the keys the game really uses ----

test('every tool key is labelled on its tool button in index.html', () => {
  for (const [key, tool] of Object.entries(TOOL_KEYS)) {
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

// ---- first-time tips ----

test('tip steps have unique ids and text', () => {
  const ids = TIP_STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of TIP_STEPS) assert.ok(s.text.length > 20, s.id);
});

test('a brand-new town is offered the road tip first', () => {
  const fresh = { roadTiles: 0, painted: 0, placed: 0, upgrades: 0 };
  assert.equal(activeTip(fresh, []).id, 'road');
});

test('tips move on as the player does the thing, and skip what is already done', () => {
  assert.equal(activeTip({ roadTiles: 3, painted: 0, placed: 0, upgrades: 0 }, []).id, 'zone');
  assert.equal(activeTip({ roadTiles: 3, painted: 9, placed: 2, upgrades: 0 }, []).id, 'inspect');
  assert.equal(activeTip({ roadTiles: 3, painted: 9, placed: 2, upgrades: 1 }, []).id, 'away');
});

test('seen tips are not shown again, and a finished list returns null', () => {
  const fresh = { roadTiles: 0, painted: 0, placed: 0, upgrades: 0 };
  assert.equal(activeTip(fresh, ['road']).id, 'zone');
  const all = TIP_STEPS.map((s) => s.id);
  assert.equal(activeTip(fresh, all), null);
});

function memStore(initial) {
  const m = new Map(Object.entries(initial || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

test('seen tips survive a round trip through storage', () => {
  const s = memStore();
  saveSeen(s, ['road', 'zone']);
  assert.deepEqual(loadSeen(s), ['road', 'zone']);
  assert.ok(s.m.has(TIPS_KEY));
});

test('broken or missing storage never throws and gives no seen tips', () => {
  assert.deepEqual(loadSeen(memStore({ [TIPS_KEY]: '{not json' })), []);
  assert.deepEqual(loadSeen(memStore({ [TIPS_KEY]: '{"a":1}' })), []);
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadSeen(broken), []);
  assert.doesNotThrow(() => saveSeen(broken, ['road']));
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

test('a milestone gets a postcard with its own title and the colour of its stage, and a bad colour is ignored', () => {
  const n = noteFor({ type: 'milestone', title: 'Gold · Builder', tint: '#E6BC62', text: '40 buildings placed · +20,000 coins' });
  assert.equal(n.title, 'Gold · Builder');
  assert.equal(n.tint, '#E6BC62');
  assert.equal(n.icon, 'medal');
  assert.equal(noteFor({ type: 'milestone', tint: 'red; background:url(x)', text: 'x' }).tint, null);
  assert.equal(noteFor({ type: 'milestone', text: 'x' }).title, 'A milestone');
});

test('the toast is skipped only for note events in ui.js', () => {
  assert.match(read('src/ui/ui.js'), /if \(e\.text && !isNoteEvent\(e\)\) hud\.toast/);
});
