// The feedback route on the live site (worker/feedback.js), run in Node against a tiny fake D1.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleFeedback, handleAdmin, readNote, resetForTests, RATE, CAPS, adminPage } from '../worker/feedback.js';
import worker from '../worker/index.js';

// Enough of D1 for this file: one table kept as an array, matched on the exact statements feedback.js uses.
function fakeD1() {
  const rows = [];
  const exec = (sql, args) => {
    if (/^CREATE/.test(sql)) return { results: [] };
    if (sql.startsWith('INSERT')) { const [created_at, kind, message, name, version, visitor] = args; rows.push({ id: rows.length + 1, created_at, kind, message, name, version, visitor }); return { results: [] }; }
    if (sql.includes('COUNT(*)') && sql.includes('visitor')) return { results: [{ n: rows.filter((r) => r.visitor === args[0] && r.created_at > args[1]).length }] };
    if (sql.includes('COUNT(*)')) return { results: [{ n: rows.filter((r) => r.created_at > args[0]).length }] };
    if (sql.startsWith('SELECT id')) { const list = rows.filter((r) => !sql.includes('kind = ?') || r.kind === args[0]); return { results: [...list].reverse() }; }
    throw new Error('unexpected sql ' + sql);
  };
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), run: async () => exec(sql, args), all: async () => exec(sql, args), _do: () => exec(sql, args) });
  return { rows, prepare: (sql) => stmt(sql), batch: async (list) => list.map((s) => s._do()) };
}
const post = (body, headers = {}) => new Request('https://playnexus.dev/api/feedback', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://playnexus.dev', 'CF-Connecting-IP': '203.0.113.7', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
let env;
beforeEach(() => { resetForTests(); env = { FEEDBACK_DB: fakeD1() }; });

test('a note is stored with its kind, name and version, never the address', async () => {
  const res = await handleFeedback(post({ kind: 'idea', message: ' a bakery by the river ', name: 'Ada', version: '0.12.0', website: '' }), env);
  assert.equal(res.status, 200);
  const [row] = env.FEEDBACK_DB.rows;
  assert.equal(row.message, 'a bakery by the river');
  assert.equal(row.kind, 'idea'); assert.equal(row.name, 'Ada'); assert.equal(row.version, '0.12.0');
  assert.equal(row.visitor.length, 32);
  assert.ok(!JSON.stringify(row).includes('203.0.113.7'));
});

test('honeypot, empty notes, junk, other sites and big bodies are turned away', async () => {
  assert.equal((await handleFeedback(post({ message: 'buy pills', website: 'spam.example' }), env)).status, 200);
  assert.equal(env.FEEDBACK_DB.rows.length, 0, 'the bot is told yes and nothing is kept');
  assert.equal((await handleFeedback(post({ message: '   ' }), env)).status, 400);
  assert.equal((await handleFeedback(post('not json'), env)).status, 400);
  assert.equal((await handleFeedback(post([1, 2]), env)).status, 400);
  assert.equal((await handleFeedback(post({ message: 'hi' }, { Origin: 'https://evil.example' }), env)).status, 403);
  assert.equal((await handleFeedback(post({ message: 'x'.repeat(CAPS.body + 10) }), env)).status, 413);
  assert.equal((await handleFeedback(new Request('https://playnexus.dev/api/feedback'), env)).status, 405);
  assert.equal(readNote({ message: 'y'.repeat(5000), kind: 'nope', name: 'n'.repeat(99) }).note.message.length, CAPS.message);
  assert.equal(readNote({ message: 'hi', kind: 'nope' }).note.kind, 'other');
  assert.equal(readNote({ message: 'hi', name: 'n'.repeat(99) }).note.name.length, CAPS.name);
});

test('five notes per visitor per ten minutes, then a polite 429; another visitor is not affected', async () => {
  const t0 = Date.parse('2026-10-26T12:00:00Z');
  for (let i = 0; i < RATE.perVisitor; i++) assert.equal((await handleFeedback(post({ message: 'n' + i }), env, t0 + i * 1000)).status, 200);
  assert.equal((await handleFeedback(post({ message: 'one more' }), env, t0 + 9000)).status, 429);
  assert.equal((await handleFeedback(post({ message: 'hello' }, { 'CF-Connecting-IP': '198.51.100.2' }), env, t0 + 9000)).status, 200);
  assert.equal((await handleFeedback(post({ message: 'later' }), env, t0 + RATE.visitorWindowMs + 60e3)).status, 200);
});

test('without the database bound the route says 503, so the box keeps the note', async () => {
  assert.equal((await handleFeedback(post({ message: 'hi' }), {})).status, 503);
});

test('the reading page needs the password, escapes what players wrote, and exports CSV', async () => {
  const key = 'correct horse';
  env.FEEDBACK_ADMIN_KEY = key;
  await handleFeedback(post({ kind: 'bug', message: '<script>alert(1)</script> roads "wobble"', name: 'Bo' }), env);
  const get = (path, pass) => new Request('https://playnexus.dev' + path, pass === undefined ? {} : { headers: { Authorization: 'Basic ' + btoa('nate:' + pass) } });
  assert.equal((await handleAdmin(get('/admin/feedback'), env)).status, 401);
  assert.equal((await handleAdmin(get('/admin/feedback', 'wrong'), env)).status, 401);
  const ok = await handleAdmin(get('/admin/feedback', key), env);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('Cache-Control'), 'no-store');
  const html = await ok.text();
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  const csv = await (await handleAdmin(get('/admin/feedback?format=csv', key), env)).text();
  assert.match(csv, /"<script>alert\(1\)<\/script> roads ""wobble"""/);
  assert.equal((await handleAdmin(get('/admin/feedback', key), { FEEDBACK_DB: env.FEEDBACK_DB })).status, 404, 'no key set: no page at all');
  assert.match(adminPage([]), /No notes yet/);
});

test('the worker sends everything else to the static files, and wrangler runs it only for /api and /admin', async () => {
  const seen = [];
  const res = await worker.fetch(new Request('https://playnexus.dev/index.html'), { ASSETS: { fetch: async (r) => { seen.push(r.url); return new Response('page'); } } });
  assert.equal(await res.text(), 'page');
  assert.deepEqual(seen, ['https://playnexus.dev/index.html']);
  const cfg = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(cfg, /"main": "worker\/index\.js"/);
  assert.match(cfg, /"run_worker_first": \["\/api\/\*", "\/admin\/\*"\]/);
});
