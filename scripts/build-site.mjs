// Copies the files the browser needs into dist/ for static hosting (Cloudflare: build command
// `node scripts/build-site.mjs`, then `npx wrangler deploy`, which serves dist/ per wrangler.jsonc). It leaves out
// tests, docs, scripts and repo tooling, then minifies our own JS and CSS file by file with esbuild (a dev dependency,
// build only). Nothing is bundled: every module keeps its path, so the page loads exactly what localhost loads.
// vendor/ is copied as it is. Without esbuild installed the files are copied unminified, with a warning.
// Usage: node scripts/build-site.mjs [outDir] [--no-minify]
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const OUT = resolve(args.find((a) => !a.startsWith('--')) || join(ROOT, 'dist'));
const MINIFY_DIRS = ['src', 'css']; // our own code; vendor/three is already minified

// Top-level names that are not part of the site. Everything else at the root is published.
export const EXCLUDE = new Set([
  '.git', '.github', '.gitattributes', '.gitignore', 'node_modules', 'dist',
  'tests', 'scripts', 'docs', 'worker', 'feedback-local.jsonl', 'package.json', 'package-lock.json', 'wrangler.jsonc', '.wrangler', 'README.md', 'CONTRIBUTING.md',
]);

if (OUT === ROOT || ROOT.startsWith(OUT + '/')) throw new Error('outDir must be a separate folder');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
// Entry by entry: Node refuses to copy the repo root into a folder inside itself, which is where dist/ lives.
for (const name of readdirSync(ROOT)) {
  if (!EXCLUDE.has(name)) cpSync(join(ROOT, name), join(OUT, name), { recursive: true });
}
if (!existsSync(join(OUT, 'index.html'))) throw new Error('index.html missing from the output');
if (!args.includes('--no-minify')) await minify();
console.log(`site written to ${OUT}`);

function filesIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? filesIn(p) : [p]; });
}

// Each file on its own: whitespace, comments and local names go; import and export names stay, so modules still meet.
// Nothing in src/ reads a function or class name at run time (tests/site-build.test.js imports minified modules).
async function minify() {
  let esbuild;
  try { esbuild = await import('esbuild'); } catch {
    console.warn('esbuild is not installed (npm ci): the site is copied unminified');
    return;
  }
  let before = 0, after = 0;
  for (const f of MINIFY_DIRS.flatMap((d) => filesIn(join(OUT, d)))) {
    const ext = extname(f);
    if (ext !== '.js' && ext !== '.css') continue;
    const src = readFileSync(f, 'utf8');
    const out = await esbuild.transform(src, {
      loader: ext.slice(1), minify: true, legalComments: 'none', charset: 'utf8',
      ...(ext === '.js' ? { format: 'esm', target: 'es2022' } : { target: ['chrome100', 'firefox100', 'safari15'] }),
    });
    writeFileSync(f, out.code);
    before += src.length; after += out.code.length;
  }
  console.log(`minified src/ and css/: ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`);
}
