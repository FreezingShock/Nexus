// Population rules. Pure: no DOM, no THREE, no sim. See docs/POPULATION.md.
import { POP } from './population-config.js';

// Speed multiplier from average happiness (0..1). Bends the rate, never stops it.
export const speedOf = (happy) => POP.mBase + POP.mSwing * Math.min(1, Math.max(0, happy));
// Rate constant g in dp/dt = g * m * (C - p), so m at average happiness gives the chosen time constant.
export const rateG = () => 1 / (POP.timeConstS * speedOf(POP.avgHappy));

// Closed form after t seconds with C and m held fixed. Moves toward C from either side. Never loops.
export function advance(p, cap, happy, t) {
  if (!(t > 0)) return p;
  const next = cap - (cap - p) * Math.exp(-rateG() * speedOf(happy) * t);
  return Math.min(Math.max(next, 0), Math.max(cap, 0));
}

// Where an old save starts.
export const startPop = (cap) => cap * POP.startShare;

// People per second moving in right now (0 when full or not growing).
export const arrivalRate = (p, cap, happy) => Math.max(0, rateG() * speedOf(happy) * (cap - p));

// Capacity of one home: a placed home by storeys, a grown lot by level.
export const capacityOfHome = (floors) => POP.perFloor * floors;
export const capacityOfLot = (level) => POP.perLotLevel * level;

// Occupants of one home when the town holds p people in total capacity cap. Happier homes fill first.
export function occupantsOf(capacity, p, cap, local, avg) {
  if (cap <= 0) return 0;
  const w = (POP.wBase + local) / (POP.wBase + avg);
  return Math.min(capacity, capacity * (p / cap) * w);
}

// Cars and walkers that should be on screen for p people.
export const carsFor = (p) => Math.round(p * POP.carsPerPerson);
export const walkersFor = (p) => Math.round(p * POP.walkersPerPerson);

// Words and numbers for the panel. Pure.
export function summaryOf(p, cap, happy) {
  const m = speedOf(happy), rel = m / speedOf(POP.avgHappy);
  const perMin = arrivalRate(p, cap, happy) * 60;
  const gap = Math.max(0, cap - p);
  const g = rateG() * m;
  // Seconds until fewer than half a person is missing; closed form, no loop.
  const toFull = gap > 0.5 ? Math.log(gap / 0.5) / g : 0;
  return {
    people: p, capacity: cap, vacancy: gap, fill: cap > 0 ? p / cap : 0, perMin, relSpeed: rel, toFullS: toFull,
    pace: rel >= 1.15 ? 'Quick' : rel >= 0.85 ? 'Steady' : 'Slow',
  };
}
