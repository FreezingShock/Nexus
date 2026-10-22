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
  assert.match(read('src/ui/panels.js'), /id="pcv"/);
  assert.match(read('src/ui/postcard.js'), /if \(!previewing\) send\(\{ type: 'collectOffline' \}\)/);
});
