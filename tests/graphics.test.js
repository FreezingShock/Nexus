import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPTIONS, PRESETS, PRESET_NAMES, QUALITY_KEY, CROWD, EFFECTS,
  createQualityStore, defaultPreset, renderSettings, resolveStored, sanitizeOptions,
} from '../src/core/quality.js';
import { graphicsMarkup } from '../src/ui/graphics.js';

// In-memory storage. `broken` makes every call throw, like a private window with storage blocked.
function memStore({ broken = false, seed = null } = {}) {
  const m = new Map();
  if (seed !== null) m.set(QUALITY_KEY, seed);
  return {
    m,
    getItem(k) { if (broken) throw new Error('blocked'); return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { if (broken) throw new Error('blocked'); m.set(k, String(v)); },
  };
}
const FINE = { coarse: false }, COARSE = { coarse: true };
const GRAPHICS = Object.keys(OPTIONS).filter((k) => k !== 'stats');

// ---- presets ----

test('every preset sets every graphics option to an allowed value', () => {
  assert.deepEqual(PRESET_NAMES, ['low', 'medium', 'high', 'ultra']);
  for (const name of PRESET_NAMES) {
    for (const k of GRAPHICS) {
      const spec = OPTIONS[k];
      const v = PRESETS[name][k];
      if (spec.bool) assert.equal(typeof v, 'boolean', `${name}.${k}`);
      else assert.ok(spec.values.includes(v), `${name}.${k} = ${v}`);
    }
  }
});

test('presets step up in shadow detail and sharpness, and Ultra is the busiest', () => {
  assert.equal(PRESETS.low.shadows, false);
  assert.ok(PRESETS.medium.shadowSize < PRESETS.high.shadowSize && PRESETS.high.shadowSize < PRESETS.ultra.shadowSize);
  assert.ok(PRESETS.low.pixelRatio <= PRESETS.medium.pixelRatio && PRESETS.medium.pixelRatio <= PRESETS.high.pixelRatio);
  assert.ok(CROWD[PRESETS.ultra.crowd] >= CROWD[PRESETS.high.crowd]);
});

test('the busiest crowd stays under the instance caps (300 target, 500 max)', () => {
  // cars.js and townsfolk.js: CAR_TARGET and TARGET are 300, their instance caps are 500.
  assert.ok(300 * Math.max(...Object.values(CROWD)) <= 500);
});

test('the first run picks High with a mouse and Medium on a touch screen', () => {
  assert.equal(defaultPreset(FINE), 'high');
  assert.equal(defaultPreset(COARSE), 'medium');
  assert.equal(defaultPreset({}), 'high');
});

// ---- mapping to render values ----

test('renderSettings maps names to the numbers the renderer uses', () => {
  const low = renderSettings({ ...PRESETS.low });
  assert.equal(low.shadows, false);
  assert.equal(low.effects, EFFECTS.light);
  assert.equal(low.crowd, CROWD.light);
  const high = renderSettings({ ...PRESETS.high });
  assert.equal(high.shadowSize, 2048);
  assert.equal(high.pixelRatio, 2);
  assert.equal(high.edges, true);
  assert.equal(renderSettings({ ...PRESETS.high, effects: 'off' }).effects, 0);
});

// ---- store: choosing and setting ----

test('a fresh store starts on the default preset with no saved state', () => {
  const s = createQualityStore({ storage: memStore(), env: FINE });
  assert.equal(s.get().preset, 'high');
  assert.equal(s.get().shadowSize, PRESETS.high.shadowSize);
  assert.equal(s.get().stats, false);
});

test('changing one option marks the preset Custom, and keeps the rest', () => {
  const s = createQualityStore({ storage: memStore(), env: FINE });
  assert.equal(s.set('shadows', false), true);
  assert.equal(s.get().preset, 'custom');
  assert.equal(s.get().shadows, false);
  assert.equal(s.get().shadowSize, PRESETS.high.shadowSize);
});

test('choosing a preset applies all of its options and keeps the stats readout', () => {
  const s = createQualityStore({ storage: memStore(), env: FINE });
  s.set('stats', true);
  s.set('crowd', 'light');
  assert.equal(s.choose('low'), true);
  const q = s.get();
  assert.equal(q.preset, 'low');
  for (const k of GRAPHICS) assert.equal(q[k], PRESETS.low[k], k);
  assert.equal(q.stats, true);
});

test('the stats readout does not mark the preset Custom', () => {
  const s = createQualityStore({ storage: memStore(), env: FINE });
  s.set('stats', true);
  assert.equal(s.get().preset, 'high');
});

test('values outside the allowed list are refused and nothing changes', () => {
  const s = createQualityStore({ storage: memStore(), env: FINE });
  assert.equal(s.set('shadowSize', 8192), false);
  assert.equal(s.set('crowd', 'huge'), false);
  assert.equal(s.set('shadows', 'yes'), false);
  assert.equal(s.set('nope', true), false);
  assert.equal(s.choose('max'), false);
  assert.equal(s.get().preset, 'high');
});

test('onChange hears every real change, with the new values', () => {
  const seen = [];
  const s = createQualityStore({ storage: memStore(), env: FINE, onChange: (q) => seen.push(q) });
  s.set('edges', false);
  s.choose('ultra');
  s.set('nope', 1);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].edges, false);
  assert.equal(seen[1].preset, 'ultra');
});

// ---- storage ----

test('choices are kept in this browser and come back on the next visit', () => {
  const storage = memStore();
  createQualityStore({ storage, env: FINE }).set('shadowSize', 4096);
  const again = createQualityStore({ storage, env: FINE });
  assert.equal(again.get().preset, 'custom');
  assert.equal(again.get().shadowSize, 4096);
});

test('a named preset is rebuilt from its current table, not from stored copies', () => {
  const stored = JSON.stringify({ v: 1, preset: 'low', options: { shadows: true, shadowSize: 4096, stats: true } });
  const q = resolveStored(JSON.parse(stored), FINE);
  assert.equal(q.preset, 'low');
  assert.equal(q.shadows, PRESETS.low.shadows);
  assert.equal(q.stats, true);
});

test('a broken storage still gives working settings in memory', () => {
  const s = createQualityStore({ storage: memStore({ broken: true }), env: FINE });
  assert.equal(s.get().preset, 'high');
  assert.equal(s.set('shadows', false), true);
  assert.equal(s.get().shadows, false);
});

test('unreadable or foreign stored data falls back to the default', () => {
  const bad = [
    'not json', '{"v":2,"preset":"low"}', '[]', 'null', '{"v":1,"preset":"max"}',
  ];
  for (const seed of bad) {
    const s = createQualityStore({ storage: memStore({ seed }), env: FINE });
    assert.equal(s.get().preset, 'high', seed);
  }
});

test('a custom record keeps its valid options and fills bad ones from the default', () => {
  const seed = JSON.stringify({ v: 1, preset: 'custom', options: { shadows: false, shadowSize: 999, crowd: 'busy', edges: 'yes' } });
  const q = resolveStored(JSON.parse(seed), FINE);
  assert.equal(q.preset, 'custom');
  assert.equal(q.shadows, false);
  assert.equal(q.crowd, 'busy');
  assert.equal(q.shadowSize, PRESETS.high.shadowSize);
  assert.equal(q.edges, PRESETS.high.edges);
});

test('sanitizeOptions ignores keys it does not know', () => {
  const out = sanitizeOptions({ shadows: false, hack: 'x' }, PRESETS.high);
  assert.equal(out.hack, undefined);
  assert.equal(out.shadows, false);
});

test('the settings key is not the save key', () => {
  assert.notEqual(QUALITY_KEY, 'nexus.save');
  assert.match(QUALITY_KEY, /^nexus\./);
});

// ---- the Graphics section markup ----

test('the section offers all four presets and marks the current one', () => {
  const html = graphicsMarkup({ ...PRESETS.high, preset: 'high', stats: false });
  for (const p of PRESET_NAMES) assert.match(html, new RegExp(`data-preset="${p}"`));
  assert.match(html, /data-preset="high" aria-pressed="true"/);
  assert.match(html, /data-preset="low" aria-pressed="false"/);
  assert.match(html, /Preset: High\./);
});

test('shadow detail is disabled while shadows are off, and Custom says so', () => {
  const html = graphicsMarkup({ ...PRESETS.low, preset: 'custom', stats: false });
  assert.match(html, /data-key="shadowSize"[^>]*disabled/);
  assert.match(html, /Custom: you changed an option/);
  assert.match(html, /data-switch="shadows" aria-checked="false"/);
});
