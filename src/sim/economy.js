// Placeholder economy carried over from the mockup (tuned in the progression milestone).
export const BASE_RATE = 12;
export const PARTS_RATE = 0.4;
export const START_COINS = 1240;
export const START_PARTS = 38;
export const MAX_LEVEL = 5;

export const income = (floors, level) => +(floors * 0.9 * level).toFixed(1);
export const upgradeCost = (floors, level) => Math.round(40 * Math.pow(1.55, level) * floors / 2);
export const trafficOf = (floors) => 8 + floors * 2;
export const nextLevelGain = (level) => Math.round(100 / level * 0.6);

export const levelOf = (state, b) => state.levels[b.id] ?? b.level;

// Rate is derived from levels, never stored, so it cannot drift from a save.
export function coinRate(state, layout) {
  const gone = new Set(state.removed);
  let r = BASE_RATE;
  for (const b of layout.buildings) {
    if (gone.has(b.id)) continue;
    r += income(b.floors, levelOf(state, b)) - income(b.floors, b.level);
  }
  return Math.round(r * 10) / 10;
}
