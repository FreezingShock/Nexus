// Player feedback: the one network call Nexus ever makes, and only when a player presses Send in the feedback box.
// Nothing is fetched on load and the game never waits on it. A note that cannot go (offline, server busy) waits in a small
// outbox in localStorage and is tried again on a later visit or when the browser comes back online. The live site's
// receiver is worker/index.js (Cloudflare D1); scripts/serve.py stands in for it on localhost. See docs/FEEDBACK.md.
import { VERSION } from '../version.js';

export const FEEDBACK_URL = '/api/feedback';
export const OUTBOX_KEY = 'nexus.feedback.outbox.v1';
export const FEEDBACK_KINDS = ['idea', 'bug', 'other'];
export const LIMITS = { message: 1000, name: 40, outbox: 10 };

// Trims and caps what the player typed. `website` is the hidden honeypot field: people never see it, form-filling bots do.
export function cleanNote({ kind, message, name, website } = {}) {
  const text = String(message ?? '').trim().slice(0, LIMITS.message);
  if (!text) return { ok: false, error: 'empty' };
  return {
    ok: true,
    note: {
      kind: FEEDBACK_KINDS.includes(kind) ? kind : 'other',
      message: text,
      name: String(name ?? '').trim().slice(0, LIMITS.name),
      website: String(website ?? '').slice(0, 100),
      version: VERSION,
    },
  };
}

// send(note) resolves to 'sent', 'queued' (kept for later), 'busy' (too many at once, try in a while) or 'rejected'.
export function createOutbox({ storage = null, fetchFn = null, url = FEEDBACK_URL, timeoutMs = 8000 } = {}) {
  const read = () => {
    try { const q = JSON.parse((storage && storage.getItem(OUTBOX_KEY)) || '[]'); return Array.isArray(q) ? q : []; } catch { return []; }
  };
  const write = (q) => {
    try { if (storage) { if (q.length) storage.setItem(OUTBOX_KEY, JSON.stringify(q)); else storage.removeItem(OUTBOX_KEY); } } catch { /* kept for this visit only */ }
  };
  const keep = (note) => write([...read(), note].slice(-LIMITS.outbox));

  async function post(note) {
    if (!fetchFn) return 'offline';
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const res = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(note), signal: ctl?.signal });
      if (res.ok) return 'sent';
      if (res.status === 429) return 'busy';
      return res.status >= 400 && res.status < 500 && res.status !== 404 && res.status !== 408 ? 'rejected' : 'offline';
    } catch {
      return 'offline';
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  let flushing = false;
  return {
    pending: () => read().length,
    async send(note) {
      const r = await post(note);
      if (r === 'offline') { keep(note); return 'queued'; }
      return r;
    },
    // Tries the waiting notes in order and stops at the first that still cannot go.
    async flush() {
      if (flushing) return 0;
      flushing = true;
      let sent = 0;
      try {
        for (let q = read(); q.length; q = read()) {
          const r = await post(q[0]);
          if (r === 'offline' || r === 'busy') break;
          write(read().slice(1));
          if (r === 'sent') sent++;
        }
      } finally { flushing = false; }
      return sent;
    },
  };
}
