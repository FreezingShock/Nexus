# Terrain

The land comes from a **seed** saved with the town (`state.terrainSeed`). `setTerrainSeed` (src/world/terrain.js) picks it for
every height query after it, so sim, grid and render always agree. `createSim` sets it first, from the state it is given.

## When a seed is rolled

- A new village (first visit, Start over): `freshState()` rolls one (`newSeed`).
- Renewal: `freshState()` inside the renew command rolls another. The grid reads the land again (`grid.regen()`), the
  scenery is regenerated, the starter village comes back, and the page reloads on the saved town after the Renewal message
  (the ground mesh is built once per page).
- A save with no `terrainSeed` is a town from before seeds. Its seed is **0**, the original hand-tuned land, so nothing it
  built moves. No save version bump was needed: `sanitize` reads a missing seed as 0. Start over or Renewal gives it new land.
- Settings shows the seed.

## Shape of seeded land

From the middle out (`ground` in terrain.js):

1. A flat, buildable centre, 40 to 48 units out (the village and the road east to the tunnel).
2. Meadows, then **plateaus** (flat terraces with a ramp or cliff between, `terrace`), **rolling hills** and flat valleys,
   mixed by a slow noise so each seed has its own balance; a few inner mountain ridges; one or two **lakes** in the west half.
3. The edge: from about 114 units out the ground always climbs into mountains about 45 high, and keeps going past the map edge (higher, with peaks and passes) as far as anyone can look. The river and the valley road fade out in the foothills, so nothing cuts a notch through the wall.

Hills roll everywhere (no dead-flat valleys outside the centre) and terraces carry a gentle swell, so plateau tops are never dull.

Fixed on every seed: the river (`riverX`), the calm meadow banks, the straight valley road along z = 0 east of the village,
the bridge, the tunnel mountain (x > 71) and everything east of the river (it uses its own fixed seed). The seed rolls
everything on the village side.

## What is buildable

Decided by slope, never by height (grid.js `regen`): a tile is steep when its corners and middle differ by more than 0.9, or
it is above `MOUNTAIN_TOP` (26). So a plateau top at height 6 is as buildable as the meadow. Water is below -0.15 or within
5 units of the river line. Roads use the same slope idea (roadnet.js `tooSteep`: at most 0.5 across a tile), farms their
flat rule, zones and districts the `LAND` base. Seed 0 keeps its old height cut-offs.

## Tests

`npm test` pins the original land (`tests/support/pin-land.js`) so older tests keep their ground. `tests/terrain-seed.test.js`
sweeps 48 seeds: flat centre, mountain edge, starter village, gate, bridge, river, scenery, save handling and Renewal.

Not browser-run: how it looks (colour of cliffs and snow, lakes, mountain walls) is for nate to check on localhost, on a
new village (Settings, Start over).

## Far ground

`render/terrain.js` builds the fine map (2.5 units a vertex) and a coarse ring round it out to 480 units (10 units a vertex), the same `heightAt`. Both have a wall under their seams so no crack shows sky. About 63k triangles in all; one more draw call.

## Never seeing the edge

The orbit camera's near plane used to sit at +1, 150 units from the target, so zoomed out or tilted low, ground behind the camera was clipped along a slanted line and the water plane and background showed through (a floating slab). The near plane is now -400. The water plane covers the whole far ground. The lowest tilt (`ISO.elevMin`) is 0.38, so the top of the view stays on land, and `tests/camera.test.js` checks that the four corner rays land within 460 units at the widest window, furthest zoom-out and furthest pan. Beyond about 340 units of depth the fog fades the land into haze, so the mountains seem to go on for ever.

## Terrain tools (the player's edits)

The Terrain tool (U) raises, lowers and flattens the land with a soft brush (S, M, L). The edits are height offsets at the
tile corners (`src/world/land.js`, the 97 x 97 lattice the tile overlays use), blended across each tile and added to the
seeded land in `heightAt` (`baseHeightAt` is the land as made). So the grid, roads, buildings, trees, decor and overlays all
read the edited ground with no change on their side.

- Saved in `state.land` as `[corner, hundredths]` pairs. A save without it has no edits, so old towns load as they were;
  no save version bump. Renewal starts the new land with none.
- Sim: `src/sim/systems/land.js`, command `terraform { tool, x, z, size, level, stroke }`. Each dab costs
  `BALANCE.land.perEarth` coins per unit of ground moved. All dabs of one drag share one undo step, with the coins back.
- Reach: corners within the grid (two tiles in from its edge), more than 7.5 units from the river line, west of the tunnel
  mountain (x < 66), and whose land as made is below `LAND_TOP` (MOUNTAIN_TOP - 4). So the mountain rim stays fixed, but
  steep hillsides below it can be reshaped. Raised ground stops at `LAND_TOP`; dug ground at -2, a pond (the water plane
  shows through below -0.55). Ground under a road, zone or building is never dug below the water line.
- Built things ride the ground: buildings, grown lots, roads, trees, decor and the tile overlays redraw when it moves.
  Render code follows through `createLandWatch()` (`src/render/land-watch.js`), which reports the tiles and the box that
  moved since it last looked. The fine ground mesh lifts only the vertices in that box (`reshape` in render/terrain.js).
- Zones on ground that turned steep stay (zoning only drops zones on water or under roads at load), and so do decorations.

Not browser-run: how the brush feels, how fast a big drag redraws on a slow machine, and the look of dug ponds are for nate
to check on localhost.
