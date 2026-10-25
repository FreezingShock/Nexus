import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The static-hosting build (scripts/build-site.mjs, see docs/DEPLOY.md) copies the repo minus tests and tooling.
// This checks that everything the page loads is still in the output, so a new top-level folder that the page
// needs is not left out of the deploy by mistake.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// With no argument the script writes to dist/ inside the repo, as the host's build does; that case once failed
// because Node cannot copy a folder into its own subfolder.
test('site build keeps everything the pages load and leaves out tests and tooling', () => {
  const out = join(ROOT, 'dist');
  try {
    execFileSync('node', [join(ROOT, 'scripts/build-site.mjs')], { stdio: 'pipe' });
    for (const f of ['index.html', 'kit.html', '404.html', '_headers', 'src/main.js', 'vendor/three/three.module.min.js']) {
      assert.ok(existsSync(join(out, f)), `${f} is in the build`);
    }
    for (const f of ['tests', 'scripts', 'docs', 'package.json', 'wrangler.jsonc', '.git', '.github']) {
      assert.ok(!existsSync(join(out, f)), `${f} is not in the build`);
    }
    for (const page of ['index.html', 'kit.html']) {
      const html = readFileSync(join(out, page), 'utf8');
      const refs = [...html.matchAll(/<(?:link|script)[^>]*?(?:href|src)="([^"#]+)"/g)].map((m) => m[1].split('?')[0])
        .filter((r) => !r.startsWith('data:') && !/^https?:/.test(r));
      assert.deepEqual(refs.filter((r) => !existsSync(join(out, r))), [], `${page} references`);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

// A new index.html beside an old cached module breaks the page (it happened twice on localhost), so nothing that runs is
// ever reused without asking: the dev server sends no-store, the live site no-cache on the page, modules and styles.
test('code is never reused from a stale cache, locally or on the live site', () => {
  const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const serve = read('scripts/serve.py');
  assert.match(serve, /Cache-Control', 'no-store/);
  assert.match(serve, /Clear-Site-Data', '"cache"'/, 'the page drops old cached modules, never the saves');
  assert.doesNotMatch(serve, /"storage"|"\*"|"cookies"/);
  const headers = read('_headers');
  for (const path of ['/', '/index.html', '/src/*', '/css/*']) {
    assert.match(headers, new RegExp('^' + path.replace(/[*/.]/g, '\\$&') + '\\n  Cache-Control: no-cache$', 'm'), path);
  }
  assert.match(headers, /^\/vendor\/fonts\/\*\n  Cache-Control: public, max-age=604800$/m, 'fonts may stay a week');
});
