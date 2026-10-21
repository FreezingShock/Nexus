// Closed-form offline catch-up. Never loops over ticks.
export const CAP_S = 24 * 3600;
export const FULL_S = 4 * 3600;
export const DECAY_S = 4 * 3600;
export const FLOOR = 0.1;
export const LANTERN_BONUS_S = 2 * 3600; // per Lantern level, max 3
export const MIN_POSTCARD_S = 300;

export function awaySeconds(savedAt, now) {
  const d = (now - savedAt) / 1000;
  if (!Number.isFinite(d) || d < 0) return 0; // clock moved back or bad save: no income, no penalty
  return Math.min(d, CAP_S);
}

// Seconds of full-rate income earned in `awayS` of absence.
export function offlineWindow(awayS, lantern = 0) {
  const W = FULL_S + LANTERN_BONUS_S * Math.min(3, Math.max(0, lantern | 0));
  const full = Math.min(awayS, W);
  const d = Math.min(Math.max(awayS - W, 0), DECAY_S);
  const decay = d - ((1 - FLOOR) * d * d) / (2 * DECAY_S);
  const flat = Math.max(awayS - W - DECAY_S, 0) * FLOOR;
  return { awayS, fullS: full, easeS: awayS - full, effectiveS: full + decay + flat };
}
