// The build menus: compact tiles, zone vignettes, road swatches, the footer and the demand widget, and the hooks
// other modules read. Pictures are drawn in the browser; here we check the markup, the numbers and the wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tileCard, zoneCard, zoneVignette, roadSwatch, categoryIcon, coins, detailText, effectOf, coverageEffect, buildingEffect, esc, mkey } from '../src/ui/cards.js';
import { thumbFor } from '../src/render/thumbs.js';
import { overlaps, isBlocked, OBSTACLES } from '../src/ui/label-fit.js';
import { buildParts } from '../src/render/models/builders.js';
import { describe as describeModel } from '../src/world/models.js';
import { MODELS, modelById, footprintsOf, canonicalDims } from '../src/world/models.js';
import { ROAD_TYPES } from '../src/sim/catalog.js';
import { ZONE_DEFS } from '../src/sim/zones.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('a tile escapes its text, keeps its data hooks and shows its price', () => {
  const html = tileCard({ title: 'A <b>&</b>', price: '842 coins', tip: 'x"y', data: { pm: 'cottage' }, pressed: true });
  assert.match(html, /class="name">A &lt;b&gt;&amp;&lt;\/b&gt;</);
  assert.match(html, /title="x&quot;y"/);
  assert.match(html, /data-pm="cottage"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /class="price">842 coins</);
  assert.doesNotMatch(html, /locked|short/);
});

test('a locked road shows its unlock in the price slot and is marked locked', () => {
  const html = tileCard({ title: 'Freeway', unlock: 'Unlock · 900 Parts', price: '90 a tile', locked: true });
  assert.match(html, /class="tile locked"/);
  assert.match(html, /class="price unlock">Unlock · 900 Parts</);
  assert.doesNotMatch(html, /90 a tile/);
});

test('a tile the player cannot pay for is marked short', () => {
  assert.match(tileCard({ title: 'Tower block', price: '1,200 coins', short: true }), /class="tile short"/);
});

test('a key badge appears only when a key is given', () => {
  assert.match(tileCard({ title: 'Street', key: '1' }), /<kbd class="mkey">1<\/kbd>/);
  assert.doesNotMatch(tileCard({ title: 'Clinic' }), /mkey/);
  assert.equal(mkey('Ctrl+Z'), '<kbd class="mkey">Ctrl+Z</kbd>');
});

test('prices are whole coins with a thousands separator', () => {
  assert.equal(coins(842.9), '842 coins');
  assert.equal(coins(1200), '1,200 coins');
});

test('the footer detail reads the description and the effect of the selected model', () => {
  const text = detailText(modelById('clinic'));
  assert.match(text, /^A calm place with a green cross · Cheers up homes within 4 tiles · upkeep 0\.25\/s$/);
  assert.equal(detailText({ sub: 'Plain', floors: [0, 0], id: 'x' }), 'Plain');
});

test('every road type has a swatch and every zone has a vignette with its paint colour', () => {
  for (const r of ROAD_TYPES) assert.match(roadSwatch(r.id), /^<svg /, r.id);
  assert.equal(roadSwatch('nope'), '');
  for (const z of ZONE_DEFS.slice(1)) assert.ok(zoneVignette(z.id).includes(z.paint), z.name);
  assert.match(zoneVignette(0), /pattern/);
});

test('zone tiles carry no demand bars: demand lives in the top widget', () => {
  const html = zoneCard({ id: 2, name: 'Commercial', price: '8 coins a tile', key: '2' });
  assert.match(html, /class="tile zone"/);
  assert.match(html, /data-zone="2"/);
  assert.doesNotMatch(html, /dbar|drow2|demand/);
  assert.match(zoneCard({ id: 0, name: 'Eraser', price: 'Free', key: '0' }), /tile zone eraser/);
});

test('every category has an icon', () => {
  for (const id of ['home', 'shop', 'work', 'landmark', 'service', 'park']) assert.match(categoryIcon(id), /^<svg /, id);
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

test('the green park has a model with lawn, trees and a bench, so its picture is not empty', () => {
  const def = modelById('green');
  const [cw, cd] = canonicalDims(def, footprintsOf(def)[footprintsOf(def).length - 1]);
  const d = describeModel({ id: 'thumb-green', model: 'green', gx: 0, gz: 0, fw: cw, fd: cd, rot: 0 }, 1);
  d.x = 0; d.z = 0; d.y = 0.1;
  const parts = buildParts(d);
  assert.ok(parts.length >= 8, 'green has ' + parts.length + ' parts');
});

test('esc turns the characters that matter into entities', () => {
  assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('thumbnails are not drawn without a document, so node tests get no picture', () => {
  assert.equal(thumbFor('cottage'), null);
  assert.equal(thumbFor('no-such-model'), null);
});

test('the menus keep the hooks that other modules and tests read', () => {
  const placement = read('src/ui/modules/placement.js');
  for (const hook of ['data-pm', 'data-psize', 'data-pcat', 'pturn']) assert.ok(placement.includes(hook), hook);
  assert.ok(read('src/ui/modules/road-tool.js').includes('data-road'));
  assert.ok(read('src/ui/modules/road-tool.js').includes('undoRoad'));
  assert.ok(read('src/ui/modules/zoning.js').includes('data-zone'));
  assert.ok(read('src/ui/modules/districts.js').includes('drow'));
  assert.ok(read('src/ui/modules/services.js').includes('[data-pm]'));
});

test('the footer shows the price of the chosen size, and tiles show their own price', () => {
  const placement = read('src/ui/modules/placement.js');
  assert.match(placement, /sim\.placeCost\(m, a, b\)/);
  assert.match(placement, /class="pprice"/);
  assert.match(placement, /class="pdetail"/);
});

test('the demand widget sits in the top HUD row, and the zoning module fills its rows', () => {
  const html = read('index.html');
  const chips = html.slice(html.indexOf('<div class="chips">'), html.indexOf('<div class="ctrl card">'));
  assert.match(chips, /id="demandw"/);
  assert.match(chips, /id="demandrows"/);
  const zoning = read('src/ui/modules/zoning.js');
  assert.match(zoning, /getElementById\('demandrows'\)/);
  assert.match(zoning, /\[1, 2, 3\]\.map/);
  assert.match(zoning, /class="dpill"/);
  assert.match(read('css/menus.css'), /\.dpill\{/);
  assert.match(read('css/menus.css'), /\.chip\.demand/);
  assert.doesNotMatch(read('css/menus.css'), /\.demandw/);
});

test('district labels hide when they would sit on the interface, and the fit runs a few times a second', () => {
  const d = read('src/ui/modules/districts.js');
  assert.match(d, /from '\.\.\/label-fit\.js'/);
  assert.match(d, /FIT_EVERY_MS = 200/);
  assert.match(read('css/districts.css'), /\.dlabel\.blocked\{visibility:hidden\}/);
});

test('bulldoze has no menu: only a hint chip, and no toast', () => {
  const panels = read('src/ui/panels.js');
  assert.match(panels, /bdchip/);
  assert.doesNotMatch(panels, /tipCard/);
  assert.doesNotMatch(read('src/ui/ui.js'), /Bulldoze: click a building/);
});

test('the menu stylesheet is linked and the old card styles are gone', () => {
  assert.ok(read('index.html').includes('css/menus.css'));
  assert.doesNotMatch(read('css/zoning.css'), /zbtn|zrow|\.dem\b/);
  assert.doesNotMatch(read('css/roads.css'), /nth-of-type|road-fly \.head/);
});

test('a label overlaps a rectangle it touches, with a margin, and is clear of one far away', () => {
  const r = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h });
  assert.equal(overlaps(r(0, 0, 50, 20), r(40, 10, 50, 20)), true);
  assert.equal(overlaps(r(0, 0, 50, 20), r(200, 200, 50, 20)), false);
  assert.equal(overlaps(r(0, 0, 50, 20), r(53, 0, 50, 20)), true, 'within the margin counts as touching');
  assert.equal(overlaps(r(0, 0, 50, 20), r(60, 0, 50, 20)), false);
  assert.equal(isBlocked(r(10, 10, 30, 10), [r(500, 500, 5, 5), r(20, 12, 5, 5)]), true);
  assert.equal(isBlocked(r(10, 10, 30, 10), []), false);
});

test('the obstacles list covers the top HUD, the open cards, the flyouts and the postcard', () => {
  for (const sel of ['.top > *', '#fly', '#inspect', '#settings', '.leftcol > *', '.postcard', '.envelope', '#tools']) {
    assert.ok(OBSTACLES.includes(sel), sel);
  }
});
