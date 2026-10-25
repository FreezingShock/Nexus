// The one file to tune the economy. Costs, rates, unlock tiers, charge, Renewal and goals read from here; milestones have their own file (achievements.js).
// Change a number here and the sim, the HUD text and the tests follow. Keep values round; the tests check the rules, not the numbers.
export const BALANCE = {
  // Every price (buildings, roads, zones, upgrades, Parts gates) is `priceMult` times the old base, set by nate on 2026-10-22.
  // Income and Renewal stay as they were, so the same town takes about three times as long. Rewards below were raised to match.
  priceMult: 3,
  start: { coins: 3600, parts: 100 },

  // Per second, before any building. Founding buildings and zones add to these.
  base: { coins: 12, parts: 0.4 },

  // Building cost grows by `growth` for every building you have already placed: cost = base x growth^placed.
  // Open question carried from the design notes: 1.1 was the other candidate. 1.15 is the choice for now.
  growth: 1.15,

  // Upgrades: base x growth^level, scaled by floors / 2. Kept as its own curve, tunable here.
  upgrade: { base: 120, growth: 1.55 },

  // Zones: cost per painted tile, coins per second per level, Parts per second per level.
  zones: {
    res: { cost: 15, coins: 0.40, parts: 0 },
    com: { cost: 24, coins: 0.70, parts: 0 },
    ind: { cost: 18, coins: 0.55, parts: 0.05 },
    civ: { cost: 36, coins: 0.10, parts: 0.01 },
  },

  // Terrain tools: coins for each unit of ground a dab moves (one tile corner up or down by one). A medium dab moves about 3.
  land: { perEarth: 12 },

  // Parts gates for road types (tier 2 at 450, bus at 1,800, freeway at 4,500). Spent once per type.
  tiers: { bike: 450, one: 450, bus: 1800, free: 4500 },

  // Charge: an active-play boost meter. Building and painting add Charge; it also regenerates slowly. It never blocks anything.
  charge: { max: 100, regenPerS: 1 / 30, perAction: 1, boostCost: 25, boostS: 60, boostMult: 2 },

  // Renewal: a fresh start that keeps points. Points = floor(cbrt(coins earned this run / divisor)).
  renewal: { divisor: 1e7, bonusPerPoint: 0.02 }, // 10 million coins this run per point: about 5 hours to the first, decided by nate

  // Goals: three open at a time. Progress is kept until a goal is done, so nothing is lost by logging off.
  // Finishing all three in one local day pays a bonus; a missed day only resets the bonus streak, never coins or goals.
  goals: {
    open: 3,
    dailyBonus: { parts: 80, perStreakDay: 20, maxStreakDays: 7 },
    pool: [
      { k: 'paint', name: 'Paint 12 zone tiles', target: 12, reward: { parts: 50 } },
      { k: 'build', name: 'Place 2 buildings', target: 2, reward: { parts: 60 } },
      { k: 'road', name: 'Draw 16 road tiles', target: 16, reward: { coins: 900 } },
      { k: 'upgrade', name: 'Upgrade 3 buildings', target: 3, reward: { coins: 1200 } },
      { k: 'earn', name: 'Earn 3,000 coins', target: 3000, reward: { parts: 80 } },
      { k: 'boost', name: 'Use a Charge boost', target: 1, reward: { parts: 80 } },
    ],
  },

  // Milestones and achievements (stages, targets and rewards) live in src/sim/achievements.js.
};
