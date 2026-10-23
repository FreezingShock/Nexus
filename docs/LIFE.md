# A town that looks lived in

Everything here is visual only: it reads the sim and never changes it. Nothing is saved; every habit comes from a building's seed, the clock and a few sim numbers, so the same house always keeps the same hours. Rules are pure and tested in `src/render/life/rules.js`; the systems that draw them are `src/render/systems/life-*.js`.

## Where life can happen

The building kit records sites as a builder places things (`k.sites` in `src/render/models/kit.js`, returned as `parts.sites`): `bodies` (the walled boxes, for windows), `chimneys`, `doors`, `awnings`, and a roof `perch` for a cat on low roofs. A chimney or door that moves in a builder moves its smoke and visitors with it. `town.lifeEntries()` and the lots system's `lifeEntries()` hand the systems the standing buildings, with a `lifeRev()` counter that moves when the set or a look changes.

Cottages and terraces now have their chimney from level 1 (a hearth); other homes still earn it at level 3.

## Homes (this PR)

| What | System | How |
| --- | --- | --- |
| Lit windows | `life-windows.js` | At night the walls have dark panes (`dimStyle`, `nightWall` in `models/materials.js`); one instanced quad per window glows over each lit window. Each window has its own luck (`windowRoll`) and its own moment at dusk (`dusk`, 0.30 to 0.75 of the night blend), so they come on one by one. A home goes dim room by room at bedtime (`lightShare`, shifted by up to 1.5 h per household). A home is lit only if lived in: homes fill in a fixed order as population fills capacity (`homeOccupied`). Shops, offices, workshops, schools and services keep their own hours. One draw call; on/off is a per-instance scale, so the glow costs no matrix rewrite after the build. |
| Chimney smoke | `life-smoke.js` | 200 puffs in one instanced mesh. A lived-in home's chimney puffs at a rate set by season and hour (`hearthRate`): thick on winter mornings and evenings, a trickle on a summer afternoon. Chimneys out of the camera's reach are skipped. |
| Residents at the door | `life-homes.js` | Someone leaves for the day, comes home, or steps out for a pause along the front of the house (`outingRate`, `outingKind`). Rate scales with population fill and the Crowd setting. One instanced mesh of 96. |
| Washing | `life-homes.js` | Some homes hang a line across their first-floor windows on dry daylight days (`washDay`); the cloth unfurls, sways more in wind, and is taken in. |
| Cats | `life-homes.js` | A fifth of low houses have a cat that sits on the roof edge on fair days (`catOut`), breathes, turns its head and now and then stretches. |

Graphics "Dust, hearts and town life": Off shows no smoke, residents, washing or cats (the lit windows stay, they are the night look); Light has smoke and half the residents; Full everything.

## Shops, offices and workplaces

`life-town.js` owns the shared pools (people, hanging cloth, other tinted meshes) and one director per kind of place in `src/render/life/directors/`: `homes.js`, `commercial.js`, `industry.js`. Routes for the little walks are pure (`life/routes.js`).

- **Shops and cafes:** awning valances flutter (hanging cloth in the awning's colour), a blade sign swings, customers go in and out of the door in shop hours, cafe-goers sit at the terrace tables for a while. Shop fronts glow through shop hours (window system).
- **Offices:** workers arrive in the morning, go out at lunch, leave in the evening.
- **Workshops and warehouses:** stacks smoke steadily through the working day (darker, bigger puffs), shift workers in yellow coats at the door, a forklift with a crate shuttles along the yard, a delivery van pulls up at the kerb, waits, and drives off.
- Scale: visits scale with population fill and the Crowd setting. Light has half the people and no forklifts, vans, cats or washing.

## Farms

`directors/farms.js`. Crop tufts stand in every bed and grow or ripen with the season (spring fresh and small, summer full, autumn gold, winter bare); the growth eases over several seconds, so a change of season is visible. A tractor works the lane behind the yard on dry days from spring to autumn, one to three sheep wander the gap between the house and the barn, and farm hands walk out to a field, stand a while and come back. The farmhouse chimney smokes like a home's. The farm builder records `sites.farm` (beds, lane, yard, house, barn). Three more meshes: crop tufts, tractors, sheep.

## Services and parks

`directors/civic.js`. Schools: children arrive in a burst at the morning bell, spill out at break, and leave in a burst mid-afternoon (smaller, faster walkers in bright coats). Clinics and police stations see a few visitors by day. Playgrounds: children get on the swings in dry daylight (more after school and in a fuller town); the swing and the child move together. Greens, plazas, ponds and playgrounds see strollers who cross, pause and walk on. Fire stations send an engine out of the bay, along the street and off, and back again some time later (rarer at night). The fire-station builder records its bay doors and the playground its swings.

## Draw calls

`life-windows` 1, `life-smoke` 1, `life-town` 14 (people, hanging cloth, cats, blade signs, forklifts, vans, crop tufts, tractors, sheep, swings, swing children, engines). Windows and smoke are hidden while nothing is lit or rising. Not measured on a phone.

## Adding more life

Add a rule to `rules.js` (with a test), read sites from `parts.sites`, put the draw in a `life-*.js` system, and call `allocInstanceColors` on every instanced mesh before the first `setColorAt`. Hide unused instance slots with a zero scale at creation, and keep per-frame work to buildings near the camera (`camera.view`).
