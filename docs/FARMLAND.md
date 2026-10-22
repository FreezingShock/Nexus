# Farmland

The fields west of the starter village are scenery, built from the seeded layout (`src/world/layout.js`), not saved.

## Data

- `layout.farms`: 24 fields in 6 columns and 4 rows, each `{ x, z, w, d, crop, turned }`. `crop` indexes `CROPS` in `src/world/palettes.js` (wheat, barley, greens, tilled). A field's centre tile is `BASE.FARM` on the grid, so nothing is built or routed on it.
- The rows sit inside the flat strip that `farmMask` makes in `src/world/terrain.js` (|z| under 26). A field on a slope would float or sink, so keep new rows inside that strip, or widen the mask on purpose and accept that the old ground changes.

## Look

- Render: `buildFarms` in `src/render/terrain.js`. Each crop has one canvas texture with rows along the field's length: a base colour, a darker row and a light ridge. Every field is a plane with its crop's material.
- Hedges run round all four sides of every field: a body and a cap, one merged mesh each, with ink edges on the body.
- Seasons: the crop textures are painted at the summer field tint. `patchSeason(..., { field: true })` multiplies the texture by the sky's current field tint over that summer value (`SEASON.fieldRef` in `src/render/season.js`), so autumn and winter shift every crop together and summer shows the colours as painted.

## Budget

The farm is seven draw calls: four crop materials, the hedge body, the hedge cap and one ink line set. It was three before. Not measured on a phone.
