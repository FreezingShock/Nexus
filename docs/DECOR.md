# Decorations

Looks-only pieces for open land: hedge, bench, flower bed, street lamp, topiary, market stall, fountain, statue, gazebo. The Decor tool (key **Y**) places them; the broom tile clears them.

- Data and rules: `src/world/decor.js` (kinds, prices, tile checks, save cleaning). Sim: `src/sim/systems/decor.js`. Render: `src/render/systems/decor.js`. UI: `src/ui/modules/decor.js`.
- Saved fields: `decor` (`{ id, k, gx, gz, rot }`, at most 400), `nextDecor`, `decorUnlocks`. Missing fields default to empty, so there is no save version bump.
- Prices: coins per piece, +1% of the base price for every piece already placed. The rarer kinds need a one-time Parts unlock (60 to 900), then Coins buy each copy. Clearing refunds half; undo works for both.
- A road, zone or building put on a decorated tile removes the piece and refunds its full base price (checked each tick).
- Render: all pieces merged into one mesh plus one ink-outline mesh (two draw calls), rebuilt only when the list changes. The preview under the cursor is a third mesh.
- Menu: pieces are grouped Greenery, Street, Plaza and Landmark; tiles show the real model through `decorThumb` in `src/render/thumbs.js` (hand-drawn icons only when there is no WebGL).
- Not browser-run: the look of each piece, the preview tint and the flyout need a check on localhost.
