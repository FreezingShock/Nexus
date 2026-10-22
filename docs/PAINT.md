# Paint

Open a placed building's card and pick a wall or roof colour. Repainting costs coins by footprint (90 per tile for walls, 60 for a roof); picking the colour already worn is free. Six wall colours and three roof colours are open; the rest need a one-time Parts unlock (60 to 600), then every building can wear them.

- Data and rules: `src/world/paint.js`; colours in `src/world/palettes.js` (`PAL` extra keys, `ROOFS`). Sim: `src/sim/systems/paint.js` (`paintBuilding`, `unlockPaint`, undo). Card: `paintHtml` in `src/ui/panels.js`.
- Saved: `pal` and `roof` on the building's own record, plus `paintUnlocks` (defaults to empty, no version bump). The placement sanitize keeps a valid saved `pal`.
- Render: `src/render/town.js` redescribes the building when its paint signature changes and puffs a little dust.
- Grown (zoned) lots take their district's palette and cannot be repainted yet.
- Not browser-run: swatch look, the rebuild after a repaint and the night look need a check on localhost.
