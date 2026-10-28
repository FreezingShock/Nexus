// Feature PRs leave release notes as files under release-notes/; scripts/release.mjs folds them into the changelog.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS } from '../src/changelog.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const noteFiles = () => readdirSync(join(ROOT, 'release-notes')).filter((f) => f.endsWith('.json'));

test('pending release notes are well-formed lines', () => {
  for (const f of noteFiles()) {
    const lines = JSON.parse(readFileSync(join(ROOT, 'release-notes', f), 'utf8'));
    assert.ok(Array.isArray(lines) && lines.length > 0, f);
    for (const i of lines) {
      assert.ok(KINDS[i.k], f + ': unknown kind ' + i.k);
      assert.ok(i.t.length > 10 && /[.!]$/.test(i.t), f + ': ' + i.t);
      if ('pr' in i) assert.ok(Number.isInteger(i.pr) && i.pr > 0, f);
    }
  }
});

test('index.html is not union-merged, so overlapping edits become real conflicts', () => {
  const attrs = readFileSync(join(ROOT, '.gitattributes'), 'utf8').split('\n');
  assert.ok(!attrs.some((l) => /^index\.html\s+merge=union/.test(l)));
});

test('release.mjs folds notes into a new newest entry and bumps every version', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'nexus-release-'));
  for (const f of ['src/changelog.js', 'src/version.js', 'package.json', 'index.html']) {
    mkdirSync(dirname(join(tmp, f)), { recursive: true });
    cpSync(join(ROOT, f), join(tmp, f));
  }
  mkdirSync(join(tmp, 'scripts')); cpSync(join(ROOT, 'scripts/release.mjs'), join(tmp, 'scripts/release.mjs'));
  mkdirSync(join(tmp, 'release-notes'));
  writeFileSync(join(tmp, 'release-notes/a.json'), JSON.stringify([{ k: 'new', t: 'A new little thing for players.', pr: 7 }]));
  execFileSync('node', [join(tmp, 'scripts/release.mjs'), '9.9.9', "It's a test", 'A blurb.', '2030-01-02'], { cwd: tmp });
  assert.match(readFileSync(join(tmp, 'src/version.js'), 'utf8'), /VERSION = '9\.9\.9'/);
  assert.match(readFileSync(join(tmp, 'package.json'), 'utf8'), /"version": "9\.9\.9"/);
  assert.match(readFileSync(join(tmp, 'index.html'), 'utf8'), /src\/main\.js\?v=9\.9\.9/);
  assert.ok(!existsSync(join(tmp, 'release-notes/a.json')));
  assert.match(readFileSync(join(tmp, 'src/changelog.js'), 'utf8'), /CHANGELOG = \[\n  \{\n    v: '9\.9\.9', date: '2030-01-02', name: 'It\\'s a test'[\s\S]*pr: 7 \}/);
});
