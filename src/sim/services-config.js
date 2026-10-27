// Tunable numbers for services, parks, landmarks and happiness. Every knob for this system lives here.
// Radius is in tiles, measured from the edge of a building's footprint (Chebyshev distance). Strength is the
// happiness a tile gets right at the edge; it fades straight to nothing at radius + 1.
// Upkeep is coins per second that the building costs. It is small on purpose: services never fail or shut down.

export const SERVICES = {
  clinic:          { radius: 4, strength: 0.5, upkeep: 0.25 },
  school:          { radius: 5, strength: 0.4, upkeep: 0.35 },
  'fire-station':  { radius: 4, strength: 0.4, upkeep: 0.3 },
  police:          { radius: 4, strength: 0.4, upkeep: 0.3 },
};

export const PARKS = {
  green:           { radius: 3, strength: 0.45, upkeep: 0.05 },
  plaza:           { radius: 3, strength: 0.3,  upkeep: 0.05 },
  playground:      { radius: 3, strength: 0.5,  upkeep: 0.1 },
  pond:            { radius: 3, strength: 0.4,  upkeep: 0.05 },
  garden:          { radius: 3, strength: 0.45, upkeep: 0.08 },
  square:          { radius: 4, strength: 0.4,  upkeep: 0.12 },
  orchard:         { radius: 3, strength: 0.35, upkeep: 0.05 },
};

// Landmarks add a flat income on top of their happiness. Their coins are never subtracted.
export const LANDMARKS = {
  'town-hall':     { radius: 6, strength: 0.5, coins: 1.5 },
  church:          { radius: 5, strength: 0.4, coins: 0.6 },
};

// Shops lift the homes around them. Placed shops use SHOPS; a grown Commercial tile uses SHOP_LOT (scaled a little by its level).
export const SHOPS = {
  'shop-row':      { radius: 3, strength: 0.3 },
  cafe:            { radius: 3, strength: 0.4 },
  bakery:          { radius: 3, strength: 0.4 },
  department:      { radius: 5, strength: 0.5 },
  market:          { radius: 4, strength: 0.45 },
};
export const SHOP_LOT = { radius: 2, strength: 0.25 };

// Industry eases happiness down around it, a little and never below MOOD.floor. Placed industry uses INDUSTRY;
// a grown Industrial tile uses INDUSTRY_LOT. Offices are workplaces, not industry, so they do not appear here.
export const INDUSTRY = {
  workshop:        { radius: 3, strength: 0.4 },
  warehouse:       { radius: 4, strength: 0.4 },
};
export const INDUSTRY_LOT = { radius: 3, strength: 0.25 };

// A grown lot's strength grows a little with its level: level 1 is 0.8 of the base, level 5 is 1.2.
export const LOT_LEVEL_SCALE = (level) => 0.7 + 0.1 * level;

export const MOOD = {
  base: 0.25,        // happiness of a tile with no coverage, so an empty corner is calm rather than sad
  saturation: 1,     // raw coverage at which the bonus is half of the rest; higher means slower to reach high values
  industryMax: 0.15, // most happiness that industry can take away from a tile, reached only with heavy industry nearby
  industrySaturation: 1, // industry at which half of industryMax applies; the drag saturates like coverage does
  floor: 0.1,        // no tile drops below this, however much industry is near: gentle, never punishing
  gainMin: 0.02,     // a home must gain at least this much from a new building for a heart to rise over it
  gainCap: 40,       // at most this many homes get a heart from one placement, so a big build stays readable
  perTile: 0.04,     // coins per second per built tile at full happiness
  growthSwing: 0.8,  // zoning growth speed: 1 at the average happiness of 0.5, up to 1.4 or down to 0.6
  growthMin: 0.6,
  growthMax: 1.4,
};

// The Happiness panel's words and thresholds. A home counts as "reached" by a kind when that kind's weight there is at least
// `touch`. A tip needs at least `minHomes` homes to be worth saying, and the panel shows at most `tipsMax` tips.
export const ADVICE = {
  touch: 0.02,
  minHomes: 3,
  tipsMax: 3,
  levels: [
    { min: 0.6, label: 'Cozy' },
    { min: 0.45, label: 'Settled' },
    { min: 0.3, label: 'Finding its feet' },
    { min: 0, label: 'Just getting started' },
  ],
};
