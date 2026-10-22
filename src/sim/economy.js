// Economy rules: costs, rates and unlock values. Every number comes from src/sim/balance.js.
import { BALANCE } from './balance.js';

export const BASE_RATE = BALANCE.base.coins;
export const PARTS_RATE = BALANCE.base.parts;
export const START_COINS = BALANCE.start.coins;
export const START_PARTS = BALANCE.start.parts;
export const MAX_LEVEL = 5;

export const income = (floors, level) => +(floors * 0.9 * level).toFixed(1);
export const upgradeCost = (floors, level) => Math.round(BALANCE.upgrade.base * Math.pow(BALANCE.upgrade.growth, level) * floors / 2);
export const trafficOf = (floors) => 8 + floors * 2;
export const nextLevelGain = (level) => Math.round(100 / level * 0.6);

// Exponential cost: the next building after `owned` costs base x r^owned.
export const buildCost = (base, owned, r = BALANCE.growth) => Math.round(base * Math.pow(r, Math.max(0, owned | 0)));
// Closed form for buying `k` more in a row: base x r^owned x (r^k - 1) / (r - 1). Used by the bulk preview; never loops.
export const bulkCost = (base, owned, k, r = BALANCE.growth) => (r === 1 ? base * k : base * Math.pow(r, owned) * (Math.pow(r, k) - 1) / (r - 1));

// A building that is not there (stale id, undone placement) has no level. Callers treat 0 as "nothing here".
export const levelOf = (state, b) => (b ? state.levels[b.id] ?? b.level : 0);
