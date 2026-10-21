import test from 'node:test';
import assert from 'node:assert/strict';
import { awaySeconds, offlineWindow, CAP_S } from '../src/sim/offline.js';

const H = 3600;
const gain = (rate, s, lantern) => rate * offlineWindow(awaySeconds(0, s * 1000), lantern).effectiveS;

test('full rate for the first 4 hours', () => {
  assert.equal(offlineWindow(3 * H).effectiveS, 3 * H);
  assert.equal(offlineWindow(4 * H).effectiveS, 4 * H);
});

test('matches the design example at 500 coins/s: 6 h away', () => {
  // 4 h full + 2 h of decay: 14400 + (7200 - 0.9 * 7200^2 / (2 * 14400))
  assert.equal(Math.round(gain(500, 6 * H)), 9990000);
});

test('10 h away at the base window: 4 h full, 4 h decay, 2 h at 10%', () => {
  assert.equal(Math.round(gain(500, 10 * H)), 11520000);
});

test('Lantern levels extend the full-rate window by 2 h each, max 3', () => {
  assert.equal(offlineWindow(10 * H, 3).effectiveS, 10 * H);
  assert.equal(offlineWindow(10 * H, 9).effectiveS, 10 * H);
});

test('capped at 24 h', () => {
  assert.equal(awaySeconds(0, 100 * H * 1000), CAP_S);
  const a = offlineWindow(CAP_S).effectiveS;
  assert.ok(a > 0 && a < CAP_S);
});

test('negative or bad deltas count as zero', () => {
  assert.equal(awaySeconds(5000, 1000), 0);
  assert.equal(awaySeconds(NaN, 1000), 0);
  assert.equal(awaySeconds(0, NaN), 0);
});

test('continuous at the window boundaries', () => {
  const e = 1e-6;
  for (const edge of [4 * H, 8 * H]) {
    assert.ok(Math.abs(offlineWindow(edge + e).effectiveS - offlineWindow(edge - e).effectiveS) < 1e-3);
  }
});
