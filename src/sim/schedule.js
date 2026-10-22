// Daily routines. Every resident has a drive window and a walk window worked out from a hash of their index, so there is
// no per-person state to save: person i at hour h is always doing the same thing. Pure: no DOM, no THREE, no sim.
// Cars and walkers on screen are the residents whose window is open right now. See docs/POPULATION.md.
import { ROUTINE } from './population-config.js';

// Integer hash to a number in [0, 1). `salt` picks an independent stream per trait.
export function unit(i, salt) {
  let h = Math.imul(i + 1, 0x9E3779B1) ^ Math.imul(salt + 1, 0x85EBCA6B);
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D);
  h ^= h >>> 12; h = Math.imul(h, 0x297A2D39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
// A bell-ish spread (mean of two draws), so most people go near the middle of a range.
const bell = (i, salt) => (unit(i, salt) + unit(i, salt + 50)) / 2;

// The drive windows of person i as [start, end] hours. Empty for people without a car.
// Workers drive out in the morning and home in the evening; the rest run one errand, some a second.
export function driveWindows(i) {
  const R = ROUTINE;
  if (unit(i, 1) >= R.driveShare) return [];
  const dur = R.driveMin + (R.driveMax - R.driveMin) * unit(i, 4);
  if (unit(i, 2) < R.workerShare) {
    const out = R.amFrom + (R.amTo - R.amFrom) * bell(i, 3);
    const back = R.pmFrom + (R.pmTo - R.pmFrom) * bell(i, 5);
    return [[out, out + dur], [back, back + dur]];
  }
  const a = R.errandFrom + (R.errandTo - R.errandFrom) * unit(i, 3);
  const w = [[a, a + dur]];
  if (unit(i, 6) < R.errand2Share) { const b = R.pmFrom - 1 + 3 * unit(i, 7); if (b > a + dur + 0.5) w.push([b, b + dur]); }
  return w;
}

// The walk window of person i, or null. People who drive are on foot only outside their drive windows.
export function walkWindow(i) {
  const R = ROUTINE;
  if (unit(i, 10) >= R.walkShare) return null;
  let r = unit(i, 11), k = 0;
  while (k < R.walkSlots.length - 1 && r >= R.walkSlots[k].weight) { r -= R.walkSlots[k].weight; k++; }
  const s = R.walkSlots[k];
  const start = s.from + (s.to - s.from) * unit(i, 12);
  return [start, start + R.walkMin + (R.walkMax - R.walkMin) * unit(i, 13)];
}

const inside = (w, h) => h >= w[0] && h < w[1];
export function isDriving(i, hour) {
  const w = driveWindows(i);
  for (let k = 0; k < w.length; k++) if (inside(w[k], hour)) return true;
  return false;
}
export function isWalking(i, hour) {
  const w = walkWindow(i);
  return !!w && inside(w, hour) && !isDriving(i, hour);
}

// Fills `out` with the indices of residents currently driving (or walking), among the first n people. Returns how many.
// O(n) hashes: n is a few thousand at most, and the callers run about twice a second.
export function drivingNow(n, hour, out) {
  let c = 0;
  for (let i = 0; i < n && c < out.length; i++) if (isDriving(i, hour)) out[c++] = i;
  return c;
}
export function walkingNow(n, hour, out) {
  let c = 0;
  for (let i = 0; i < n && c < out.length; i++) if (isWalking(i, hour)) out[c++] = i;
  return c;
}

// One-way car trips a resident makes in a day, on average. Feeds the demand model so trip totals follow the routines.
export function carTripsPerPerson() {
  const R = ROUTINE;
  return R.driveShare * (R.workerShare * 2 + (1 - R.workerShare) * (1 + R.errand2Share * 0.8));
}

// Whole residents for a float population.
export const headcount = (p) => Math.max(0, Math.floor(p));
