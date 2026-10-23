// Daily routines. Every resident has drive and walk windows worked out from a hash of their index and the day (state.days),
// so there is no per-person state to save: person i at hour h on day d is always doing the same thing, yet leaves at a
// different time on a different day, and has days off. Pure: no DOM, no THREE, no sim.
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
// Like unit, but a fresh stream for each day: the same person rolls differently on day 3 than on day 4.
export const dayUnit = (i, day, salt) => unit(i + Math.imul((day | 0) + 1, 0x7FEB352D), salt);
// A bell-ish spread (mean of two draws), so most people go near the middle of a range.
const bell = (i, salt) => (unit(i, salt) + unit(i, salt + 50)) / 2;

// The drive windows of person i on `day` as [start, end] hours. Empty for people without a car, or staying home today.
// Workers drive out in the morning and home in the evening; the rest run one errand, some a second. A worker's day off is
// an errand or nothing, and every window slides a little from day to day.
export function driveWindows(i, day = 0) {
  const R = ROUTINE;
  if (unit(i, 1) >= R.driveShare) return [];
  const dur = R.driveMin + (R.driveMax - R.driveMin) * unit(i, 4);
  const slide = (salt) => (dayUnit(i, day, salt) * 2 - 1) * R.dayShift;
  const errand = (salt) => R.errandFrom + (R.errandTo - R.errandFrom) * dayUnit(i, day, salt);
  const off = dayUnit(i, day, 20) < R.dayOff;
  if (unit(i, 2) < R.workerShare) {
    if (off) return dayUnit(i, day, 21) < 0.5 ? [[errand(22), errand(22) + dur]] : [];
    const out = R.amFrom + (R.amTo - R.amFrom) * bell(i, 3) + slide(23);
    const back = R.pmFrom + (R.pmTo - R.pmFrom) * bell(i, 5) + slide(24);
    return [[out, out + dur], [back, back + dur]];
  }
  if (off && dayUnit(i, day, 21) < 0.6) return [];
  const a = errand(25);
  const w = [[a, a + dur]];
  if (dayUnit(i, day, 26) < R.errand2Share) { const b = R.pmFrom - 1 + 3 * dayUnit(i, day, 27); if (b > a + dur + 0.5) w.push([b, b + dur]); }
  return w;
}

// The walk window of person i on `day`, or null. Walks are rolled fresh each day; half the people keep a favourite slot.
// People who drive are on foot only outside their drive windows.
export function walkWindow(i, day = 0) {
  const R = ROUTINE;
  if (dayUnit(i, day, 10) >= R.walkShare) return null;
  const creature = unit(i, 14) < R.habit; // of habit: same slot, nudged a little; the rest pick a slot each day
  let r = creature ? unit(i, 11) : dayUnit(i, day, 11), k = 0;
  while (k < R.walkSlots.length - 1 && r >= R.walkSlots[k].weight) { r -= R.walkSlots[k].weight; k++; }
  const s = R.walkSlots[k];
  const start = s.from + (s.to - s.from) * (creature ? 0.5 * unit(i, 12) + 0.5 * dayUnit(i, day, 12) : dayUnit(i, day, 12));
  return [start, start + R.walkMin + (R.walkMax - R.walkMin) * unit(i, 13)];
}

const inside = (w, h) => h >= w[0] && h < w[1];
export function isDriving(i, hour, day = 0) {
  const w = driveWindows(i, day);
  for (let k = 0; k < w.length; k++) if (inside(w[k], hour)) return true;
  return false;
}
export function isWalking(i, hour, day = 0) {
  const w = walkWindow(i, day);
  return !!w && inside(w, hour) && !isDriving(i, hour, day);
}

// Fills `out` with the indices of residents currently driving (or walking), among the first n people. Returns how many.
// O(n) hashes: n is a few thousand at most, and the callers run about twice a second.
export function drivingNow(n, hour, out, day = 0) {
  let c = 0;
  for (let i = 0; i < n && c < out.length; i++) if (isDriving(i, hour, day)) out[c++] = i;
  return c;
}
export function walkingNow(n, hour, out, day = 0) {
  let c = 0;
  for (let i = 0; i < n && c < out.length; i++) if (isWalking(i, hour, day)) out[c++] = i;
  return c;
}

// One-way car trips a resident makes in a day, on average. Feeds the demand model so trip totals follow the routines.
export function carTripsPerPerson() {
  const R = ROUTINE;
  return R.driveShare * (R.workerShare * 2 + (1 - R.workerShare) * (1 + R.errand2Share * 0.8));
}

// Whole residents for a float population.
export const headcount = (p) => Math.max(0, Math.floor(p));
