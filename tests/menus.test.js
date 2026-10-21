// The build menus: the card markup, the effect lines, the road and zone pictures, and the hooks other modules read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { optCard, tipCard, roadSwatch, zoneIcon, effectOf, coverageEffect, buildingEffect, esc, mkey } from '../src/ui/cards.js';
import { thumbFor } from '../src/render/thumbs.js';
import { MODELS, modelById } from '../src/world/models.js';
import { ROAD_TYPES } from '../src/sim/catalog.js';
import { ZONE_DEFS } from '../src/sim/zones.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('a card escapes its text and keeps its data hooks', () => {
  const html = optCard({ title: 'A <b>&</b>', line: 'x"y', data: { pm: 'cottage' }, pressed: true });
  assert.match(html, /<b>A &lt;b&gt;&amp;&lt;\/b&gt;<\/b>/);
  assert.match(html, /x&quot;y/);
  assert.match(html, /data-pm="cottage"/);
  assert.match(html, /aria-pressed="true"/);
  assert.doesNotMatch(html, /locked|short/);
});

test('a locked road shows its unlock in place of a cost and is marked locked', () => {
  const html = optCard({ title: 'Freeway', unlock: 'Unlock · 900 Parts', cost: '90 coins a tile', locked: true });
  assert.match(html, /class="opt mcard locked"/);
  assert.match(html, /class="unlock">Unlock · 900 Parts</);
  assert.doesNotMatch(html, /coins a tile/);
});

test('a card the player cannot afford is marked short and shows its cost in the warm colour class', () => {
  const html = optCard({ title: 'Tower block', cost: 'from 1,200 coins', short: true });
  assert.match(html, /mcard short/);
  assert.match(html, /class="cost">from 1,200 coins</);
});

test('a key badge appears only when a key is given', () => {
  assert.match(optCard({ title: 'Street', key: '1' }), /<kbd class="mkey">1<\/kbd>/);
  assert.doesNotMatch(optCard({ title: 'Clinic' }), /mkey/);
  assert.equal(mkey('Ctrl+Z'), '<kbd class="mkey">Ctrl+Z</kbd>');
  assert.match(tipCard({ title: 'Stop', line: 'Leaves', key: 'Esc' }), /mkey">Esc</);
});

test('every road type has a picture', () => {
  for (const r of ROAD_TYPES) assert.match(roadSwatch(r.id), /^<svg /, r.id);
  assert.equal(roadSwatch('nope'), '');
});

test('every zone and the eraser have a picture, with the paint colour on the zones', () => {
  for (const z of ZONE_DEFS.slice(1)) assert.ok(zoneIcon(z.id).includes(z.paint), z.name);
  assert.match(zoneIcon(0), /pattern/);
});

test('every model has an effect line, and coverage models name their radius', () => {
  for (const m of MODELS) assert.ok(effectOf(m).length > 0, m.id);
  assert.match(coverageEffect('clinic'), /within 4 tiles · upkeep 0\.25\/s/);
  assert.match(coverageEffect('town-hall'), /within 6 tiles · \+1\.5 coins\/s/);
  assert.equal(coverageEffect('cottage'), '');
  assert.equal(coverageEffect('workshop'), 'Eases happiness within 3 tiles');
});

test('a building effect gives floors and what it earns at level 1', () => {
  assert.equal(buildingEffect(modelById('cottage')), '1 to 2 floors · earns 0.9 to 1.8 coins/s');
  assert.equal(buildingEffect(modelById('fire-station')), '2 floors · earns 1.8 coins/s');
  assert.equal(buildingEffect(modelById('green')), '');
});

test('esc turns the characters that matter into entities', () => {
  assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('thumbnails are not drawn without a document, so node tests and old browsers get the plain plate', () => {
  assert.equal(thumbFor('cottage'), null);
  assert.equal(thumbFor('no-such-model'), null);
});

test('the menus keep the hooks that other modules and tests read', () => {
  const placement = read('src/ui/modules/placement.js');
  for (const hook of ['data-pm', 'data-psize', 'data-pcat', 'pturn', '#pturn']) assert.ok(placement.includes(hook), hook);
  assert.ok(read('src/ui/modules/road-tool.js').includes('data-road'));
  assert.ok(read('src/ui/modules/zoning.js').includes('data-zone'));
  assert.ok(read('src/ui/modules/districts.js').includes('drow'));
  assert.ok(read('src/ui/modules/services.js').includes('[data-pm]'));
});

test('the menu stylesheet is linked and the old pill-button styles are gone', () => {
  assert.ok(read('index.html').includes('css/menus.css'));
  assert.doesNotMatch(read('src/ui/modules/zoning.js'), /zbtn|zrow/);
  assert.doesNotMatch(read('css/zoning.css'), /zbtn|zrow/);
  assert.doesNotMatch(read('css/roads.css'), /nth-of-type/);
});
