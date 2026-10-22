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
};

// Daily routines (src/sim/schedule.js). Hours are on the town clock, 0 to 24. Every person gets their own times from a hash of their index.
export const ROUTINE = {
  driveShare: 0.5,    // share of residents who drive (nate's pick pending: a third, a half or two thirds)
  workerShare: 0.7,   // of drivers: out in the morning, home in the evening. The rest run an errand
  amFrom: 6.5, amTo: 9, pmFrom: 16, pmTo: 18.5, // the morning and evening rush, per person within these
  errandFrom: 9.5, errandTo: 15, errand2Share: 0.25,
  driveMin: 0.35, driveMax: 0.9, // hours a drive lasts
  walkShare: 0.85,    // residents who take a walk on a given day
  walkMin: 0.3, walkMax: 0.9,
  walkSlots: [        // when a walk happens: weights sum to 1
    { weight: 0.25, from: 7, to: 9 },    // school run, dog, bread
    { weight: 0.2, from: 11.75, to: 13.25 }, // lunch
    { weight: 0.3, from: 15, to: 18 },   // afternoon
    { weight: 0.25, from: 18, to: 20.5 }, // evening stroll
  ],
};
