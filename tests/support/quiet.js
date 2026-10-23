// Milestone rewards pay coins and Parts the first time something happens (a first building, a first upgrade), which
// would blur tests that count every coin. quietSim makes a sim whose stages are all already paid, so only the rule under
// test moves money. The achievements tests make plain sims instead.
import { createSim } from '../../src/sim/sim.js';
import { GOALS } from '../../src/sim/achievements.js';

export function settle(sim) {
  for (const g of GOALS) sim.state.ach.done[g.id] = g.tiers.length;
  return sim;
}
export const quietSim = (opts) => settle(createSim(opts));
