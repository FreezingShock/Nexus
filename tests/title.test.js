import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProgress, chase, atLeast, saveLine, shotAt, TITLE_SHOTS, CURTAIN_SECS, WARM_STEPS, PLAY_STEPS, CREDITS, TIPS, tipOfTheDay } from '../src/core/boot.js';
import { VERSION } from '../src/version.js';
import { CHANGELOG } from '../src/changelog.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('the version is written once and package.json agrees', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(JSON.parse(read('package.json')).version, VERSION);
  assert.equal(CHANGELOG[0].v, VERSION);
  assert.ok(!read('src/ui/title.js').includes(VERSION), 'the title reads the version, it never writes it');
  assert.ok(read('index.html').includes('src/main.js?v=' + VERSION), 'the script URL carries the version, so a stale main.js is never reused');
});

test('load steps have unique ids and positive weights', () => {
  for (const list of [WARM_STEPS, PLAY_STEPS]) {
    assert.equal(new Set(list.map((s) => s.id)).size, list.length);
    assert.ok(list.every((s) => s.weight > 0 && s.caption.length > 0));
  }
});

test('progress only moves forward and ignores unknown or repeated steps', () => {
  const p = createProgress(PLAY_STEPS);
  assert.equal(p.fraction(), 0);
  p.begin('away'); assert.equal(p.caption(), PLAY_STEPS[0].caption);
  p.done('away'); p.done('away'); p.done('nope'); p.begin('nope');
  const f = p.fraction();
  assert.ok(f > 0 && f < 1);
  p.begin('away'); assert.equal(p.fraction(), f);
  for (const s of PLAY_STEPS) p.done(s.id);
  assert.equal(p.fraction(), 1); assert.ok(p.isDone());
  assert.equal(p.caption(), PLAY_STEPS.at(-1).caption);
});

test('progress tells its listeners, and an empty list is already done', () => {
  const p = createProgress(WARM_STEPS); let n = 0;
  p.subscribe(() => n++);
  p.begin('fonts'); p.done('fonts');
  assert.equal(n, 2);
  assert.equal(createProgress([]).fraction(), 1);
});

test('the bar chases its target without overshooting or going back', () => {
  let shown = 0;
  for (let i = 0; i < 400; i++) { const next = chase(shown, 0.6, 1 / 60); assert.ok(next >= shown && next <= 0.6); shown = next; }
  assert.equal(shown, 0.6);
  assert.equal(chase(0.8, 0.5, 0.1), 0.5 > 0.8 ? 0.5 : 0.5); // a target below the bar pulls it no further than the target
  assert.equal(chase(0.3, 0.9, 0), 0.3);
});

test('a step is held for at least its minimum time, and a failure passes through', async () => {
  let t = 1000; const waits = [];
  const wait = async (ms) => { waits.push(ms); t += ms; };
  const r = await atLeast(400, async () => { t += 100; return 7; }, wait, () => t);
  assert.equal(r, 7); assert.deepEqual(waits, [300]);
  await atLeast(400, async () => { t += 900; }, wait, () => t);
  assert.equal(waits.length, 1);
  await assert.rejects(atLeast(400, async () => { throw new Error('x'); }, wait, () => t), /x/);
});

test('the line under Play fits the save', () => {
  assert.match(saveLine('save', '3 h ago'), /3 h ago/);
  assert.match(saveLine('new', ''), /village/);
  assert.ok(CREDITS.some((c) => c.lines.join(' ').includes('FreezingShock')));
});

test('every id the title screen drives exists in index.html, and its surfaces use the shared motion', () => {
  const html = read('index.html'), js = read('src/ui/title.js') + read('src/main.js');
  const ids = new Set([...js.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map((m) => m[1]).filter((id) => /^(tt|bt)-/.test(id)));
  assert.ok(ids.size > 10);
  const sheet = read('src/ui/notebook.js').replaceAll('${p}', 'tt'); // the shared sheet, inserted by title.js
  for (const id of ids) assert.ok(html.includes('id="' + id + '"') || sheet.includes('id="' + id + '"'), id);
  assert.match(html, /<section id="title"[^>]*data-mo/);
  assert.match(html, /<section id="boot"[^>]*data-mo/);
  assert.match(html, /<body class="booting">/);
  assert.match(html, /href="css\/title\.css"/);
});

test('nothing is saved or advanced before Play, and the sim stays free of the DOM', () => {
  const main = read('src/main.js');
  assert.match(main, /if \(saveBlocked \|\| phase !== 'play'\) return;/);
  assert.match(main, /sim\.catchUp\(loaded\.savedAt\)/);
  assert.ok(main.indexOf("const alpha = sim.advance(dt)") > main.indexOf("phase === 'play'"));
  assert.ok(!/title|document/.test(read('src/core/boot.js').replace(/\/\/.*$/gm, '')));
});

test('the title camera cuts between several shots, hidden by the curtain, and repeats', () => {
  const total = TITLE_SHOTS.reduce((a, s) => a + s.secs, 0);
  assert.ok(TITLE_SHOTS.length >= 4);
  assert.ok(TITLE_SHOTS.some((s) => s.view === 'street' || s.view === 'low') && TITLE_SHOTS.some((s) => s.view === 'bird'));
  const seen = new Set();
  for (let t = 0; t < total * 2; t += 0.25) {
    const a = shotAt(t);
    assert.ok(a.curtain >= 0 && a.curtain <= 1 && a.local >= 0 && a.local < a.shot.secs);
    seen.add(a.index);
    // across every cut the curtain is (nearly) closed, so the jump is never seen
    if (a.local < 0.01 && t > 0) assert.ok(a.curtain > 0.98, 'cut at ' + t);
  }
  assert.equal(seen.size, TITLE_SHOTS.length);
  assert.equal(shotAt(total + 1).index, shotAt(1).index);
  const mid = shotAt(TITLE_SHOTS[0].secs / 2);
  assert.equal(mid.curtain, 0);
  assert.ok(CURTAIN_SECS < Math.min(...TITLE_SHOTS.map((s) => s.secs)) / 2);
});

test('before Play every HUD piece is hidden, and the pages open as a centred sheet that flips open', () => {
  const css = read('css/title.css'), html = read('index.html');
  assert.match(css, /body\.booting #app>:not\(#stage\)[^{]*\.dlabel\{[^}]*visibility:hidden/);
  const nb = read('src/ui/notebook.js'), nbCss = read('css/notebook.css');
  assert.match(nb, /id="\$\{p\}-sheet" data-mo="flip"/);
  assert.match(nb, /id="\$\{p\}-scrim" data-mo/);
  assert.match(read('css/motion.css'), /\[data-mo="flip"\]\{[^}]*--mo-r:y /);
  assert.match(nbCss, /\.nb-sheet\{position:absolute;[^}]*left:50%;top:50%/);
  assert.match(nbCss, /\.nb-sheet\[hidden\]\{[^}]*translate:-50% -50%/, 'the closed sheet stays centred while it folds away');
  assert.match(html, /css\/notebook\.css/);
  const js0 = read('src/ui/title.js');
  assert.match(js0, /createNotebook\(/, 'the title uses the shared notebook sheet');
  assert.match(js0, /title\.insertAdjacentHTML\('beforeend', notebookMarkup\('tt'\)\)/, 'the sheet sits beside the card, not inside it');
  const js = read('src/ui/title.js');
  for (const name of ['howto', 'changes', 'credits', 'settings', 'new']) assert.ok(new RegExp('\\b' + name + ': \\(\\) =>').test(js), name);
  assert.match(read('src/main.js'), /title\.failed\('Something went wrong/);
});

test('a tip a day, the same all day and cycling through every tip', () => {
  assert.equal(tipOfTheDay(new Date(2026, 9, 25, 1)), tipOfTheDay(new Date(2026, 9, 25, 23)));
  const seen = new Set();
  for (let d = 0; d < TIPS.length; d++) seen.add(tipOfTheDay(new Date(2026, 0, 1 + d)));
  assert.equal(seen.size, TIPS.length);
});

test('the author name is written once, in src/version.js, and the title screen reads it', async () => {
  const { AUTHOR, AUTHOR_HANDLE } = await import('../src/version.js');
  const { CREDITS } = await import('../src/core/boot.js');
  assert.ok(CREDITS[0].lines[0].includes(AUTHOR) && CREDITS[0].lines[0].includes(AUTHOR_HANDLE));
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, new RegExp('Made (with care )?by[^<]*' + AUTHOR), 'no name typed into index.html');
  const js = readFileSync(new URL('../src/ui/title.js', import.meta.url), 'utf8');
  assert.match(js, /\$\('tt-made'\)\.textContent = 'Made by ' \+ AUTHOR;/);
  assert.doesNotMatch(html + js, /tt-credit/, 'the corner credit is gone; the feedback box has that corner');
});

test('the progress screen picks one wording per step from a larger pool, and the real steps stay behind them', async () => {
  const { pickSteps, CAPTION_POOL } = await import('../src/core/boot.js');
  for (const s of PLAY_STEPS) assert.ok(CAPTION_POOL[s.id].length >= 5 && CAPTION_POOL[s.id][0] === s.caption, s.id);
  const lo = pickSteps(PLAY_STEPS, CAPTION_POOL, () => 0), hi = pickSteps(PLAY_STEPS, CAPTION_POOL, () => 0.999);
  assert.deepEqual(lo.map((s) => s.id), PLAY_STEPS.map((s) => s.id));
  assert.deepEqual(lo.map((s) => s.weight), PLAY_STEPS.map((s) => s.weight));
  assert.notDeepEqual(lo.map((s) => s.caption), hi.map((s) => s.caption));
  assert.deepEqual(pickSteps([{ id: 'x', caption: 'Plain', weight: 1 }])[0].caption, 'Plain');
});

test('a skip only hurries the waiting: waits end at once, and one asked early is remembered', async () => {
  const { createSkip } = await import('../src/core/boot.js');
  const skip = createSkip(() => new Promise(() => {})); // a sleep that never ends
  const w = skip.wait(60000);
  assert.equal(skip.asked(), false);
  assert.equal(skip.request(), true);
  await w; // resolves because of the skip
  assert.equal(skip.request(), false);
  await skip.wait(60000); // later waits are instant
  assert.equal(skip.asked(), true);
});

test('the progress screen is skippable by click, shows the hint, and respects calm motion', () => {
  const html = read('index.html'), js = read('src/ui/title.js'), main = read('src/main.js'), css = read('css/title.css');
  assert.match(html, /id="bt-hinttext"[^>]*>Click anywhere to skip/);
  assert.match(html, /<canvas class="bt-street" id="bt-street"/);
  assert.match(js, /boot\.addEventListener\('click', skipAsk\)/);
  assert.match(main, /title\.showBoot\(steps, \(\) => skip\.request\(\)\)/);
  assert.ok(main.includes("}, skip.wait); };"), "held steps can be skipped, the work still awaited");
  assert.match(read('src/ui/boot-scene.js'), /if \(calm\(\)\)/);
  assert.match(css, /\.bt-pattern\{[^}]*mask-image/);
  assert.ok(!/url\(["']?https?:/.test(css.slice(css.indexOf('progress screen'), css.indexOf('max-width:900px'))), 'no network images');
});

test('the street is driven by progress: it chases it, finishes with it and never goes back', async () => {
  const src = read('src/ui/boot-scene.js');
  assert.match(src, /chase\(t, p \* tl\.lastEnds/);
  assert.match(src, /frame\(dt, progress = 0\)/);
  assert.match(read('src/ui/title.js'), /scene\.frame\(dt \|\| 0\.016, shown\)/);
});

test('the street animation builds the same street for the same seed and lays out every lot', async () => {
  const { streetOf, timeline } = await import('../src/ui/boot-scene.js');
  assert.deepEqual(streetOf(3, 12), streetOf(3, 12));
  assert.notDeepEqual(streetOf(3, 12), streetOf(4, 12));
  const tl = timeline(21);
  assert.ok(tl.lastEnds > 5 && tl.lastEnds < 16);
});
