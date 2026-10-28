// Views: Traffic and Demand are map modes, not tools. The legends are pure text and the wiring is checked from source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VIEWS, legendHtml, commuteLine } from '../src/ui/modules/views.js';
import { TOOL_KEYS } from '../src/ui/shortcuts.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('Traffic is gone from the toolbar and the tool keys, and lives in the views list', () => {
  assert.ok(!('t' in TOOL_KEYS) && !Object.values(TOOL_KEYS).includes('traffic'));
  assert.ok(!/data-tool="traffic"/.test(read('index.html')));
  assert.deepEqual(VIEWS.map((v) => v.id), ['normal', 'traffic', 'demand']);
});

test('the commute line reads well with and without jams', () => {
  assert.match(commuteLine({ eff: 0.93, penalty: 0 }), /flows freely/);
  assert.match(commuteLine({ eff: 0.8, penalty: -1.5 }), /Commute 80% · jams take 1\.5 coins\/s/);
});

test('legends: traffic shows the three road classes, demand a row per zone type', () => {
  const sim = { traffic: { eff: 1, penalty: 0 }, zoning: { demand: () => [0, 0.9, 0.5, 0.1] } };
  const t = legendHtml('traffic', sim);
  for (const w of ['Free', 'Busy', 'Jammed']) assert.ok(t.includes(w), w);
  const d = legendHtml('demand', sim);
  assert.match(d, /Wanted/); assert.match(d, /Some room/); assert.match(d, /Plenty for now/);
});

test('the renderer reads the view, not the tool', () => {
  assert.match(read('src/render/systems/roads.js'), /f\.view === 'traffic'/);
  assert.match(read('src/render/systems/tileview.js'), /f\.view === 'demand'/);
  assert.match(read('src/main.js'), /ui\.view\(\)/);
  assert.match(read('index.html'), /css\/views\.css/);
});
