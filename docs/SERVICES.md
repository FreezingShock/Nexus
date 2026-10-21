# Services, parks and happiness

Services (clinic, school, fire station, police), parks (green, plaza, playground, pond) and landmarks (town hall, church) cover the tiles around them. Those tiles get happier, happy built tiles earn a little more, and every service and park costs a small upkeep. Nothing here can fail, close or punish a player.

## Where things live

| Piece | File | Owns |
| --- | --- | --- |
| Numbers | `src/sim/services-config.js` | Radius, strength, upkeep and landmark coins per model. Happiness base, saturation, income per tile and growth swing. Tune here. |
| Rules | `src/sim/services.js` | Pure: which records give coverage, reach per tile, the happiness map, the growth multiplier, tooltip text. |
| Sim system | `src/sim/systems/services.js` | Keeps the map current, adds the rate, exposes `sim.services`. No saved state of its own. |
| Overlay | `src/render/systems/services-overlay.js` | One plane, one draw call: soft tint on covered tiles, stronger tint on the lot under the cursor. |
| UI | `src/ui/modules/services.js` | Tooltips in the flyout, the coverage tint while a tool is open, the Happiness card. |

## How the numbers work

- **Coverage.** A source reaches every tile within `radius` tiles of its footprint (Chebyshev distance). A tile gets `strength × (1 − d / (radius + 1))`, so the edge of the footprint gets the full strength and the reach fades out.
- **Happiness.** A tile starts at `MOOD.base` (0.25) and rises toward 1 as its raw coverage grows. The curve saturates, so ten clinics do not make a perfect town.
- **Average.** The average happiness of built tiles (any tile in the grid's `lot` layer) is the town's happiness, shown on the card.
- **Income.** `MOOD.perTile × sum of happiness over built tiles`, plus each landmark's flat coins, minus each service's and park's upkeep. Recomputed whenever the placed list or the grid changes, never per tick.
- **Growth.** Zoning's growth chance is multiplied by `1 + (average − 0.5) × growthSwing`, clamped to 0.6 to 1.4. It is exactly 1 when nothing is built, so a new town grows at the old pace.
- **Save.** Nothing new is saved. The map is rebuilt from `state.placed`, so a reload gives the same numbers.

## Rules for changes

- Keep the sim free of DOM and THREE. The UI reads `sim.services` and `scene.sys('services-overlay')` and sends no commands of its own.
- Upkeep stays small. A test checks that thirty clinics still leave income positive. If you raise an upkeep, check that test still means something.
- Parks have no storeys, so the upgrade system refuses them. Their inspect card says "Finished".

## Not measured

Nothing here was run in a browser (nate asked for no headless browser runs). Measured in Node on a desktop: rebuilding the happiness map for 400 placed sources takes about 0.7 ms, well under the 2 ms sim budget, and it runs only when the placed list changes. The overlay adds one draw call. Phone frame time and the card's look on narrow screens are not measured.
