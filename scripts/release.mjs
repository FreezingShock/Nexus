// Cuts a release: folds release-notes/*.json into a new newest entry in src/changelog.js and bumps the version in
// src/version.js, package.json and the ?v= in index.html. Usage: node scripts/release.mjs 0.16.0 "Name" "Blurb." [YYYY-MM-DD]
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(ROOT, 'release-notes');
const [version, name, blurb, date = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version || '') || !name || !blurb) {
  console.error('usage: node scripts/release.mjs <x.y.z> "<name>" "<blurb>" [YYYY-MM-DD]');
  process.exit(1);
}
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
const items = files.flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
if (!items.length) { console.error('no release notes to fold'); process.exit(1); }

const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const line = (i) => `      { k: ${q(i.k)}, t: ${q(i.t)}${i.pr ? `, pr: ${i.pr}` : ''} },`;
const entry = `  {\n    v: ${q(version)}, date: ${q(date)}, name: ${q(name)},\n    blurb: ${q(blurb)},\n    items: [\n${items.map(line).join('\n')}\n    ],\n  },\n`;

const edit = (file, fn) => { const p = join(ROOT, file), s = readFileSync(p, 'utf8'), out = fn(s); if (out === s) throw new Error('no change in ' + file); writeFileSync(p, out); };
edit('src/changelog.js', (s) => s.replace('export const CHANGELOG = [\n', 'export const CHANGELOG = [\n' + entry));
edit('src/version.js', (s) => s.replace(/VERSION = '[^']+'/, `VERSION = '${version}'`));
edit('package.json', (s) => s.replace(/"version": "[^"]+"/, `"version": "${version}"`));
edit('index.html', (s) => s.replace(/src\/main\.js\?v=[^"]+/, `src/main.js?v=${version}`));
for (const f of files) unlinkSync(join(dir, f));
console.log(`Release ${version}: folded ${items.length} lines from ${files.length} files. Run npm test, then commit.`);
