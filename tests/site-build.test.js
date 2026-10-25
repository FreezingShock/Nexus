import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The static-hosting build (scripts/build-site.mjs, see docs/DEPLOY.md) copies the repo minus tests and tooling.
// This checks that everything the page loads is still in the output, so a new top-level folder that the page
// needs is not left out of the deploy by mistake.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('site build keeps everything the pages load and leaves out tests and tooling', () => {
  const out = mkdtempSync(join(tmpdir(), 'nexus-site-'));
  try {
    execFileSync('node', [join(ROOT, 'scripts/build-site.mjs'), out], { stdio: 'pipe' });
    for (const f of ['index.html', 'kit.html', '404.html', '_headers', 'src/main.js', 'vendor/three/three.module.min.js']) {
      assert.ok(existsSync(join(out, f)), `${f} is in the build`);
    }
    for (const f of ['tests', 'scripts', 'docs', 'package.json', '.git', '.github']) {
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
