import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, describe, footprintsOf, canonicalDims } from '../src/world/models.js';
import { buildParts } from '../src/render/models/builders.js';
import { zFights } from './support/zfight.js';

// Two faces in one plane facing the same way flicker as the camera moves. scripts/audit-models.mjs prints the details.
test('no model has coplanar overlapping faces at any size, level or seed', () => {
  const bad = [];
  for (const m of MODELS) for (const size of footprintsOf(m)) for (let lv = 1; lv <= 5; lv++) for (let s = 0; s < 8; s++) {
    const [fw, fd] = canonicalDims(m, size);
    for (const f of zFights(buildParts(describe({ id: 'b' + (1000 + s), model: m.id, gx: 10, gz: 10, fw, fd, rot: 0 }, lv)))) {
      bad.push(`${m.id} ${size} L${lv} seed ${s}: ${f.boxes.join(' vs ')} normal ${f.normal}`);
    }
  }
  assert.deepEqual(bad.slice(0, 5), []);
});
