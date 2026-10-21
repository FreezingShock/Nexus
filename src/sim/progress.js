// Pure rules for progression: Renewal points, local day keys, goal picking and reward text. No state, no DOM.
import { BALANCE } from './balance.js';


// Renewal points for coins earned this run. floor(cbrt(runEarned / divisor)).
export const pendingPoints = (runEarned, divisor = BALANCE.renewal.divisor) => Math.floor(Math.cbrt(Math.max(0, runEarned) / divisor));
// Income multiplier from kept points: +2% per point.
export const pointsMult = (points) => 1 + BALANCE.renewal.bonusPerPoint * points;
// Coins this run need before the next point is available.
export const runNeededFor = (points, divisor = BALANCE.renewal.divisor) => divisor * Math.pow(points + 1, 3);

// Local calendar day as YYYY-MM-DD. Uses the sim clock, so tests and time-skips stay honest.
const pad = (n) => (n < 10 ? '0' : '') + n;
export function dayKey(ms) {
  const d = new Date(ms);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
export function yesterdayKey(ms) {
  const d = new Date(ms);
  d.setDate(d.getDate() - 1);
  return dayKey(d.getTime());
}

const hash = (n) => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0; h ^= h >>> 13; return Math.imul(h, 0xc2b2ae35) >>> 0; };

// The next goal kind from the seeded sequence, skipping kinds already on the board. Returns the kind and the next seq.
export function pickGoal(seq, taken = []) {
  const pool = BALANCE.goals.pool;
  const start = hash(seq) % pool.length;
  for (let n = 0; n < pool.length; n++) {
    const g = pool[(start + n) % pool.length];
    if (!taken.includes(g.k)) return { k: g.k, seq: seq + 1 };
  }
  return { k: pool[start].k, seq: seq + 1 }; // unreachable while the board is smaller than the pool
}
export const goalDef = (k) => BALANCE.goals.pool.find((g) => g.k === k) || null;

export function rewardText(r) {
  const parts = [];
  if (r.coins) parts.push('+' + Math.round(r.coins).toLocaleString('en-US') + ' coins');
  if (r.parts) parts.push('+' + Math.round(r.parts) + ' Parts');
  return parts.join(' · ');
}
