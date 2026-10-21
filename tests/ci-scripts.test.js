import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Exercises scripts/ci-merge.sh and scripts/ci-dry-merge.sh against a throwaway repository, the same way the
// workflows run them. Nothing here touches GitHub.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MERGE = join(ROOT, 'scripts', 'ci-merge.sh');
const DRY = join(ROOT, 'scripts', 'ci-dry-merge.sh');
const REGISTRY = join(ROOT, 'scripts', 'gen-registry.mjs');
const DIRS = ['src/sim/systems', 'src/render/systems', 'src/ui/modules'];

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// A repo like Nexus: integration checked out, the three registry folders with one module each.
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'nexus-ci-'));
  git(dir, 'init', '-q', '-b', 'integration');
  git(dir, 'config', 'user.name', 'test');
  git(dir, 'config', 'user.email', 'test@example.com');
  writeFileSync(join(dir, 'a.txt'), 'one\ntwo\n');
  for (const d of DIRS) {
    mkdirSync(join(dir, d), { recursive: true });
    writeFileSync(join(dir, d, 'base.js'), 'export default { id: "base" };\n');
  }
  execFileSync('node', [REGISTRY, '--root', dir]);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'base');
  return dir;
}

function commitFile(dir, file, content, msg) {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), content);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', msg);
}

function withRepo(fn) {
  const dir = makeRepo();
  try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const runMerge = (dir, ref) => spawnSync('sh', [MERGE, ref, `merge ${ref}`], {
  cwd: dir,
  env: { ...process.env, TOOLS: ROOT },
  encoding: 'utf8',
});

test('dry merge says clean when the branches touch different files', () => withRepo((dir) => {
  git(dir, 'checkout', '-qb', 'pr');
  commitFile(dir, 'b.txt', 'pr\n', 'pr');
  git(dir, 'checkout', '-q', 'integration');
  commitFile(dir, 'c.txt', 'int\n', 'int');
  assert.equal(execFileSync('sh', [DRY, 'pr', 'integration'], { cwd: dir, encoding: 'utf8' }).trim(), 'clean');
}));

test('dry merge names real conflicts and does not change the checkout', () => withRepo((dir) => {
  git(dir, 'checkout', '-qb', 'pr');
  commitFile(dir, 'a.txt', 'one\npr\n', 'pr');
  git(dir, 'checkout', '-q', 'integration');
  commitFile(dir, 'a.txt', 'one\nint\n', 'int');
  const before = git(dir, 'rev-parse', 'HEAD');
  const out = execFileSync('sh', [DRY, 'pr', 'integration'], { cwd: dir, encoding: 'utf8' }).trim();
  assert.equal(out, 'conflict a.txt');
  assert.equal(git(dir, 'rev-parse', 'HEAD'), before);
  assert.equal(git(dir, 'status', '--porcelain'), '');
}));

test('dry merge reports registry-only conflicts as registry', () => withRepo((dir) => {
  git(dir, 'checkout', '-qb', 'pr');
  commitFile(dir, 'src/sim/systems/pr-feature.js', 'export default { id: "pr" };\n', 'pr module');
  execFileSync('node', [REGISTRY, '--root', dir]);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'pr registry');
  git(dir, 'checkout', '-q', 'integration');
  commitFile(dir, 'src/sim/systems/int-feature.js', 'export default { id: "int" };\n', 'int module');
  execFileSync('node', [REGISTRY, '--root', dir]);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'int registry');
  assert.equal(execFileSync('sh', [DRY, 'pr', 'integration'], { cwd: dir, encoding: 'utf8' }).trim(), 'registry');
}));

test('ci-merge merges a clean branch with a merge commit', () => withRepo((dir) => {
  git(dir, 'checkout', '-qb', 'pr');
  commitFile(dir, 'b.txt', 'pr\n', 'pr');
  git(dir, 'checkout', '-q', 'integration');
  const res = runMerge(dir, 'pr');
  assert.equal(res.status, 0, res.stderr);
  assert.equal(git(dir, 'rev-list', '--parents', '-n', '1', 'HEAD').split(' ').length, 3);
  assert.ok(existsSync(join(dir, 'b.txt')));
}));

test('ci-merge regenerates both sides of a registry conflict and finishes the merge', () => withRepo((dir) => {
  git(dir, 'checkout', '-qb', 'pr');
  commitFile(dir, 'src/sim/systems/pr-feature.js', 'export default { id: "pr" };\n', 'pr module');
  execFileSync('node', [REGISTRY, '--root', dir]);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'pr registry');
  git(dir, 'checkout', '-q', 'integration');
  commitFile(dir, 'src/sim/systems/int-feature.js', 'export default { id: "int" };\n', 'int module');
  execFileSync('node', [REGISTRY, '--root', dir]);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'int registry');
  const res = runMerge(dir, 'pr');
  assert.equal(res.status, 0, res.stderr + res.stdout);
  const index = readFileSync(join(dir, 'src/sim/systems/index.js'), 'utf8');
  assert.match(index, /prFeature/);
  assert.match(index, /intFeature/);
  assert.equal(execFileSync('node', [REGISTRY, '--root', dir, '--check'], { encoding: 'utf8' }).length, 0);
}));

test('ci-merge leaves integration alone and lists the files on a real conflict', () => withRepo((dir) => {
  git(dir, 'checkout', '-qb', 'pr');
  commitFile(dir, 'a.txt', 'one\npr\n', 'pr');
  git(dir, 'checkout', '-q', 'integration');
  commitFile(dir, 'a.txt', 'one\nint\n', 'int');
  const before = git(dir, 'rev-parse', 'HEAD');
  const res = runMerge(dir, 'pr');
  assert.equal(res.status, 10);
  assert.equal(readFileSync(join(dir, 'conflicts.txt'), 'utf8').trim(), 'a.txt');
  assert.equal(git(dir, 'rev-parse', 'HEAD'), before);
  assert.equal(existsSync(join(dir, '.git/MERGE_HEAD')), false);
}));
