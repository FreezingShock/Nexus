# Economy and progression

Every number lives in [src/sim/balance.js](../src/sim/balance.js). Change it there; the sim, the HUD text and the tests read from it.

## Currencies and rates

- **Coins**: `base 12/s` + building income (level) + zone income + every system's `rate`, then multiplied by every system's `mult` (Charge boost, Renewal points).
- **Parts**: `base 0.4/s` + zone Parts (`partsRate`). Industrial lots make most of it; civic a little.
- **Lifetime earned** (`state.earned`): coins this town has ever earned. Never reset.
- **Run earned** (`state.runEarned`): coins since the last Renewal. Points come from this.

## Costs

- Placed buildings: `base x 1.15^placed` (`buildCost` in `src/sim/economy.js`). `bulkCost` gives the closed-form total for buying k in a row; it never loops.
- Upgrades keep their own curve, `40 x 1.55^level x floors / 2`, in the same config.
- Zone paint and road tiles cost a fixed amount per tile.

Open question from the design notes: 1.1 versus 1.15 for buildings. **Chosen: 1.15.** Change `growth` in balance.js to try 1.1.

## Parts tiers

Road types gate on Parts once, in `BALANCE.tiers`: tier 2 (`bike`, `one`) at 150, `bus` at 600, `free` at 1,500. Roads already on the map stay open after a tier is added. Services are display-only until their own system lands, so they are not gated yet.

## Charge

Charge is an active-play meter, 0 to 100. Building, painting and upgrading add 1 each; it regenerates 1 per 30 s. The **Boost** spends 25 Charge for coins x2 for 60 simulated seconds. A boost never runs while away (it is cleared on load).

## Goals and daily bonus

- Three goals are open at a time. Each has progress that is kept until it is done (nothing is lost by logging off or missing a day).
- A finished goal pays its reward once and its slot starts a new goal, picked from a seeded sequence (`pickGoal` in `src/sim/progress.js`).
- Finishing all three in one local day pays a bonus. Missing a day only resets the streak; it never takes coins or progress.

## Milestones

Milestones are now stages of tiered goals: see [MILESTONES.md](MILESTONES.md). They pay coins and Parts (and sometimes open a road type) the first time each stage is reached, and Renewal keeps every stage. The simple milestone list that used to live in `balance.js` is gone; the v6 save migration turned the old paid ids into the matching stages so nothing pays twice.

## Renewal

Renewal is a fresh start. Points = `floor(cbrt(runEarned / divisor))`. Each kept point is +2% income. Renewal needs at least one point ready.

- Resets: coins, Parts, buildings (levels and removals), zones, roads, the run's coins, Parts placed.
- Keeps: points, renewals, lifetime coins, unlocked road tiers, milestone stages (`state.ach`), goals, Charge, night and speed.

**Divisor is 1e7 (10 million coins this run per point), decided by nate.** That gives the first point in about 5 active hours, matching the design notes. At 1e9 the first point took about 278 hours at 1,000 coins/s.

## Saved state

Owned by `src/sim/systems/progression.js` (through `state()` and `sanitize()`):

```
earned        number   lifetime coins
runEarned     number   coins this run
points        int      Renewal points (kept)
renewals      int
charge        number   0..100
boostS        number   always 0 on load
stats         { placed, painted, roadTiles, upgrades, boosts }   ints
goals         { slots: [{k, p}] x3, seq, day, doneToday, bonusDay, streak }
```

Also written by existing systems: `coins`, `parts`, `roadUnlocks` (tiers), `night`, `speed`. No migration was needed: every new field has a sanitize default. The save version is unchanged (1). The saves thread should bump it when it next changes a field's meaning.

## Hooks used by the economy

See [EXTENDING.md](EXTENDING.md): `rate`, `partsRate`, `mult`, `tick(ctx, gain)`, `offline(ctx, seconds, gainC)`, and `init` that is safe to run twice (Renewal calls it again through `ctx.rebuild()`).

## Tests

`tests/economy.test.js` covers costs, tiers, Parts from zones, Charge and boost, goals and the daily bonus with its streak, points, Renewal, offline gains, sanitize and day keys. Balance is tested by rules, not by fixed numbers, so a tuning change does not break the suite.
