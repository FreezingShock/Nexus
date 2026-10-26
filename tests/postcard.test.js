import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('envelope has only the top flap lines and the whole envelope opens the card', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /env-lines/);
  assert.match(html, /<div class="envelope" id="envelope" role="button" tabindex="0"/);
  assert.match(html, /href="css\/postcard\.css"/);
  const js = read('src/ui/postcard.js');
  assert.match(js, /\$\('envelope'\)\.onclick = openMail/);
  assert.match(js, /e\.key === 'Enter' \|\| e\.key === ' '/);
});

test('the open and close motion and catch-up stay wired', () => {
  assert.match(read('index.html'), /id="offline" class="modal" data-mo="fade"/);
  assert.doesNotMatch(read('css/postcard.css'), /\[hidden\]/);
});

test('the snapshot frames the town centre, not wherever the camera was left', () => {
  const sc = read('src/render/scene.js');
  assert.match(sc, /orbitPose\(0, 0, ISO\.az, ISO\.elev/);
  assert.doesNotMatch(sc, /camera\.view, half/);
});

test('Settings can preview the postcard without paying out', () => {
  assert.match(read('src/ui/panels.js'), /data-act="pcv"/);
  const js = read('src/ui/postcard.js');
  assert.match(js, /const pay = !previewing;/);
  assert.match(js, /if \(pay\) \{[^}]*send\(\{ type: 'collectOffline' \}\)/);
});

test('every ui method main.js calls exists on the object createUi returns', () => {
  const main = read('src/main.js'), ui = read('src/ui/ui.js');
  const body = ui.slice(ui.lastIndexOf('  return {'));
  const called = new Set([...main.matchAll(/\bui\.([A-Za-z]+)\(/g)].map((m) => m[1]));
  assert.ok(called.has('previewPostcard') && called.has('showPostcard'));
  for (const name of called) assert.match(body, new RegExp('\\b' + name + '\\b'), 'ui.' + name + ' is not returned by createUi');
});

test('local servers send no-cache so modules never load mixed', () => {
  assert.match(read('scripts/serve.py'), /no-store/);
  for (const f of ['scripts/refresh.sh', 'scripts/refresh.ps1', 'package.json']) assert.match(read(f), /serve\.py/);
});

test('no open button: the envelope alone opens the card, and the card is a short landscape postcard', () => {
  const html = read('index.html'), css = read('css/postcard.css');
  assert.doesNotMatch(html, /openmail|Open the postcard/);
  assert.doesNotMatch(css, /openbtn|translateY\(110px\)/);
  assert.match(html, /class="pc-front"[\s\S]*class="pc-back"/);
  assert.match(css, /\.mail\{[^}]*margin:auto/);
});

test('the note opens with a pluggable writer, then one short days line with festival names trimmed', async () => {
  const { writeNote, addNoteWriter, festivalList, daysLine, postscript } = await import('../src/ui/postcard-note.js');
  const fests = ['New Year\'s Day', 'Thaw Day', 'Blossom Fair', 'Midsummer Fete', 'Harvest Feast', 'Lantern Night', 'Hearth Eve'].map((name) => ({ name, count: 9 }));
  assert.equal(festivalList(fests), 'Hearth Eve, Lantern Night and 5 more');
  assert.equal(festivalList(fests.slice(0, 2)), 'Thaw Day and New Year\'s Day');
  assert.equal(festivalList([{ name: 'A', count: 1 }, { name: 'A', count: 2 }]), 'A');
  assert.equal(daysLine({ days: 1, festivals: [] }), '1 day went by.');
  assert.doesNotMatch(daysLine({ days: 234, festivals: fests }), /times/);
  const ctx = { log: [], night: false, offline: { days: 0 } };
  assert.match(writeNote(ctx, () => 0), /^Dear mayor/);
  assert.match(writeNote({ ...ctx, log: [{ k: 'road', n: 'x' }] }), /new road/);
  const off = addNoteWriter((c) => (c.offline.event === 'fair' ? 'Dear mayor, the fair came to town.' : null));
  assert.match(writeNote({ ...ctx, offline: { event: 'fair' }, log: [{ k: 'road', n: 'x' }] }), /fair came/);
  off();
  assert.doesNotMatch(writeNote({ ...ctx, offline: { event: 'fair' } }, () => 0), /fair came/);
  assert.equal(postscript({ easeS: 0 }), '');
  assert.match(postscript({ easeS: 3600 }), /^P\.S\./);
});

test('collect flies a sensible number of icons whose shares add up, and lands on the counter', async () => {
  const { iconCount, shares, flightAt } = await import('../src/ui/collect-fx.js');
  assert.equal(iconCount(0), 0);
  assert.ok(iconCount(5) >= 4 && iconCount(1e12) <= 14);
  for (const [amt, n] of [[345384, 14], [7, 4], [3, 4], [11232.7, 11]]) {
    const s = shares(amt, n);
    assert.equal(s.length, n);
    assert.equal(s.reduce((a, b) => a + b, 0), Math.floor(amt));
    assert.ok(s.every((x) => x >= 0));
  }
  const p = { a: { x: 400, y: 600 }, b: { x: 120, y: 30 }, v: { x: 60, y: -90 }, burst: 0.35, fly: 0.5 };
  const end = flightAt(p, 0.85);
  assert.ok(end.done);
  assert.ok(Math.abs(end.x - 120) < 1e-6 && Math.abs(end.y - 30) < 1e-6);
  assert.ok(!flightAt(p, 0.5).done);
});

test('collecting holds the HUD back and lets each share in as its icon lands', () => {
  const pc = read('src/ui/postcard.js'), hud = read('src/ui/hud.js');
  assert.match(pc, /hud\.hold\('coins'/);
  assert.match(pc, /burst\(from, kinds\)/);
  assert.match(hud, /d\.coins - held\.coins/);
  assert.match(read('src/ui/ui.js'), /createPostcard\(\{ sim, send, scene, hud \}\)/);
});
