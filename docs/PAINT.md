# Paint

Two ways to paint, both with Coins, both undoable.

**One building:** open a placed building's card and pick a wall scheme, a trim colour or a roof colour. **The whole town:** the Paint tile in the menu (top right) opens a card with a live preview (a cottage and a mansard block), three swatch rows and one button that paints every building and every grown lot at once, priced per building (90 coins a tile for walls, 40 trim, 60 roof; grown lots count as one tile). Ctrl+Z takes a whole-town paint back; "Grown lots back to district colours" is free.

- Colours: `src/world/palettes.js`. Wall schemes (`PAL`) are a wall colour with its own trim; the ones marked `two` have a contrasting trim on purpose (two-tone). `TRIMS` replace the scheme's trim; `ROOFS` replace its roof.
- Rules and prices: `src/world/paint.js`. The first colours are free; the rest need a one-time Parts unlock (60 to 600), then every building can wear them.
- Sim: `src/sim/systems/paint.js` (`paintBuilding`, `paintTown`, `clearTownPaint`, `unlockPaint`). Saved: `pal`, `trim`, `roof` on each placed record, plus `townPaint` (what grown lots wear) and `paintUnlocks`. All default to empty, so there is no save version bump.
- Render: `town.js` redescribes a repainted building; `render/systems/lots.js` keys its cache on the town paint and redraws every grown lot quietly (no pop). UI: `paintHtml` in `src/ui/panels.js` and `src/ui/modules/paint-town.js`.
- Audit (`tests/paint.test.js`): every model with walls is built twice, changing only walls, only trim, only roof, at levels 1 and 5, and must draw something different. It found the fire station roof, the church tower walls and spire, and the farmhouse and barn walls ignoring the paint; those now follow it. Parks have no walls and are skipped.
- Not browser-run: swatches, the preview thumbnails, the redraw of lots after a town paint and the night look need a check on localhost.
