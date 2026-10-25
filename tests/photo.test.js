import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FILTERS, VIEWPOINTS, FRAMES, CINEMATICS, LOW_TILT, DEFAULTS, cleanPhoto, filterCss, viewpointOf, cinePose, cineHour,
  clockLabel, photoFileName, frameMargins,
} from '../src/render/photo-math.js';
import { ISO, TOWN_LIMIT } from '../src/render/camera-math.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('filters, viewpoints and frames have unique ids, and the first of each is the plain default', () => {
  for (const list of [FILTERS, VIEWPOINTS, FRAMES, CINEMATICS]) assert.equal(new Set(list.map((x) => x.id)).size, list.length);
  assert.equal(FILTERS[0].id, 'none'); assert.equal(filterCss('none'), '');
  assert.equal(FRAMES[0].id, 'none'); assert.equal(VIEWPOINTS[0].id, 'postcard');
  assert.ok(FILTERS.slice(1).every((f) => f.css.length > 0));
  for (const id of ['film', 'postcard', 'ink', 'mono', 'golden']) assert.ok(FILTERS.some((f) => f.id === id), id);
});

test('every viewpoint tilts within what photo mode allows and zooms within the camera limits', () => {
  for (const v of VIEWPOINTS) {
    assert.ok(v.elev >= LOW_TILT && v.elev <= ISO.elevMax, v.id);
    assert.ok(v.zoom >= 0.55 && v.zoom <= 3, v.id);
    assert.ok(v.fov >= 20 && v.fov <= 80, v.id);
    assert.ok(v.lens === 'ortho' || v.lens === 'persp');
  }
  assert.equal(viewpointOf('nope').id, 'postcard');
  assert.equal(viewpointOf('street').lens, 'persp');
});

test('cleanPhoto keeps valid choices, clamps numbers and drops junk', () => {
  assert.deepEqual(cleanPhoto(null), DEFAULTS);
  assert.deepEqual(cleanPhoto('x'), DEFAULTS);
  const c = cleanPhoto({ filter: 'ink', frame: 'polaroid', vignette: 7, hour: 30, speed: -1, cine: 'zzz', hourOn: 'yes', extra: 1 });
  assert.equal(c.filter, 'ink'); assert.equal(c.frame, 'polaroid');
  assert.equal(c.vignette, 1); assert.equal(c.hour, 0); assert.equal(c.speed, 0.25);
  assert.equal(c.cine, DEFAULTS.cine); assert.equal(c.hourOn, false); assert.ok(!('extra' in c));
  assert.equal(cleanPhoto({ vignette: 'abc' }).vignette, DEFAULTS.vignette);
});

test('cinematic moves are smooth loops that never leave the town', () => {
  const base = { tx: 60, tz: -60, az: 1, elev: 0.6 };
  for (const kind of CINEMATICS.map((c) => c.id)) {
    let prev = cinePose(kind, 0, base, 1);
    for (let t = 0.5; t < 400; t += 0.5) {
      const p = cinePose(kind, t, base, 1);
      assert.ok(Math.abs(p.tx) <= TOWN_LIMIT && Math.abs(p.tz) <= TOWN_LIMIT, `${kind} stays in town`);
      assert.ok(p.elev >= LOW_TILT && p.elev <= ISO.elevMax, `${kind} tilt`);
      assert.ok(Math.abs(p.az - prev.az) < 0.2 && Math.abs(p.elev - prev.elev) < 0.1, `${kind} is smooth`);
      prev = p;
    }
  }
  assert.deepEqual(cinePose('orbit', 0, base), { tx: 60, tz: -60, az: 1, elev: 0.6 });
  assert.ok(cinePose('orbit', 10, base).az > cinePose('orbit', 5, base).az);
  assert.ok(cinePose('orbit', 10, base, 2).az > cinePose('orbit', 10, base, 1).az);
});

test('the day sweeps round the clock and wraps', () => {
  assert.equal(cineHour(10, 0), 10);
  assert.ok(cineHour(23, 10) < 23 && cineHour(23, 10) >= 0);
  assert.ok(Math.abs(cineHour(0, 80) - 0) < 1e-9 || Math.abs(cineHour(0, 80) - 24) < 1e-9);
  assert.equal(clockLabel(15.5), '15:30');
});

test('file names are safe and carry the date', () => {
  const d = new Date(2026, 9, 23, 7, 5);
  assert.equal(photoFileName('Nexus', d), 'nexus-nexus-2026-10-23-0705.png');
  assert.equal(photoFileName('  Ünï/cøde: Town!!  ', d), 'nexus-n-c-de-town-2026-10-23-0705.png');
  assert.match(photoFileName('', d), /^nexus-town-/);
  assert.match(photoFileName('x'.repeat(80), d), /^nexus-x{24}-/);
});

test('frame margins: none is zero, a snapshot frame is deeper at the bottom, and the photo is never cropped by it', () => {
  assert.deepEqual(frameMargins('none', 1600, 900), { top: 0, right: 0, bottom: 0, left: 0 });
  const p = frameMargins('paper', 1600, 900), s = frameMargins('polaroid', 1600, 900);
  assert.equal(p.top, p.bottom); assert.ok(s.bottom > s.top * 3);
  assert.ok(s.left + s.right < 1600 && s.top + s.bottom < 900);
});

test('the photo camera lens is wired: perspective camera, lowered floor, hour override, one-shot grab, inert clicks', () => {
  const cam = read('src/render/camera.js'), scene = read('src/render/scene.js');
  assert.match(cam, /view\.lens === 'persp' \? pers : iso/);
  assert.match(cam, /setFloor\(lo\)/);
  assert.match(cam, /view\.telev, view\.lo|clamp\(view\.telev \+ spin\.dElev, view\.lo/);
  assert.match(scene, /setHour: \(h\) => \{ hourOverride = h; \}/);
  assert.match(scene, /grabCb\(canvas\)|cb\(canvas\)/);
  assert.match(scene, /if \(inert\) return;/);
});

test('the photo module is registered, labelled, styled and never touches the sim', () => {
  const mod = read('src/ui/modules/photo.js');
  assert.match(read('src/ui/modules/index.js'), /from '\.\/photo\.js'/);
  assert.match(read('src/ui/modules/menu.js'), /id: 'photobtn', label: 'Photo mode'/);
  assert.match(read('index.html'), /css\/photo\.css/);
  assert.match(mod, /book\.close\(\); \/\/ a page would sit over the picture/);
  assert.ok(!/send\(|dispatch\(/.test(mod), 'photo mode sends no commands');
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(mod), 'no network');
  assert.match(mod, /dataset\.mo = 'pop'/); assert.match(mod, /dataset\.mo = 'up'/);
  assert.match(mod, /try \{ localStorage/);
});
