# Deploying Nexus (playnexus.dev)

Nexus is a static site: no server, no build step for the game itself, no network calls after load. Production is **Cloudflare** (a Worker serving static assets, built from this repo), serving **playnexus.dev**.

## What the repo provides

- `scripts/build-site.mjs` copies the files the browser needs into `dist/` and leaves out `tests/`, `docs/`, `scripts/`, `package.json`, the markdown files and repo tooling. It bundles nothing: every file keeps its path. Our own JS and CSS (`src/`, `css/`) are then minified file by file with esbuild, the one dev dependency (`npm ci` installs it; the game itself never loads it). Without esbuild the files are copied as they are, with a warning in the build log; `--no-minify` does the same on purpose (`node scripts/build-site.mjs [outDir] [--no-minify]`). The build log line `minified src/ and css/: X KB -> Y KB` shows it ran. New top-level folders are published by default; add a name to `EXCLUDE` in that script to keep one out.
- `_headers` sets `nosniff`, a referrer policy and a locked-down permissions policy on every response, and a one-week cache on the fonts. Code is not fingerprinted, so the page, `src/*` and `css/*` are sent `Cache-Control: no-cache`: the browser asks on every load and gets a 304 when nothing changed, so a new `index.html` never runs beside an old module. The `?v=` on the `main.js` script tag in `index.html` (from `src/version.js`, kept in step by a test) is an extra bust for the entry file only. **Bump `src/version.js` (and `package.json`, and the `?v=` in `index.html`) when promoting a release to `main`**, so returning players fetch the new entry even past an old cache.
- Locally, `scripts/serve.py` (what `refresh.sh` and `refresh.ps1` start) sends `no-store` on everything. A browser that cached files from an older plain `http.server` can still hold them once: a hard refresh (Cmd+Shift+R, Ctrl+Shift+R) clears it for good.
- `wrangler.jsonc` tells `wrangler deploy` to publish `dist/`.
- `404.html` is a small paper card, returned with a real 404 for missing files instead of serving `index.html` for every unknown path.
- `tests/site-build.test.js` runs the build and checks that every file the pages load is in the output.

## Cloudflare settings (Workers Builds with static assets)

`wrangler.jsonc` points Workers static assets at `dist/` (no worker script) and serves `404.html` for missing paths. In the Cloudflare dashboard (Workers & Pages > the `nexus` project > Settings > Builds):

| Setting | Value |
| --- | --- |
| Git repository | `FreezingShock/Nexus` |
| Production branch | `main` |
| Build command | `npm ci && node scripts/build-site.mjs` (Workers Builds also installs from `package-lock.json` on its own; the `npm ci` makes sure) |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |
| API token | a valid token for the build (use **Create new token** if it says unavailable) |

The project name in the dashboard must match `name` in `wrangler.jsonc` (`nexus`). A Pages project would also work (build command the same, output directory `dist`, no deploy command, and `wrangler.jsonc` would not be used), but Cloudflare is steering new projects to Workers, so this setup uses that.

## Branches and deploys

Only pushes to `main` change playnexus.dev. nate promotes `integration` into `main` with a merge commit (see CONTRIBUTING.md), and that merge is the release. Other branches are built by Workers Builds too (the Previews tab of the build settings has its own commands), but only the production branch updates the live site.

## Custom domain

Because playnexus.dev is a zone on the same Cloudflare account, adding it under the Worker's Settings > Domains & Routes > Add > Custom domain creates the DNS record and certificate. `.dev` is on the HSTS preload list, so browsers only ever use HTTPS there; Cloudflare issues the certificate automatically. For `www.playnexus.dev`, add it as a second custom domain and, if wanted, a redirect rule to the apex.
