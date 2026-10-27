# Building design language

Every building is assembled from the same small kit (`src/render/models/kit.js`) so the town reads as one place. Models are listed in `src/world/models.js`; one builder per model lives in `src/render/models/builders.js`. Preview everything at `/kit.html`.

## Rules

- **Scale.** One tile is 3 units. A footprint is tiles x 3 minus 0.4, so streets and neighbours breathe. A storey is 1.1, a stone plinth 0.25. The front faces +z.
- **Rhythm.** One window bay per 1.5 units of wall, one row per storey. Windows come from a wall texture (sash, arched, shuttered, ribbon) repeated per bay, never from geometry.
- **Roofs.** Terracotta or the district roof color. Gable ends face the street on narrow houses; long eaves face it on wide ones. Mansard blocks, hips for cottages and police, flat with a parapet for shops and towers, sawtooth for workshops, spires for civic buildings.
- **Trim and color.** Plain parts use a short shared palette (`C` in the kit) plus the district palette (warm, pastel, slate, green). New colors are new ideas, so add them rarely. Awnings and doors carry the pastel accents.
- **Oriels.** Mansard, office and tower blocks carry one glass bay on the front wall (`k.bay`): a plain box that juts out about 0.35, with glass on its face and a small roof cap. Plain parts only, so it adds no material.
- **Trim.** Every building picks one trim style from its traits (`k.trim`, run first in `decorate` at every level): corbels under the eave, two or three string courses, or a ridge cap or stone coping on the roof. The band colour and course count come from the traits too, so neighbours differ. Corbels skip an oriel's column.
- **Props.** Chimneys, dormers, window boxes, pots, hedges, lamps, bunting, flags. Small and chunky so they read from the default zoom. No lettering anywhere.
- **Determinism.** A building's look is a pure function of its record (model, tiles, turn, palette) and its id. `traitsOf(seed)` gives twelve fixed rolls; builders read them and never roll their own, so a reload, or a higher level, never re-rolls the house.

## Variety

Zoned lots are 1 x 1 and pick from `ZONE_MODELS` (`src/world/lots.js`) by seed, so every 1 x 1 model added there shows up in grown towns (Townhouse, Bakery). A model may list `styles` in `models.js`; the seed picks one of the existing four window textures, so a street of townhouses differs without a new material. The bigger 2 x 2 and 2 x 3 models (Manor house, Garden flats, Department store) are placed by hand. `node scripts/audit-models.mjs` checks every model for coplanar faces (z-fighting); `tests/model-zfight.test.js` keeps it at zero, so run it after touching any builder.

## Levels

A player upgrade first puts up scaffolding round the building (`src/render/systems/scaffold.js`, plan and timing in `src/render/scaffold-plan.js`, about 3 s in all, one instanced mesh for every scaffold on screen); the old look stays inside it until the reveal, when the scaffolding comes down. With Effects off, or more than six at once, the building pops straight away. Each upgrade pops the building and throws a small ring of dust (`src/render/systems/puffs.js`); a new zoned building throws a little dust as it goes up. A grown building (a zoned lot, id `lot<tile>`) is a building like a placed one: it selects and opens the same inspect card, upgrades for the same price curve with the same level-up pop and dust, and bulldozing it clears its zone tile (free, undoable). Its level lives in `state.lots`, so the save format is unchanged; it pays its zone's rate at its level, not the storey rate. One instanced mesh, so a burst is one draw call. Levels only add details, in this order (`decorate` in the kit): 2 window boxes and door pots; 3 chimney, cornice, round gable window; 4 dormers, front hedges, lamp, balconies on tall blocks; 5 gold cornice, bunting, weathervane or flag. Some models add their own (second smokestack, flag).

## Footprints

Each model lists the sizes it was drawn for. A turned building swaps its sides. `tile: 'row'` models (terrace, shop row) repeat as side-by-side units, so any 1 x n works. Any other lot shrinks to the largest drawn size that fits, centered (`fitFootprint`), or refuses when nothing fits (a town hall on a 1 x 1). `pickModelForLot(category, w, h, seed)` chooses a model for a lot, for zoning to use when it grows buildings.

## Grid contract

Placed buildings write their tiles into the grid's `lot` layer with numbers from 40000 up (`LOT_BASE`), so roads and zoning treat the tiles as built. Placed ids look like `b1001` so the save's level and removed fields accept them.

## Parks

Parks are ground, not buildings: `floors: [0, 0]`, so they never get storeys or levels and the upgrade is refused. A park is still a model (`cat: 'park'`) so it places, saves and bulldozes like any other. Its lawn or paving sits on the plinth; trees (a chunky trunk and a round crown), lamps, benches and water are the details. Keep parks to four or five trees so they stay inside the triangle budget. Services, parks and landmarks and what they do for the tiles around them are in [SERVICES.md](SERVICES.md).

## Budgets

Plain parts share one vertex-colored material (one draw call). Textured walls add one material per palette and window style used. Triangle caps are enforced in `tests/models.test.js` (650 per building, rows get more per extra unit).
