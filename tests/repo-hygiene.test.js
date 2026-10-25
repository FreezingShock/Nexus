import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Catches the mistakes that parallel threads make when a merge goes through: leftover conflict markers in text files
// (shared files use `merge=union` in .gitattributes, so a bad merge would not stop git), and a stylesheet link in
// index.html that points at a file that was never added.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEXT = new Set(['.js', '.mjs', '.html', '.css', '.md', '.json', '.sh', '.yml', '.txt', '.gitattributes']);
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

test('no conflict markers in tracked text files', () => {
  const marker = /^(<{7}|={7}|>{7})(\s|$)/m;
  const hits = tracked.filter((f) => TEXT.has(extname(f)) || f === '.gitattributes')
    .filter((f) => marker.test(readFileSync(join(ROOT, f), 'utf8')));
  assert.deepEqual(hits, []);
});

test('every stylesheet and script that index.html loads exists', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g), ...html.matchAll(/<script[^>]* src="([^"]+)"/g)]
    .map((m) => m[1].split('?')[0]);
  assert.ok(refs.length > 0);
  const missing = refs.filter((r) => !existsSync(join(ROOT, r)));
  assert.deepEqual(missing, []);
});
