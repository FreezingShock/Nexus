import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, describe, footprintsOf, canonicalDims } from '../src/world/models.js';
import { buildParts } from '../src/render/models/builders.js';

const rec = (model, fw, fd, seed) => ({ id: 'b1000', model, gx: 10, gz: 10, fw, fd, rot: 0, ...(seed === undefined ? {} : { seed }) });
const shape = (parts) => parts.map((p) => p.color.getHexString()).join(',');

test('neighbours get different trim: thirty seeds of one model show at least four different looks', () => {
  const m = MODELS.find((x) => x.id === 'cottage');
  const [fw, fd] = canonicalDims(m, footprintsOf(m)[0]);
  const looks = new Set();
  for (let s = 1; s <= 30; s++) looks.add(shape(buildParts(describe(rec('cottage', fw, fd, s * 7919), 1))));
  assert.ok(looks.size >= 4, `only ${looks.size} distinct looks`);
});

test('the same seed always gets the same trim', () => {
  const m = MODELS.find((x) => x.id === 'terrace');
  const [fw, fd] = canonicalDims(m, footprintsOf(m)[0]);
  const a = shape(buildParts(describe(rec('terrace', fw, fd, 4242), 3)));
  assert.equal(a, shape(buildParts(describe(rec('terrace', fw, fd, 4242), 3))));
});
