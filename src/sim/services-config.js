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
};

// Landmarks add a flat income on top of their happiness. Their coins are never subtracted.
export const LANDMARKS = {
  'town-hall':     { radius: 6, strength: 0.5, coins: 1.5 },
  church:          { radius: 5, strength: 0.4, coins: 0.6 },
};

export const MOOD = {
  base: 0.25,        // happiness of a tile with no coverage, so an empty corner is calm rather than sad
  saturation: 1,     // raw coverage at which the bonus is half of the rest; higher means slower to reach high values
  perTile: 0.04,     // coins per second per built tile at full happiness
  growthSwing: 0.8,  // zoning growth speed: 1 at the average happiness of 0.5, up to 1.4 or down to 0.6
  growthMin: 0.6,
  growthMax: 1.4,
};
