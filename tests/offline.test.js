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

// The rate curve as a function of time away: full, then a straight line down to 10%, then flat.
const rateAt = (t, lantern = 0) => {
  const W = 4 * H + 2 * H * Math.min(3, lantern);
  if (t <= W) return 1;
  if (t <= W + 4 * H) return 1 - 0.9 * (t - W) / (4 * H);
  return 0.1;
};

test('the closed form equals the integral of the rate curve, for many absences', () => {
  for (const hours of [0.5, 3, 4, 5, 7.5, 8, 12, 23.9, 24]) {
    const away = hours * H;
    const closed = offlineWindow(away).effectiveS;
    let numeric = 0;
    const step = 1; // one-second slices of the curve: a check on the algebra, not a loop used by the game
    for (let t = 0; t < away; t += step) numeric += rateAt(t + step / 2) * step;
    assert.ok(Math.abs(closed - numeric) < 2, hours + ' h: closed ' + closed + ' vs integral ' + numeric);
  }
});

test('the decay is straight: halfway through it the rate is 55%', () => {
  const mid = offlineWindow(6 * H).effectiveS - offlineWindow(4 * H).effectiveS; // 2 h of decay
  const linear = 2 * H * (1 + 0.55) / 2; // average of 100% and 55% over the first 2 h of decay
  assert.ok(Math.abs(mid - linear) < 1e-6, mid);
});

test('fullS and easeS split the away time, so the postcard bars add up', () => {
  for (const hours of [1, 5, 12, 24]) {
    const w = offlineWindow(hours * H);
    assert.ok(Math.abs(w.fullS + w.easeS - hours * H) < 1e-6);
  }
});
