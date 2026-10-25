// Copies the files the browser needs into dist/ for static hosting (Cloudflare: build command
// `node scripts/build-site.mjs`, then `npx wrangler deploy`, which serves dist/ per wrangler.jsonc). Nothing is bundled or changed; it only leaves out
// tests, docs, scripts and repo tooling. Usage: node scripts/build-site.mjs [outDir]
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(ROOT, 'dist'));

// Top-level names that are not part of the site. Everything else at the root is published.
export const EXCLUDE = new Set([
  '.git', '.github', '.gitattributes', '.gitignore', 'node_modules', 'dist',
  'tests', 'scripts', 'docs', 'package.json', 'package-lock.json', 'wrangler.jsonc', '.wrangler', 'README.md', 'CONTRIBUTING.md',
]);

if (OUT === ROOT || ROOT.startsWith(OUT + '/')) throw new Error('outDir must be a separate folder');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
// Entry by entry: Node refuses to copy the repo root into a folder inside itself, which is where dist/ lives.
for (const name of readdirSync(ROOT)) {
  if (!EXCLUDE.has(name)) cpSync(join(ROOT, name), join(OUT, name), { recursive: true });
}
if (!existsSync(join(OUT, 'index.html'))) throw new Error('index.html missing from the output');
console.log(`site written to ${OUT}`);
