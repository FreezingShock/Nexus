// The hearts-and-sparkles pool: fixed size, steps without allocating, fades and expires, and reuses the oldest slot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePool, emitInto, stepPool, POOL, LIFE_S } from '../src/render/systems/happy-fx.js';

const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

test('the pool has a fixed size and starts empty', () => {
  const p = makePool();
  assert.equal(p.n, POOL);
  assert.equal(stepPool(p, 0.1), 0, 'nothing alive');
  assert.ok(p.alpha.every((a) => a === 0));
});

test('an emitted particle rises, fades in, and expires after its life', () => {
  const p = makePool();
  emitInto(p, 0, 5, 0, 0, seeded(7));
  const y0 = p.by[0];
  assert.equal(stepPool(p, 0.1), 1);
  assert.ok(p.pos[1] > y0, 'it rises');
  assert.ok(p.alpha[0] > 0 && p.alpha[0] < 1, 'it is still fading in');
  let alive = 1;
  for (let t = 0; t < LIFE_S * 2 && alive; t += 0.1) alive = stepPool(p, 0.1);
  assert.equal(alive, 0, 'it is gone after its life');
  assert.equal(p.alpha[0], 0);
});

test('a full pool reuses the oldest particle instead of growing', () => {
  const p = makePool(4);
  for (let k = 0; k < 4; k++) { emitInto(p, k, 0, 0, 0, seeded(k + 1)); stepPool(p, 0.2 * (k + 1)); }
  emitInto(p, 9, 0, 0, 1, seeded(99));
  assert.equal(p.age.length, 4, 'still four slots');
  assert.ok(p.age.some((a) => a === 0), 'the new one is at age zero');
  assert.equal(stepPool(p, 0.01), 4, 'all four are alive, none were dropped');
});

test('kinds are written so the shader can tell a heart from a sparkle', () => {
  const p = makePool();
  emitInto(p, 0, 0, 0, 0, seeded(3));
  emitInto(p, 1, 0, 0, 1, seeded(4));
  stepPool(p, 0.05);
  assert.equal(p.outKind[0], 0);
  assert.equal(p.outKind[1], 1);
  assert.ok(p.outSize[0] > p.outSize[1], 'hearts are a little bigger than sparkles');
});
