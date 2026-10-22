// Population tunables. Everything is in people or seconds. See docs/POPULATION.md.
export const POP = {
  perFloor: 2,        // people a placed home holds, per storey
  perLotLevel: 3,     // people a grown residential lot holds, per level
  timeConstS: 300,    // seconds to close two thirds of the gap to capacity at average happiness (nate chose about 5 minutes)
  mBase: 0.4,         // speed multiplier floor: an unhappy town still fills
  mSwing: 0.9,        // plus this much at full happiness
  avgHappy: 0.5,      // the happiness that counts as average for the time constant
  startShare: 0.6,    // an old save with no population starts at this share of capacity
  wBase: 0.5,         // how strongly local happiness decides which homes fill first
  carsPerPerson: 0.3, // visual cars at most per resident
  walkersPerPerson: 0.6,
};
