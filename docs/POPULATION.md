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
- **Visual counts**: cars and walkers are the residents who are out right now (see Daily routines), within the Graphics setting. Traffic trip totals scale with the population too.
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

A chip in the bottom left (key U) opens a paper panel: people against places, a graph of the last 10 minutes (15 s samples kept in the save as `popHist`, 41 at most), hoverable at each 2-minute step with people, places and moving-in rate, a dashed capacity line, homes lived in, free places, moving-in rate, pace and time to fill. Hover card on the town plaque shows the same headline numbers.

## Daily routines

`src/sim/schedule.js`, tunables in `ROUTINE` (`population-config.js`). Nothing per person is saved: a person's times come from a hash of their index, so person `i` at hour `h` always does the same thing, and the sim stays 1 Hz and closed form. The clock used is `state.routineHour` (the true town clock; a day/night lock does not freeze routines).

- **Drivers**: a third of residents (nate's pick) have a car. Of those, 70% are workers who drive out between 6:30 and 9:00 and home between 16:00 and 18:30 (each person their own minute); the rest run one errand between 9:30 and 15:00, a quarter of them a second one. A drive lasts 20 to 55 minutes of town time.
- **Walkers**: 85% of residents take one walk a day, in the morning (7 to 9), at lunch, in the afternoon (15 to 18) or in the evening (18 to 20:30), lasting 20 to 55 minutes. Nobody walks while driving.
- **On screen**: the cars are the residents whose drive window is open (about 1 in 10 residents at rush hour, none at night), and each car is a particular resident, so their model and colour never change. Walkers are likewise residents on their walk, with their own coat, trousers, skin, hair, size (children, elders) and pace; they step into a doorway when their window closes.
- **Demand model**: the gravity and BPR model is unchanged, but trip totals now scale with `state.pop` and the routines (`carTripsPerPerson`, about 0.85 car trips per resident a day at defaults), not with the capacity of buildings. Only car trips are counted.
- Not browser-run. Checked in node only: schedule shares and peaks, trips scaling with population.

## Day-to-day variety

Windows are seeded by person and by day (`dayUnit(i, day, salt)`, day from `dayIndexOf(state.days)`): drive and walk times slide up to `ROUTINE.dayShift` hours, `dayOff` of drivers stay home, walks are rolled fresh daily (half of walkers, `habit`, keep a favourite slot). Life movers follow the same idea in `src/render/life/rules.js`: tractors, forklifts and vans have per-yard hours that move each day and rest days, `dayBusy` scales door traffic per building, there is one tractor per farm and one forklift per yard, fewer of each than before, in more colours. Walkers step out of doors at staggered moments and each day's pace differs a little. Nothing is saved.
