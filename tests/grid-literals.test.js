// The grid grew from 64 to 96 tiles. Any code that kept the old size or origin as a number puts overlays and picking
// off the roads (the zone grid drew shifted, and a zone drag clamped at tile 63). Every tile mapping reads GRID_N,
// GRID_HALF and TILE; this scans the source for the old literals so one cannot come back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : []; });

test('no shader or picking code keeps the old 64 grid origin or edge', () => {
  for (const f of files('src')) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/97\.5/.test(src), f + ' has the old ground offset 97.5');
    assert.ok(!/Math\.min\(63,/.test(src), f + ' clamps tiles at the old edge 63');
  }
});
