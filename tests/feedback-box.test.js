// The feedback box: what the player typed is trimmed and capped, a note goes once on Send, and an offline note waits in
// the outbox until it can go. Also: the title screen wires the box in place of the old corner credit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanNote, createOutbox, LIMITS, OUTBOX_KEY } from '../src/core/feedback-send.js';
import { feedbackMarkup } from '../src/ui/feedback-box.js';
import { VERSION } from '../src/version.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
const reply = (status) => async () => ({ ok: status >= 200 && status < 300, status });

test('a note is trimmed, capped and stamped with the version', () => {
  assert.deepEqual(cleanNote({ message: '   ' }), { ok: false, error: 'empty' });
  const c = cleanNote({ kind: 'bug', message: '  roads wobble  ', name: 'x'.repeat(99), website: '' });
  assert.equal(c.note.message, 'roads wobble');
  assert.equal(c.note.name.length, LIMITS.name);
  assert.equal(c.note.kind, 'bug');
  assert.equal(c.note.version, VERSION);
  assert.equal(cleanNote({ kind: 'drop table', message: 'hi' }).note.kind, 'other');
  assert.equal(cleanNote({ message: 'y'.repeat(5000) }).note.message.length, LIMITS.message);
});

test('sent goes once; offline waits in the outbox and goes later; refusals are not kept', async () => {
  const storage = memStorage();
  const calls = [];
  let mode = 'up';
  const fetchFn = async (url, init) => {
    calls.push([url, JSON.parse(init.body)]);
    if (mode === 'down') throw new TypeError('Failed to fetch');
    return { ok: mode === 'up', status: mode === 'up' ? 200 : mode === 'busy' ? 429 : 400 };
  };
  const box = createOutbox({ storage, fetchFn });
  const note = cleanNote({ message: 'more trees please' }).note;
  assert.equal(await box.send(note), 'sent');
  assert.equal(calls[0][0], '/api/feedback');
  assert.equal(box.pending(), 0);

  mode = 'down';
  assert.equal(await box.send(note), 'queued');
  assert.equal(await box.send({ ...note, message: 'and a bakery' }), 'queued');
  assert.equal(box.pending(), 2);
  assert.equal(await box.flush(), 0, 'still offline: nothing goes, nothing is lost');
  assert.equal(box.pending(), 2);

  mode = 'up';
  assert.equal(await box.flush(), 2);
  assert.equal(box.pending(), 0);
  assert.equal(storage.m.has(OUTBOX_KEY), false);
  assert.deepEqual(calls.slice(-2).map((c) => c[1].message), ['more trees please', 'and a bakery'], 'in the order written');

  mode = 'busy';
  assert.equal(await box.send(note), 'busy');
  mode = 'bad';
  assert.equal(await box.send(note), 'rejected');
  assert.equal(box.pending(), 0);
});

test('a server that is not set up yet (503) or missing (404) keeps the note', async () => {
  for (const status of [503, 500, 404]) {
    const box = createOutbox({ storage: memStorage(), fetchFn: reply(status) });
    assert.equal(await box.send(cleanNote({ message: 'hi' }).note), 'queued', String(status));
  }
});

test('the outbox is small and survives broken storage', async () => {
  const storage = memStorage();
  const box = createOutbox({ storage, fetchFn: async () => { throw new Error('offline'); } });
  for (let i = 0; i < LIMITS.outbox + 5; i++) await box.send(cleanNote({ message: 'n' + i }).note);
  assert.equal(box.pending(), LIMITS.outbox);
  storage.setItem(OUTBOX_KEY, '{nope');
  assert.equal(box.pending(), 0);
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const b2 = createOutbox({ storage: throwing, fetchFn: async () => { throw new Error('offline'); } });
  assert.equal(await b2.send(cleanNote({ message: 'hi' }).note), 'queued');
  assert.equal(await createOutbox({ storage: null, fetchFn: null }).send(cleanNote({ message: 'hi' }).note), 'queued');
});

test('the box has a hidden honeypot, caps its fields and animates through the shared motion', () => {
  const html = feedbackMarkup('nate');
  assert.match(html, /A note for nate/);
  assert.match(html, /class="fb-hp" aria-hidden="true">Website<input name="website" type="text" tabindex="-1"/);
  assert.match(html, new RegExp(`textarea[^>]*maxlength="${LIMITS.message}"`));
  assert.match(html, new RegExp(`id="fb-name"[^>]*maxlength="${LIMITS.name}"`));
  assert.match(html, /id="fb-card" data-mo="up" hidden/);
  assert.match(read('index.html'), /css\/feedback-box\.css/);
  assert.match(read('src/ui/title.js'), /createFeedbackBox\(title\)/);
});

test('only the feedback module talks to the network, and only when asked', () => {
  const send = read('src/core/feedback-send.js');
  assert.equal([...send.matchAll(/fetchFn\(/g)].length, 1, 'one call site');
  const ui = read('src/ui/feedback-box.js');
  assert.doesNotMatch(ui, /fetch\(|XMLHttpRequest|sendBeacon/);
  assert.match(ui, /if \(outbox\.pending\(\)\)/, 'a visit with an empty outbox sends nothing');
});

test('the emblem is drawn once: favicon.svg, and the same drawing on the title and progress screens', () => {
  const svg = read('favicon.svg').trim(), html = read('index.html');
  const inner = svg.slice(svg.indexOf('>') + 1);
  assert.equal(html.split(inner).length - 1, 2);
  assert.match(html, /<link rel="icon" href="favicon\.svg"/);
  assert.match(read('404.html'), /href="\/favicon\.svg"/);
});
