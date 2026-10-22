// Gentle feedback: the pure rules (families, float pacing, labels), the pool's bloom, the new cues, and the wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { familiesBetween, floatEvery, gainLabel, FAMILY } from '../src/ui/modules/feedback.js';
import { cueFor } from '../src/audio/soundscape.js';

test('a family arrives each time the population crosses a multiple of the family size', () => {
  assert.equal(familiesBetween(FAMILY - 0.5, FAMILY + 0.1), 1);
  assert.equal(familiesBetween(4.1, 4.9), 0, 'no crossing');
  assert.equal(familiesBetween(10, 4), 0, 'a drop (Renewal) is not an arrival');
  assert.equal(familiesBetween(10, 400), 0, 'a jump (offline catch-up) is not a welcome');
  assert.equal(familiesBetween(NaN, 5), 0);
});

test('income floats are rarer on Light and absent when effects are off', () => {
  assert.ok(floatEvery(0.5) > floatEvery(1));
  assert.equal(floatEvery(0), Infinity);
});

test('a gain under one coin shows nothing', () => {
  assert.equal(gainLabel(0.4), '');
  assert.equal(gainLabel(12), '+12');
});

test('a repaint sparkles', () => assert.equal(cueFor({ type: 'painted' }), 'sparkle'));

test('the new cues exist and the feedback files are wired in', () => {
  const engine = readFileSync(new URL('../src/audio/engine.js', import.meta.url), 'utf8');
  assert.match(engine, /arrive: \(t\)/);
  assert.match(engine, /sparkle: \(t\)/);
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /css\/feedback\.css/);
  assert.match(readFileSync(new URL('../src/render/scene.js', import.meta.url), 'utf8'), /settle: \(id\)/);
});
