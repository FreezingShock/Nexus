import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, describe, footprintsOf, canonicalDims } from '../src/world/models.js';
import { buildParts } from '../src/render/models/builders.js';
import { C } from '../src/render/models/kit.js';
import * as THREE from '../vendor/three/three.module.min.js';

const rec = (model, fw, fd) => ({ id: 'b1000', model, gx: 10, gz: 10, fw, fd, rot: 0 });

// The oriel bay has a glass face that juts out of the front wall (+z). Its furthest vertex sits about 0.34 past the wall.
function glassFrontZ(parts) {
  const v = new THREE.Vector3(); let max = -Infinity;
  for (const p of parts) {
    if (p.body || p.color.getHex() !== C.glass) continue;
    const pos = p.geo.attributes.position;
    for (let i = 0; i < pos.count; i++) max = Math.max(max, v.fromBufferAttribute(pos, i).applyMatrix4(p.local).z);
  }
  return max;
}

test('mansard and office blocks carry a glass oriel bay on the front at every level and size', () => {
  for (const id of ['mansard', 'office', 'tower']) {
    const m = MODELS.find((x) => x.id === id);
    for (const size of footprintsOf(m)) for (let lv = 1; lv <= 5; lv++) {
      const [fw, fd] = canonicalDims(m, size);
      const d = describe(rec(id, fw, fd), lv);
      const z = glassFrontZ(buildParts(d)), wall = d.d / 2;
      assert.ok(z > wall + 0.3 && z < wall + 0.45, `${id} ${size} L${lv}: bay glass at z ${z.toFixed(2)}, wall ${wall.toFixed(2)}`);
    }
  }
});
