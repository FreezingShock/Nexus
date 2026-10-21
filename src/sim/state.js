import { START_COINS, START_PARTS } from './economy.js';

export function freshState() {
  return {
    coins: START_COINS, parts: START_PARTS,
    levels: {},        // building id -> level, only where it differs from the layout default
    removed: [],       // bulldozed building ids
    ringRoad: false,
    night: 0, speed: 1, paused: false,
    offline: null,     // unclaimed postcard: { coins, parts, awayS, fullS, easeS }
    log: [],           // recent actions, used for the postcard note
  };
}
