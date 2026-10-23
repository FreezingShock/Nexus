import { START_COINS, START_PARTS } from './economy.js';
import { systems } from './systems/index.js';
import { newSeed } from '../world/terrain.js';

export function freshState() {
  const base = {
    coins: START_COINS, parts: START_PARTS,
    levels: {},        // building id -> level, only where it differs from the layout default
    removed: [],       // bulldozed building ids
    terrainSeed: newSeed(), // the land: rolled when a village starts and again at Renewal; 0 is the old land (see world/terrain.js)
    night: 0, speed: 1, paused: false,
    offline: null,     // unclaimed postcard: { coins, parts, awayS, fullS, easeS }
    log: [],           // recent actions, used for the postcard note
  };
  // systems add their own fields (see src/sim/systems/index.js)
  for (const d of systems) if (d.state) Object.assign(base, d.state());
  return base;
}
