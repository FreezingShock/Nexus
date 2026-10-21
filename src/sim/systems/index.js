// The list of sim systems. To add a feature, create src/sim/systems/<name>.js and add one line here.
// (This file merges with `merge=union` in .gitattributes, so parallel one-line additions rarely conflict.)
//
// A system is a plain object. Every field except `id` is optional:
//   id                  unique string
//   state()             returns default fields to add to a fresh state, e.g. { districts: [] }
//   sanitize(raw, fresh) returns the fields to keep from an untrusted saved state (clamp and validate)
//   init(ctx)           once, when the sim is created: build derived data (such as grid layers) from state
//   commands            { commandName(ctx, cmd) }  handlers for sim.dispatch({ type: 'commandName', ... })
//   rate(ctx)           extra coins per second, added to the building income
//   offline(ctx, s)     closed-form catch-up for s effective seconds away (no tick loops)
//   tick(ctx)           runs once per 1 Hz tick, after income is added
// ctx = { sim, state, layout, grid, emit, note, refresh, charge(cost), syncDisplay() }.
// Systems never touch the DOM or Three.js.
import core from './core.js';
import upgrades from './upgrades.js';
import roads from './roads.js';
import offlinePostcard from './offline-postcard.js';
import zoning from './zoning.js';

import placement from './placement.js';

export const systems = [core, upgrades, roads, offlinePostcard, zoning, placement];
