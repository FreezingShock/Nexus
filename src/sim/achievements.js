// Milestones and achievements: the catalogue and the pure rules. No state, no DOM, no THREE.
// Each goal has up to five stages (Bronze to Crown). Reaching a stage pays its reward once; a stage never un-completes,
// because progress is measured on the best value a metric has ever reached (state.ach.best), so a Renewal or a bulldozed
// street takes nothing away. Readers for the metrics live in achievement-metrics.js; the sim system is systems/achievements.js.
// All the numbers are here: change a target or a reward weight and the panel, the postcards and the tests follow.

export const STAGES = [
  { name: 'Bronze', color: '#C98A6E' },
  { name: 'Silver', color: '#CFCBC0' },
  { name: 'Gold', color: '#E6BC62' },
  { name: 'Laurel', color: '#A8C179' },
  { name: 'Crown', color: '#8FB8D6' },
];

// Reward for stage 1..5 of a goal of weight 1. A goal's `w` scales both, so a hard goal can pay more than an easy one.
// Generous on purpose: stage 1 is a pleasant bonus at the start and stage 5 a real prize late on.
export const REWARD_COINS = [1500, 9000, 60000, 450000, 3000000];
export const REWARD_PARTS = [40, 120, 300, 800, 2000];

export const GROUPS = [
  { id: 'town', name: 'Town', blurb: 'Homes, people and the buildings that fill the streets.' },
  { id: 'money', name: 'Coins', blurb: 'What the town earns, and the little boosts along the way.' },
  { id: 'roads', name: 'Roads', blurb: 'Streets, avenues and every kind in between.' },
  { id: 'zones', name: 'Zones', blurb: 'Painted ground where homes, shops and workshops grow.' },
  { id: 'services', name: 'Services', blurb: 'Clinics, schools, parks and landmarks that make streets happy.' },
  { id: 'farms', name: 'Farms', blurb: 'Fields, hedges and barns at the edge of town.' },
  { id: 'districts', name: 'Districts', blurb: 'Named quarters with their own flags.' },
  { id: 'seasons', name: 'Seasons', blurb: 'Time passing, and what the sky does with it.' },
  { id: 'renewal', name: 'Goals and Renewal', blurb: 'Daily goals, streaks and fresh starts.' },
];

// unlocks: { stage: roadTypeId }. Reaching that stage opens the road type for free (the Parts price is waived).
// stageText(n) replaces the default "<n> <unit>" wording where a number reads oddly.
export const GOALS = [
  // Town
  { id: 'population', group: 'town', name: 'Neighbours', blurb: 'People living in your homes and above your shops.', metric: 'population', unit: 'people', tiers: [60, 200, 600, 1800, 6000], unlocks: { 3: 'bus' } },
  { id: 'happiness', group: 'town', name: 'Happy streets', blurb: 'The average happiness of every built tile. Parks, clinics and shops lift it.', metric: 'happiness', unit: '% happy', tiers: [40, 55, 70, 80, 90], w: 1.5 },
  { id: 'placed', group: 'town', name: 'Builder', blurb: 'Buildings you have placed yourself, across every Renewal.', metric: 'placed', unit: 'buildings placed', tiers: [1, 10, 40, 100, 250] },
  { id: 'lots', group: 'town', name: 'Streets that grow', blurb: 'Buildings that have grown by themselves on painted ground.', metric: 'lots', unit: 'grown buildings', tiers: [5, 20, 60, 150, 400] },
  { id: 'upgrades', group: 'town', name: 'Fresh paint', blurb: 'Buildings you have upgraded to a new level.', metric: 'upgrades', unit: 'upgrades', tiers: [1, 10, 30, 80, 200] },
  { id: 'topLevel', group: 'town', name: 'Top storeys', blurb: 'Buildings standing at the highest level.', metric: 'topLevel', unit: 'top-level buildings', tiers: [1, 5, 15, 40, 100], w: 1.5 },
  // Coins
  { id: 'earned', group: 'money', name: 'Coins earned', blurb: 'Every coin this town has ever earned, kept across Renewals.', metric: 'earned', unit: 'coins', tiers: [1e3, 1e5, 1e7, 1e9, 1e11] },
  { id: 'income', group: 'money', name: 'Busy tills', blurb: 'The most coins a second the town has paid at once.', metric: 'income', unit: 'coins a second', tiers: [25, 100, 400, 1500, 6000] },
  { id: 'boosts', group: 'money', name: 'Charged up', blurb: 'Charge boosts you have used.', metric: 'boosts', unit: 'Charge boosts', tiers: [1, 3, 10, 30, 80] },
  // Roads
  { id: 'roadTiles', group: 'roads', name: 'Road builder', blurb: 'Road tiles you have drawn.', metric: 'roadTiles', unit: 'road tiles', tiers: [20, 60, 150, 400, 1000], unlocks: { 2: 'bike', 3: 'one', 5: 'free' } },
  { id: 'roadTypes', group: 'roads', name: 'Every kind of street', blurb: 'Different kinds of road in use at once.', metric: 'roadTypes', unit: 'kinds of road', tiers: [2, 3, 4, 5], w: 1.5 },
  // Zones
  { id: 'painted', group: 'zones', name: 'Painted ground', blurb: 'Zone tiles you have painted.', metric: 'painted', unit: 'zone tiles', tiers: [12, 50, 150, 400, 1000] },
  { id: 'zoneKinds', group: 'zones', name: 'A bit of everything', blurb: 'Kinds of zone with a building grown on them: homes, shops, workshops and civic.', metric: 'zoneKinds', unit: 'kinds of zone', tiers: [1, 2, 3, 4], w: 1.5 },
  // Services
  { id: 'services', group: 'services', name: 'Town services', blurb: 'Clinics, schools, fire and police stations.', metric: 'services', unit: 'services', tiers: [1, 3, 6, 10, 20] },
  { id: 'serviceKinds', group: 'services', name: 'A full set', blurb: 'Different kinds of service: clinic, school, fire station and police.', metric: 'serviceKinds', unit: 'kinds of service', tiers: [1, 2, 3, 4], w: 1.5 },
  { id: 'parks', group: 'services', name: 'Green corners', blurb: 'Parks, greens, plazas and ponds.', metric: 'parks', unit: 'parks', tiers: [1, 4, 10, 20, 40] },
  { id: 'landmarks', group: 'services', name: 'Landmarks', blurb: 'Town halls and churches that everyone can see from afar.', metric: 'landmarks', unit: 'landmarks', tiers: [1, 2, 4], w: 2 },
  // Farms
  { id: 'farms', group: 'farms', name: 'Farmers', blurb: 'Farms you have placed.', metric: 'farms', unit: 'farms', tiers: [1, 3, 6, 12, 24] },
  { id: 'farmland', group: 'farms', name: 'Acres under crops', blurb: 'Tiles of farmland, fields and farmyards together.', metric: 'farmland', unit: 'tiles of farmland', tiers: [10, 40, 120, 300, 800] },
  // Districts
  { id: 'districts', group: 'districts', name: 'Named quarters', blurb: 'Districts with a name and a flag.', metric: 'districts', unit: 'districts', tiers: [1, 3, 6, 10, 15] },
  { id: 'districtTiles', group: 'districts', name: 'Painted quarters', blurb: 'Tiles that belong to a district.', metric: 'districtTiles', unit: 'district tiles', tiers: [25, 100, 300, 800, 2000] },
  // Seasons
  { id: 'seasons', group: 'seasons', name: 'Seasons turn', blurb: 'Seasons that have passed in the town, awake or away.', metric: 'seasons', unit: 'seasons', tiers: [1, 4, 8, 20, 40] },
  { id: 'snow', group: 'seasons', name: 'First snow', blurb: 'Watch the first snowfall settle on the rooftops.', metric: 'snow', unit: 'snowfall', tiers: [1], w: 2, stageText: () => 'See the first snow' },
  // Goals and Renewal
  { id: 'goalsDone', group: 'renewal', name: 'Goal getter', blurb: 'Town goals you have finished.', metric: 'goalsDone', unit: 'goals', tiers: [3, 15, 50, 150, 400] },
  { id: 'dailies', group: 'renewal', name: 'Daily sets', blurb: 'Days you finished all of the day\'s goals.', metric: 'dailies', unit: 'daily sets', tiers: [1, 5, 15, 40, 100] },
  { id: 'streak', group: 'renewal', name: 'Day after day', blurb: 'Your longest run of daily sets. Missing a day only starts the count again.', metric: 'streak', unit: 'days in a row', tiers: [2, 4, 7, 14, 30], w: 1.5 },
  { id: 'renewals', group: 'renewal', name: 'Fresh starts', blurb: 'Times you have renewed the town.', metric: 'renewals', unit: 'Renewals', tiers: [1, 3, 6, 12, 25], w: 2 },
  { id: 'points', group: 'renewal', name: 'Kept points', blurb: 'Renewal points you hold. Each one is +2% income for good.', metric: 'points', unit: 'points', tiers: [1, 3, 8, 20, 50], w: 2 },
];

export const goalById = (id) => GOALS.find((g) => g.id === id) || null;
export const totalStages = () => GOALS.reduce((n, g) => n + g.tiers.length, 0);

// Counters the state already keeps. The panel reads these directly, so it is never behind; every other metric is read
// by the sim (achievement-metrics.js) and shown from state.ach.best.
export const DIRECT = {
  earned: (s) => s.earned, renewals: (s) => s.renewals, points: (s) => s.points,
  placed: (s) => s.stats.placed, painted: (s) => s.stats.painted, roadTiles: (s) => s.stats.roadTiles,
  upgrades: (s) => s.stats.upgrades, boosts: (s) => s.stats.boosts,
  goalsDone: (s) => s.ach.counts.goalsDone, dailies: (s) => s.ach.counts.dailies,
};

// The best value a goal's metric has reached. Never goes down.
export function valueOf(state, goal) {
  const ach = state.ach || { best: {} };
  const best = ach.best[goal.metric] || 0;
  const direct = DIRECT[goal.metric];
  let now = 0;
  try { now = direct ? direct(state) : 0; } catch { now = 0; }
  return Math.max(best, Number.isFinite(now) ? now : 0);
}

// How many stages a value has reached.
export function stagesReached(goal, value) {
  let n = 0;
  while (n < goal.tiers.length && value >= goal.tiers[n]) n++;
  return n;
}

// Reward for stage 1..5. Whole numbers, rounded to something readable.
export function rewardFor(goal, stage) {
  const w = goal.w || 1, i = Math.min(stage, 5) - 1;
  const coins = REWARD_COINS[i] * w, parts = REWARD_PARTS[i] * w;
  return { coins: Math.round(coins / 10) * 10, parts: Math.round(parts / 5) * 5 };
}
export const unlockFor = (goal, stage) => (goal.unlocks && goal.unlocks[stage]) || null;

const fmtN = (n) => {
  if (n >= 1e9) return +(n / 1e9).toFixed(1) + ' billion';
  if (n >= 1e6) return +(n / 1e6).toFixed(1) + ' million';
  return Math.round(n).toLocaleString('en-US');
};
export const fmtTarget = (goal, n) => (goal.stageText ? goal.stageText(n) : fmtN(n) + ' ' + goal.unit);

// One goal's standing: stages done (as paid), the best value, the next target and how far along it is.
// `done` is what was paid; a stage can be reached but not yet paid for a moment (the next evaluation pays it).
export function standing(state, goal) {
  const value = valueOf(state, goal);
  const done = Math.min(goal.tiers.length, (state.ach && state.ach.done[goal.id]) || 0);
  const next = done < goal.tiers.length ? goal.tiers[done] : null;
  const from = done > 0 ? goal.tiers[done - 1] : 0;
  const frac = next === null ? 1 : Math.max(0, Math.min(1, (value - from) / (next - from)));
  return { goal, value, done, total: goal.tiers.length, next, frac, complete: next === null };
}

export function summary(state) {
  let stages = 0, goalsComplete = 0;
  for (const g of GOALS) {
    const s = standing(state, g);
    stages += s.done;
    if (s.complete) goalsComplete++;
  }
  return { stages, totalStages: totalStages(), goalsComplete, totalGoals: GOALS.length };
}

// The unfinished goals that are closest to their next stage, nearest first.
export function nearest(state, n = 3) {
  return GOALS.map((g) => standing(state, g)).filter((s) => !s.complete).sort((a, b) => b.frac - a.frac).slice(0, n);
}

export function rewardLine(reward, unlock, roadName = (id) => id) {
  const bits = [];
  if (reward.coins) bits.push('+' + reward.coins.toLocaleString('en-US') + ' coins');
  if (reward.parts) bits.push('+' + reward.parts.toLocaleString('en-US') + ' Parts');
  if (unlock) bits.push('opens ' + roadName(unlock));
  return bits.join(' · ');
}

// Saves from before the stages kept a flat list of milestone ids. Each id was the same achievement as one stage here, so
// the migration marks those stages paid (they must never pay twice).
export const LEGACY_MILESTONES = {
  'coins-1k': ['earned', 1], 'coins-100k': ['earned', 2], 'coins-10m': ['earned', 3],
  'place-1': ['placed', 1], 'place-10': ['placed', 2], 'place-40': ['placed', 3],
  'paint-50': ['painted', 2], 'road-60': ['roadTiles', 2], 'upgrade-10': ['upgrades', 2],
  'boost-3': ['boosts', 2], 'renew-1': ['renewals', 1],
};
export function legacyDone(ids) {
  const done = {};
  for (const id of Array.isArray(ids) ? ids : []) {
    const m = Object.prototype.hasOwnProperty.call(LEGACY_MILESTONES, id) ? LEGACY_MILESTONES[id] : null;
    if (m) done[m[0]] = Math.max(done[m[0]] || 0, m[1]);
  }
  return done;
}
