# Population

Homes hold people. Total population climbs slowly toward the capacity of all homes, faster when the town is happy and well served. Population sets how many cars and walkers you see, and later feeds demand, milestones and farms.

## What the research could and could not confirm

Sources for Cities: Skylines 2 internals were thin. Verified only in words, no numbers: household demand (hidden, decides whether new households spawn) is separate from building demand (the RCI bar); happiness is well-being plus health; services, shops, parks and landmarks raise it; attractiveness (happiness, landmarks, shops) draws newcomers; people without a home become homeless. Household size, move-in rate, vacancy thresholds and trips per household could not be verified. CityRT could not be found as a game, so nothing here cites it. The formulas below are our own, built to be cozy and closed-form.

## Model

- **Capacity** of a home: 2 people per storey for placed homes (cottage 2 to 4, tower 14 to 18); 3 per level for grown residential lots. Tunable in `src/sim/population-config.js`.
- **Population** `p` is one saved number (a float). Occupants of each home are derived, not saved: `p` is shared across homes in proportion to capacity times local happiness, capped at capacity. The inspect card shows "3 of 4 rooms lived in".
- **Growth** (per second): `dp/dt = g * m * (C - p)`, with `m = 0.4 + 0.9 * happiness` (happiness already includes service coverage) and `C` total capacity. `m` never drops below 0.4, so an empty town still fills. Defaults: about 5 minutes to close two thirds of the gap at average happiness (nate's pick). Happiness only bends the speed, it never stops growth, and there is no emigration below capacity (if homes are bulldozed, `p` eases down to the new capacity).
- **Offline**: closed form `p(t) = C - (C - p0) * e^(-g*m*t)` evaluated once over the same clamped window as income. No tick loop, and the rate used is the one before the absence, like income.
- **Arrivals** come through the mountain tunnel: the arrival rate `dp/dt` sets how often walkers and cars emerge from the gate (visual only).
- **Visual counts**: cars follow the traffic volume, which now scales with population (trips per person), and walkers scale with population, both within the existing caps and the Graphics setting.
- **Later hooks** (not built here): jobs and demand, milestones, farm food.

## Save

One new key `pop` (float), added by the population system. Older saves get a starting population from their homes' capacity (migration, SAVE_VERSION 7).

## Top bar

A population line in the town plaque's hover card (people, homes full or empty, growth speed and what is helping). No change to the bar layout.

## Decisions (nate, 2026-10-22)

- Occupants are derived from one saved number, not saved per home.
- Fill speed: about 5 minutes time constant.
- Population does not change coin income for now (visuals only).

## Population panel

A chip in the bottom left (key U) opens a paper panel: people against places, a graph of the last 30 minutes (15 s samples kept in the save as `popHist`, at most 120), a dashed capacity line, homes lived in, free places, moving-in rate, pace and time to fill. Hover card on the town plaque shows the same headline numbers.
