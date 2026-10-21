// The one file to tune the economy. Costs, rates, unlock tiers, charge, Renewal, goals and milestones all read from here.
// Change a number here and the sim, the HUD text and the tests follow. Keep values round; the tests check the rules, not the numbers.
export const BALANCE = {
  start: { coins: 1240, parts: 38 },

  // Per second, before any building. Founding buildings and zones add to these.
  base: { coins: 12, parts: 0.4 },

  // Building cost grows by `growth` for every building you have already placed: cost = base x growth^placed.
  // Open question carried from the design notes: 1.1 was the other candidate. 1.15 is the choice for now.
  growth: 1.15,

  // Upgrades: base x growth^level, scaled by floors / 2. Kept as its own curve, tunable here.
  upgrade: { base: 40, growth: 1.55 },

  // Zones: cost per painted tile, coins per second per level, Parts per second per level.
  zones: {
    res: { cost: 5, coins: 0.40, parts: 0 },
    com: { cost: 8, coins: 0.70, parts: 0 },
    ind: { cost: 6, coins: 0.55, parts: 0.05 },
    civ: { cost: 12, coins: 0.10, parts: 0.01 },
  },

  // Parts gates for road types (tier 2 at 150, bus at 600, freeway at 1,500). Spent once per type.
  tiers: { bike: 150, one: 150, bus: 600, free: 1500 },

  // Charge: an active-play boost meter. Building and painting add Charge; it also regenerates slowly. It never blocks anything.
  charge: { max: 100, regenPerS: 1 / 30, perAction: 1, boostCost: 25, boostS: 60, boostMult: 2 },

  // Renewal: a fresh start that keeps points. Points = floor(cbrt(coins earned this run / divisor)).
  renewal: { divisor: 1e7, bonusPerPoint: 0.02 }, // 10 million coins this run per point: about 5 hours to the first, decided by nate

  // Goals: three open at a time. Progress is kept until a goal is done, so nothing is lost by logging off.
  // Finishing all three in one local day pays a bonus; a missed day only resets the bonus streak, never coins or goals.
  goals: {
    open: 3,
    dailyBonus: { parts: 40, perStreakDay: 10, maxStreakDays: 7 },
    pool: [
      { k: 'paint', name: 'Paint 12 zone tiles', target: 12, reward: { parts: 25 } },
      { k: 'build', name: 'Place 2 buildings', target: 2, reward: { parts: 30 } },
      { k: 'road', name: 'Draw 16 road tiles', target: 16, reward: { coins: 300 } },
      { k: 'upgrade', name: 'Upgrade 3 buildings', target: 3, reward: { coins: 400 } },
      { k: 'earn', name: 'Earn 3,000 coins', target: 3000, reward: { parts: 20 } },
      { k: 'boost', name: 'Use a Charge boost', target: 1, reward: { parts: 40 } },
    ],
  },

  // Milestones pay once each. `stat` names a counter in state.stats, or 'earned' (coins this town has ever earned).
  milestones: [
    { id: 'coins-1k', text: 'Earn 1,000 coins', stat: 'earned', n: 1e3, reward: { parts: 15 } },
    { id: 'coins-100k', text: 'Earn 100,000 coins', stat: 'earned', n: 1e5, reward: { parts: 60 } },
    { id: 'coins-10m', text: 'Earn 10 million coins', stat: 'earned', n: 1e7, reward: { parts: 200 } },
    { id: 'place-1', text: 'Place your first building', stat: 'placed', n: 1, reward: { parts: 20 } },
    { id: 'place-10', text: 'Place 10 buildings', stat: 'placed', n: 10, reward: { parts: 50 } },
    { id: 'place-40', text: 'Place 40 buildings', stat: 'placed', n: 40, reward: { parts: 150 } },
    { id: 'paint-50', text: 'Paint 50 zone tiles', stat: 'painted', n: 50, reward: { parts: 40 } },
    { id: 'road-60', text: 'Draw 60 road tiles', stat: 'roadTiles', n: 60, reward: { coins: 800 } },
    { id: 'upgrade-10', text: 'Upgrade 10 buildings', stat: 'upgrades', n: 10, reward: { parts: 60 } },
    { id: 'boost-3', text: 'Use Charge boosts 3 times', stat: 'boosts', n: 3, reward: { parts: 50 } },
    { id: 'renew-1', text: 'Renew your town once', stat: 'renewals', n: 1, reward: { parts: 300 } },
  ],
};
