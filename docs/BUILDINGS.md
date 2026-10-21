# Building design language

Every building is assembled from the same small kit (`src/render/models/kit.js`) so the town reads as one place. Models are listed in `src/world/models.js`; one builder per model lives in `src/render/models/builders.js`. Preview everything at `/kit.html`.

## Rules

- **Scale.** One tile is 3 units. A footprint is tiles x 3 minus 0.4, so streets and neighbours breathe. A storey is 1.1, a stone plinth 0.25. The front faces +z.
- **Rhythm.** One window bay per 1.5 units of wall, one row per storey. Windows come from a wall texture (sash, arched, shuttered, ribbon) repeated per bay, never from geometry.
- **Roofs.** Terracotta or the district roof color. Gable ends face the street on narrow houses; long eaves face it on wide ones. Mansard blocks, hips for cottages and police, flat with a parapet for shops and towers, sawtooth for workshops, spires for civic buildings.
- **Trim and color.** Plain parts use a short shared palette (`C` in the kit) plus the district palette (warm, pastel, slate, green). New colors are new ideas, so add them rarely. Awnings and doors carry the pastel accents.
- **Props.** Chimneys, dormers, window boxes, pots, hedges, lamps, bunting, flags. Small and chunky so they read from the default zoom. No lettering anywhere.
- **Determinism.** A building's look is a pure function of its record (model, tiles, turn, palette) and its id. `traitsOf(seed)` gives twelve fixed rolls; builders read them and never roll their own, so a reload, or a higher level, never re-rolls the house.

## Levels

Levels only add details, in this order (`decorate` in the kit): 2 window boxes and door pots; 3 chimney, cornice, round gable window; 4 dormers, front hedges, lamp, balconies on tall blocks; 5 gold cornice, bunting, weathervane or flag. Some models add their own (second smokestack, flag).

## Footprints

Each model lists the sizes it was drawn for. A turned building swaps its sides. `tile: 'row'` models (terrace, shop row) repeat as side-by-side units, so any 1 x n works. Any other lot shrinks to the largest drawn size that fits, centered (`fitFootprint`), or refuses when nothing fits (a town hall on a 1 x 1). `pickModelForLot(category, w, h, seed)` chooses a model for a lot, for zoning to use when it grows buildings.

## Grid contract

Placed buildings write their tiles into the grid's `lot` layer with numbers from 40000 up (`LOT_BASE`), so roads and zoning treat the tiles as built. Placed ids look like `b1001` so the save's level and removed fields accept them.

## Parks

Parks are ground, not buildings: `floors: [0, 0]`, so they never get storeys or levels and the upgrade is refused. A park is still a model (`cat: 'park'`) so it places, saves and bulldozes like any other. Its lawn or paving sits on the plinth; trees (a chunky trunk and a round crown), lamps, benches and water are the details. Keep parks to four or five trees so they stay inside the triangle budget. Services, parks and landmarks and what they do for the tiles around them are in [SERVICES.md](SERVICES.md).

## Budgets

Plain parts share one vertex-colored material (one draw call). Textured walls add one material per palette and window style used. Triangle caps are enforced in `tests/models.test.js` (650 per building, rows get more per extra unit).
