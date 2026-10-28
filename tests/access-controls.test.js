// Settings > Controls and Access: the per-browser stores, the traffic palettes and the rows the tabs draw.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrefStore, cleanPref, sanitizePrefs } from '../src/core/prefs.js';
import { CONTROLS_KEY, CONTROL_SPECS, createControlsStore } from '../src/core/controls.js';
import { ACCESS_KEY, ACCESS_SPECS, TRAFFIC_HEX, TEXT_SCALE, applyAccess, createAccessStore, isCalm, trafficRgb } from '../src/core/access.js';
import { prefsMarkup, CONTROL_ROWS, ACCESS_ROWS } from '../src/ui/prefs-settings.js';

function memStore({ broken = false, seed = null, key = '' } = {}) {
  const m = new Map();
  if (seed !== null) m.set(key, seed);
  return {
    m,
    getItem(k) { if (broken) throw new Error('blocked'); return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { if (broken) throw new Error('blocked'); m.set(k, String(v)); },
  };
}

test('cleanPref keeps allowed values and snaps sliders into range', () => {
  assert.equal(cleanPref(CONTROL_SPECS.panSpeed, 9), 2);
  assert.equal(cleanPref(CONTROL_SPECS.panSpeed, 0), 0.5);
  assert.equal(cleanPref(CONTROL_SPECS.panSpeed, 1.1), 1);
  assert.equal(cleanPref(CONTROL_SPECS.panSpeed, '1'), undefined);
  assert.equal(cleanPref(CONTROL_SPECS.panSpeed, NaN), undefined);
  assert.equal(cleanPref(CONTROL_SPECS.invertZoom, 'yes'), undefined);
  assert.equal(cleanPref(ACCESS_SPECS.text, 'huge'), undefined);
  assert.equal(cleanPref(ACCESS_SPECS.text, 'large'), 'large');
});

test('a first run, an old record and junk all give the defaults', () => {
  const fresh = createControlsStore({ storage: memStore() }).get();
  assert.deepEqual(fresh, { panSpeed: 1, zoomSpeed: 1, turnSpeed: 1, invertZoom: false, keyHint: true });
  assert.deepEqual(createAccessStore({ storage: memStore({ key: ACCESS_KEY, seed: '{nope' }) }).get(), { text: 'normal', motion: 'follow', colors: 'standard' });
  assert.deepEqual(sanitizePrefs(ACCESS_SPECS, { v: 1, options: { text: 'big', colors: 'redgreen', extra: 1 } }), { text: 'normal', motion: 'follow', colors: 'redgreen' });
  const wrongVersion = memStore({ key: ACCESS_KEY, seed: JSON.stringify({ v: 9, options: { text: 'larger' } }) });
  assert.equal(createAccessStore({ storage: wrongVersion }).get().text, 'normal');
});

test('set saves, notifies once per real change, and survives broken storage', () => {
  const seen = [];
  const mem = memStore();
  const s = createAccessStore({ storage: mem, onChange: (a) => seen.push(a) });
  assert.equal(s.set('text', 'large'), true);
  assert.equal(s.set('text', 'large'), false);
  assert.equal(s.set('text', 'nope'), false);
  assert.equal(seen.length, 1);
  assert.deepEqual(JSON.parse(mem.m.get(ACCESS_KEY)), { v: 1, options: { text: 'large', motion: 'follow', colors: 'standard' } });
  assert.equal(createAccessStore({ storage: mem }).get().text, 'large'); // a new visit remembers it
  const broken = createControlsStore({ storage: memStore({ broken: true }) });
  assert.equal(broken.set('panSpeed', 1.5), true);
  assert.equal(broken.get().panSpeed, 1.5);
});

test('reset returns every control to the usual', () => {
  const s = createControlsStore({ storage: memStore() });
  s.set('zoomSpeed', 2); s.set('invertZoom', true);
  s.reset();
  assert.equal(s.get().zoomSpeed, 1);
  assert.equal(s.get().invertZoom, false);
});

test('traffic palettes: three colours each, the colour-blind sets differ in lightness', () => {
  const light = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  for (const [name, set] of Object.entries(TRAFFIC_HEX)) {
    assert.equal(set.length, 3, name);
    assert.equal(trafficRgb(name).length, 3);
    if (name !== 'standard') assert.ok(new Set(set.map((h) => Math.round(light(h) / 30))).size === 3, name + ' lightness steps');
  }
  assert.deepEqual(trafficRgb('unknown'), trafficRgb('standard'));
});

test('applyAccess writes the root attributes and colour variables', () => {
  const props = {};
  const root = { dataset: {}, style: { setProperty: (k, v) => { props[k] = v; } } };
  applyAccess({ text: 'larger', motion: 'calm', colors: 'redgreen' }, root);
  assert.equal(root.dataset.text, 'larger');
  assert.equal(root.dataset.motion, 'calm');
  assert.equal(props['--tr-jam'], TRAFFIC_HEX.redgreen[2]);
  assert.equal(props['--ts'], String(TEXT_SCALE.larger));
  applyAccess({ text: 'normal', motion: 'follow', colors: 'standard' }, null); // no root: still fine
});

test('calm motion follows the computer unless the player chose', () => {
  assert.equal(isCalm({ motion: 'calm' }, false), true);
  assert.equal(isCalm({ motion: 'follow' }, true), true);
  assert.equal(isCalm({ motion: 'follow' }, false), false);
});

test('the tabs draw a control for every setting', () => {
  const c = prefsMarkup(CONTROL_ROWS, CONTROL_SPECS, createControlsStore({}).get());
  for (const k of Object.keys(CONTROL_SPECS)) assert.ok(c.includes(`"${k}"`), k);
  const a = prefsMarkup(ACCESS_ROWS, ACCESS_SPECS, createAccessStore({}).get());
  for (const k of Object.keys(ACCESS_SPECS)) assert.ok(a.includes(`data-key="${k}"`), k);
  assert.match(a, /aria-pressed="true"/);
  assert.ok(a.includes('var(--tr-jam)'));
});

test('a store from createPrefStore needs no storage at all', () => {
  const s = createPrefStore({ key: 'x', specs: CONTROL_SPECS });
  assert.equal(s.set('turnSpeed', 2), true);
  assert.equal(CONTROLS_KEY, 'nexus.controls.v1');
});
