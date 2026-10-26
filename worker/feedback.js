// Feedback from players: POST /api/feedback stores a note in D1 (binding FEEDBACK_DB), GET /admin/feedback lists them
// behind a password (secret FEEDBACK_ADMIN_KEY). Written for Cloudflare Workers; the tests run it in Node with a fake D1.
// Guards: same-origin posts only, a 4 KB body cap, trimmed and capped fields, a honeypot field, 5 notes per visitor per
// 10 minutes and 300 per hour for the whole site. Visitors are kept apart by a salted hash of their address, never the
// address itself.

export const KINDS = ['idea', 'bug', 'other'];
export const CAPS = { body: 4096, message: 1000, name: 40, version: 20 };
export const RATE = { perVisitor: 5, visitorWindowMs: 10 * 60e3, perHour: 300 };

export const SCHEMA = `CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  name TEXT,
  version TEXT,
  visitor TEXT NOT NULL
)`;
const INDEX = 'CREATE INDEX IF NOT EXISTS feedback_visitor ON feedback (visitor, created_at)';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

let ready = null;
async function ensureTable(db) {
  if (!ready) ready = db.batch([db.prepare(SCHEMA), db.prepare(INDEX)]).catch((e) => { ready = null; throw e; });
  return ready;
}
export function resetForTests() { ready = null; }

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, n);

// Pure: what a request body turns into, or why it is refused.
export function readNote(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'bad' };
  if (body.website) return { trap: true };
  const message = clip(body.message, CAPS.message);
  if (!message) return { error: 'empty' };
  return {
    note: {
      kind: KINDS.includes(body.kind) ? body.kind : 'other',
      message,
      name: clip(body.name, CAPS.name) || null,
      version: clip(body.version, CAPS.version) || null,
    },
  };
}

export async function handleFeedback(request, env, now = Date.now()) {
  if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  const url = new URL(request.url), origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return json({ ok: false, error: 'origin' }, 403);
  if (!env.FEEDBACK_DB) return json({ ok: false, error: 'not set up' }, 503); // the box keeps the note and tries later
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > CAPS.body) return json({ ok: false, error: 'too long' }, 413);
  let text;
  try { text = await request.text(); } catch { return json({ ok: false, error: 'bad' }, 400); }
  if (text.length > CAPS.body) return json({ ok: false, error: 'too long' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ ok: false, error: 'bad' }, 400); }
  const r = readNote(body);
  if (r.trap) return json({ ok: true }); // looks sent to a bot, stored nowhere
  if (r.error) return json({ ok: false, error: r.error }, 400);

  const db = env.FEEDBACK_DB;
  await ensureTable(db);
  const day = new Date(now).toISOString().slice(0, 10);
  const visitor = (await sha256(`${env.FEEDBACK_SALT || 'nexus'}|${day}|${request.headers.get('CF-Connecting-IP') || 'unknown'}`)).slice(0, 32);
  const since = new Date(now - RATE.visitorWindowMs).toISOString(), hourAgo = new Date(now - 3600e3).toISOString();
  const [mine, all] = await db.batch([
    db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE visitor = ? AND created_at > ?').bind(visitor, since),
    db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE created_at > ?').bind(hourAgo),
  ]);
  const count = (res) => Number(res?.results?.[0]?.n || 0);
  if (count(mine) >= RATE.perVisitor || count(all) >= RATE.perHour) return json({ ok: false, error: 'busy' }, 429);

  const { kind, message, name, version } = r.note;
  await db.prepare('INSERT INTO feedback (created_at, kind, message, name, version, visitor) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(new Date(now).toISOString(), kind, message, name, version, visitor).run();
  return json({ ok: true });
}

// ---- the private reading page

function sameText(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function passwordFrom(request) {
  const h = request.headers.get('Authorization') || '';
  if (!h.startsWith('Basic ')) return null;
  try { const s = atob(h.slice(6)); return s.slice(s.indexOf(':') + 1); } catch { return null; }
}

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PRIVATE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" };

export async function handleAdmin(request, env) {
  if (!env.FEEDBACK_ADMIN_KEY) return new Response('Not found', { status: 404 });
  const pass = passwordFrom(request);
  if (pass === null || !sameText(await sha256(pass), await sha256(env.FEEDBACK_ADMIN_KEY))) {
    return new Response('Sign in to read feedback', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Nexus feedback", charset="UTF-8"', ...PRIVATE } });
  }
  if (!env.FEEDBACK_DB) return new Response('The FEEDBACK_DB database is not bound yet (docs/FEEDBACK.md).', { status: 503, headers: PRIVATE });
  await ensureTable(env.FEEDBACK_DB);
  const url = new URL(request.url), kind = url.searchParams.get('kind');
  const filter = KINDS.includes(kind) ? kind : null;
  const stmt = filter
    ? env.FEEDBACK_DB.prepare('SELECT id, created_at, kind, message, name, version FROM feedback WHERE kind = ? ORDER BY id DESC LIMIT 500').bind(filter)
    : env.FEEDBACK_DB.prepare('SELECT id, created_at, kind, message, name, version FROM feedback ORDER BY id DESC LIMIT 500');
  const rows = (await stmt.all()).results || [];
  if (url.searchParams.get('format') === 'csv') {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['id,created_at,kind,name,version,message', ...rows.map((r) => [r.id, r.created_at, r.kind, r.name, r.version, r.message].map(cell).join(','))].join('\n');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="nexus-feedback.csv"', ...PRIVATE } });
  }
  return new Response(adminPage(rows, filter), { headers: { 'Content-Type': 'text/html; charset=utf-8', ...PRIVATE } });
}

const KIND_LOOK = { idea: ['Idea', '#F2D27A'], bug: ['Bug', '#E3A08E'], other: ['Hello', '#C9DDB8'] };

export function adminPage(rows, filter = null) {
  const tabs = [['', 'All'], ...KINDS.map((k) => [k, KIND_LOOK[k][0]])]
    .map(([k, label]) => `<a href="?${k ? 'kind=' + k : ''}"${(filter || '') === k ? ' class="on"' : ''}>${label}</a>`).join('');
  const items = rows.map((r) => {
    const [label, c] = KIND_LOOK[r.kind] || KIND_LOOK.other;
    return `<li><header><span class="k" style="background:${c}">${label}</span><b>${esc(r.name || 'Anonymous mayor')}</b><time>${esc(String(r.created_at).replace('T', ' ').slice(0, 16))} UTC</time>${r.version ? `<small>v${esc(r.version)}</small>` : ''}</header><p>${esc(r.message)}</p></li>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Feedback · Nexus</title>
<style>
body{margin:0;background:#B9C79A;font:15px/1.5 system-ui,sans-serif;color:#2B2620}
main{max-width:760px;margin:24px auto;padding:0 16px}
h1{font:700 30px/1.1 Georgia,serif;margin:0 0 4px}.sub{margin:0 0 14px;color:#5A4D3F}
nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}nav a{padding:5px 12px;border:2px solid #2B2620;border-radius:10px;background:#FBF6EA;color:#2B2620;text-decoration:none;font-weight:700}nav a.on{background:#E6BC62}nav a.csv{margin-left:auto}
ul{list-style:none;margin:0;padding:0;display:grid;gap:12px}
li{background:#FBF6EA;border:2.5px solid #2B2620;border-radius:14px;box-shadow:0 4px 0 #2B2620;padding:12px 16px}
header{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:13px}header time,header small{color:#5A4D3F}header time{margin-left:auto}
.k{padding:1px 8px;border:1.5px solid #2B2620;border-radius:8px;font-weight:700}
p{margin:8px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}.empty{text-align:center;padding:28px}
</style></head><body><main><h1>Feedback</h1><p class="sub">${rows.length} note${rows.length === 1 ? '' : 's'}, newest first${rows.length === 500 ? ' (the latest 500)' : ''}.</p>
<nav>${tabs}<a class="csv" href="?${filter ? 'kind=' + filter + '&' : ''}format=csv">Download CSV</a></nav>
${rows.length ? `<ul>${items}</ul>` : '<ul><li class="empty">No notes yet.</li></ul>'}</main></body></html>`;
}
