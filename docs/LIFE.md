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

## Draw calls

`life-windows` 1, `life-smoke` 1, `life-homes` 3 (people, washing, cats). Windows and smoke are hidden while nothing is lit or rising. Not measured on a phone.

## Adding more life

Add a rule to `rules.js` (with a test), read sites from `parts.sites`, put the draw in a `life-*.js` system, and call `allocInstanceColors` on every instanced mesh before the first `setColorAt`. Hide unused instance slots with a zero scale at creation, and keep per-frame work to buildings near the camera (`camera.view`).
