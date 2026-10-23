# Milestones and achievements

A panel on the right of the screen (tile in the top bar menu, key **M**) lists every goal with its stages, a progress bar to the next stage and what each stage pays. Rewards are paid by the sim the first time a stage is reached, so the panel only looks.

## How it works

- **Catalogue**: `src/sim/achievements.js`. Each goal has a group, a metric, up to five targets (stages Bronze, Silver, Gold, Laurel, Crown), an optional weight `w` and optional road unlocks. Targets, reward tables and weights are all in this file.
- **Metrics**: `src/sim/achievement-metrics.js`. One pure reader per metric (population, happiness, farms, districts, seasons and so on). Counters the state already keeps (coins earned, placed, painted, road tiles, upgrades, boosts, Renewals, points) are read directly.
- **System**: `src/sim/systems/achievements.js`. Reads every metric after each command and on every third tick, raises `best`, pays each newly reached stage once and emits `milestone` events (postcard notes). Never loops over time: seasons come from the game clock in closed form, and a welcome-back leaves rewards to the next tick.
- **Panel**: `src/ui/modules/milestones.js` and `css/milestones.css`. Tabs by group, an "Almost there" list on All, expandable goals that list every stage.

## Rewards

Stage 1 to 5 of a goal of weight 1 pays 500 / 3,000 / 20,000 / 150,000 / 1,000,000 coins and 20 / 60 / 150 / 400 / 1,000 Parts (`REWARD_COINS`, `REWARD_PARTS`). Harder or rarer goals have `w` above 1. Some stages open a road type for free (`unlocks`), for example Silver Road builder opens the bike street. Nothing here costs the player anything: a stage is never taken back.

## Saved state

`state.ach = { done, best, counts }`:

- `done`: `{ goalId: stages paid }`
- `best`: `{ metric: best value ever reached }`. Progress and stages are measured on this, so a Renewal, a bulldozed street or a shrinking town never costs a stage.
- `counts`: `{ goalsDone, dailies }`, events nothing else counts.

Sanitized on load (unknown goals dropped, stages clamped to the goal's length). A Renewal keeps `ach`. Version 6 of the save created it from the old milestone list; see [SAVE.md](SAVE.md).

## Rules worth knowing

- The starter village is a gift: its buildings do not count towards Builder, services, parks, farms or top storeys. Its homes do count as neighbours.
- Several stages reached in one pass (an old town on its first tick, a big jump) arrive as one bundled postcard instead of a pile.
- To add a goal: add an entry to `GOALS`, add a reader to `METRICS` if it needs a new number, and the tests check that every goal has one.
- Tests that count every coin use `quietSim` (`tests/support/quiet.js`), which starts with all stages already paid.

## Not browser-run

The panel's layout and look have not been checked in a real browser; the logic and the DOM paint were exercised in node against a small DOM, and the rest is for localhost.
