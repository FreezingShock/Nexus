# Player feedback

The title screen has an **Ideas & feedback** tab in its bottom-right corner. It unfolds into a note where a player picks a kind (Idea, Bug, Hello), writes up to 1000 characters and may add a name (up to 40). No email or account is asked for.

## The one network exception

Nexus makes no network calls after load, with **one exception nate chose on 2026-10-26**: when a player presses **Send**, the note is posted to `/api/feedback` on the same site. Nothing is fetched on load, and the game never waits on it.

- Offline, or the server is down or not set up yet: the note waits in a small outbox in `localStorage` (`nexus.feedback.outbox.v1`, at most 10 notes) and is tried again a few seconds into a later visit, or when the browser comes back online. A visit with an empty outbox sends nothing.
- Code: `src/core/feedback-send.js` (the only `fetch` in the game), `src/ui/feedback-box.js`, `css/feedback-box.css`. Tests: `tests/feedback-box.test.js`, `tests/worker-feedback.test.js`.
- On localhost, `scripts/serve.py` answers `/api/feedback` itself and appends notes to `feedback-local.jsonl` next to `index.html` (git ignores it), so the box can be tried without Cloudflare.

## The receiver (Cloudflare)

`worker/index.js` is a small Worker script beside the static files. `wrangler.jsonc` runs it only for `/api/*` and `/admin/*` (`run_worker_first`); every other request is served from `dist/` exactly as before. `worker/feedback.js`:

- `POST /api/feedback` stores the note in **D1** (binding `FEEDBACK_DB`, table `feedback`, created automatically on first use).
- Guards: posts from other sites are refused, bodies over 4 KB are refused, fields are trimmed and capped, a hidden honeypot field (`website`) makes bots think they succeeded while nothing is stored, and at most 5 notes per visitor per 10 minutes and 300 per hour site-wide (429 after that).
- Visitors are told apart by a salted SHA-256 of their IP address and the date, never the address itself. Optionally set a `FEEDBACK_SALT` secret.
- Until the database is bound the route answers 503, and notes wait in players' browsers.

## Reading feedback

1. **Dashboard:** Workers & Pages > D1 > `nexus-feedback` > Explore Data (or Console: `SELECT * FROM feedback ORDER BY id DESC`).
2. **Private page:** `https://playnexus.dev/admin/feedback`. The browser asks for a name and password: any name, and the password is the `FEEDBACK_ADMIN_KEY` secret. Filter by kind, or **Download CSV**. Without that secret the page does not exist (404).

## One-time setup (nate, in the Cloudflare dashboard)

1. **Create the database:** Storage & Databases > D1 SQL Database > Create > name `nexus-feedback` > Create. Copy its **Database ID**.
2. **Bind it in the repo:** done 2026-10-27 (`d1_databases` in `wrangler.jsonc`, binding `FEEDBACK_DB`). For a new database, edit that entry:
   `,"d1_databases": [{ "binding": "FEEDBACK_DB", "database_name": "nexus-feedback", "database_id": "<that id>" }]`
   (or send Claude the ID). The ID is not a secret. A binding added only in the dashboard would be dropped by the next `wrangler deploy`, so it must live in this file.
3. **Set the admin password:** Workers & Pages > `nexus` > Settings > Variables and Secrets > Add > type **Secret**, name `FEEDBACK_ADMIN_KEY`, a long password. (Secrets survive deploys.)
4. Merge to `main` as usual. After the deploy, send a test note from playnexus.dev and open `/admin/feedback`.

Free-plan D1 limits (5 GB, millions of reads a day) are far above what a feedback box needs.

## Supabase instead?

Possible (a `feedback` table with an insert-only row-level-security policy and the anon key in the page), but it adds a second service and a public key in the client, and rate limiting would need an Edge Function. Cloudflare keeps everything on the account that already serves the site.
