# Deploying Nexus (playnexus.dev)

Nexus is a static site: no server, no build step for the game itself, no network calls after load. Production is **Cloudflare Pages** connected to this repo, serving **playnexus.dev**.

## What the repo provides

- `scripts/build-site.mjs` copies the files the browser needs into `dist/` and leaves out `tests/`, `docs/`, `scripts/`, `package.json`, the markdown files and repo tooling. It changes nothing and bundles nothing (`node scripts/build-site.mjs [outDir]`). New top-level folders are published by default; add a name to `EXCLUDE` in that script to keep one out.
- `_headers` sets `nosniff`, a referrer policy and a locked-down permissions policy on every response, and a one-week cache on the fonts. Code is not fingerprinted, so it keeps Cloudflare's default of revalidating on each load. The `?v=` on the `main.js` script tag in `index.html` (from `src/version.js`) is a manual cache-bust for the entry file only; its imports and the stylesheets rely on revalidation.
- `404.html` is a small paper card. With it present, Pages returns a real 404 for missing files instead of serving `index.html` for every unknown path.
- `tests/site-build.test.js` runs the build and checks that every file the pages load is in the output.

## Cloudflare Pages settings

| Setting | Value |
| --- | --- |
| Source | GitHub repo `FreezingShock/Nexus` |
| Production branch | `main` |
| Framework preset | None |
| Build command | `node scripts/build-site.mjs` |
| Build output directory | `dist` |
| Root directory | leave empty |
| Environment variables | none needed (Pages ships Node 18 or newer, which the script supports) |

Leaving the build command empty and the output directory as `/` also works; it publishes tests and docs next to the game, which is harmless but untidy.

## Branches and deploys

Only pushes to `main` change playnexus.dev. nate promotes `integration` into `main` with a merge commit (see CONTRIBUTING.md), and that merge is the release. Other branches get a preview deployment at `<branch>.<project>.pages.dev`, so `integration` has its own live preview URL. If previews for every PR branch get noisy, turn them down in the project's Settings > Builds > Branch control to `integration` only.

## Custom domain

Because playnexus.dev is a zone on the same Cloudflare account, adding it under the project's Custom domains tab creates the DNS record and certificate. `.dev` is on the HSTS preload list, so browsers only ever use HTTPS there; Cloudflare issues the certificate automatically. For `www.playnexus.dev`, add it as a second custom domain and, if wanted, a redirect rule to the apex.
