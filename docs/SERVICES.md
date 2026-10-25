# Services, parks and happiness

Services (clinic, school, fire station, police), parks (green, plaza, playground, pond), landmarks (town hall, church) and shops (shop row, cafe, market) cover the homes around them. Those homes get happier, happy built tiles earn a little more, and every service and park costs a small upkeep. Industry (workshop, warehouse, and grown Industrial lots) eases the homes around it a little. Nothing here can fail, close or punish a player.

## Where things live

| Piece | File | Owns |
| --- | --- | --- |
| Numbers | `src/sim/services-config.js` | Radius, strength, upkeep and coins per model; shop and industry lots; happiness base, saturation, industry drag, floor, animation gain threshold and cap, income per tile and growth swing. Tune here. |
| Rules | `src/sim/services.js` | Pure: which records give coverage, reach per tile, the happiness map, the homes that gained (for the animation), the growth multiplier, tooltip text. |
| Sim system | `src/sim/systems/services.js` | Keeps the map current (placed list and zoning), adds the rate, exposes `sim.services`. No saved state of its own. |
| Overlay | `src/render/systems/services-overlay.js` | One plane, one draw call: soft blue tint on covered tiles, warm haze on industry, stronger tint on the lot under the cursor, and a ripple that spreads after a placement. |
| Hearts | `src/render/systems/happy-fx.js` | One Points object with a pool of 40 hearts and sparkles that rise from the homes a placement lifted. One draw call while anything is rising. |
| Advice | `src/sim/happiness-advice.js` | Pure: the panel's level, what helps, what pulls down, and up to three tips with a spot. Words and thresholds in `ADVICE` in the config. |
| Panel | `src/ui/modules/happiness.js`, `src/ui/happiness-view.js` | The plaque in the top bar (face, mood word, four pips). Click it to open the panel. Show moves the camera to a tip and sends a ripple. Closes on a click, Esc or right-click. Styled in `css/happiness.css`. |
| UI | `src/ui/modules/services.js` | Tooltips in the flyout, the coverage tint and haze while a tool is open, the celebration on placement, the Happiness card. |

## How the numbers work

- **Coverage.** A source reaches every tile within `radius` tiles of its footprint (Chebyshev distance). A tile gets `strength × (1 − d / (radius + 1))`, so the edge of the footprint gets the full strength and the reach fades out.
- **Shops and industry.** Placed shops (`SHOPS`) lift like services. Grown Commercial lots (`SHOP_LOT`) are small shops, and grown Industrial lots (`INDUSTRY_LOT`) are industry. A lot's strength scales a little with its level (0.8 at level 1, 1.2 at level 5). Placed industry is `INDUSTRY` (workshop, warehouse). Offices are workplaces and do not count as industry.
- **Happiness.** A tile starts at `MOOD.base` (0.25) and rises toward 1 as its uplift coverage grows. The curve saturates, so ten clinics do not make a perfect town. Industry then takes away at most `MOOD.industryMax` (0.15), again saturating, and no tile drops below `MOOD.floor` (0.1). Industry is never a failure state; it is a gentle dip.
- **Average.** The average happiness of built tiles (any tile in the grid's `lot` layer) is the town's happiness, shown on the card.
- **Income.** `MOOD.perTile × sum of happiness over built tiles`, plus each landmark's flat coins, minus each service's and park's upkeep. Recomputed whenever the placed list or the grid changes, never per tick.
- **Growth.** Zoning's growth chance is multiplied by `1 + (average − 0.5) × growthSwing`, clamped to 0.6 to 1.4. It is exactly 1 when nothing is built, so a new town grows at the old pace.
- **Animation.** When a service, park or shop is placed, the next rebuild remembers which homes (grown Residential lots and placed homes) gained at least `MOOD.gainMin`. The UI spreads a ripple from the building and staggers a heart over up to `MOOD.gainCap` of those homes, biggest gains first, with a sparkle now and then. Hearts and ripple are skipped when the system asks for reduced motion. Placing industry does not animate.
- **Save.** Nothing new is saved. The map is rebuilt from `state.placed`, so a reload gives the same numbers.

## The Happiness panel

The plaque in the top bar shows a face, the level word and four pips for its step on the ladder. Never a percentage:
happiness is about what each home can reach on foot. Clicking it opens the panel, which holds:

- the level in cozy words (Cozy, Settled, Finding its feet, Just getting started), never a failure word, and one sentence:
  how many homes are well served (two or more kinds in reach) and how many have nothing nearby;
- a strip of the homes: well served, one thing in reach, nothing yet (`advice.served`);
- one row per kind (services, green space, shops, landmarks) with "X of Y homes" in reach (`advice.reached`), plus a dashed
  row for workshops nearby (`advice.touched`) when there is industry;
- up to `ADVICE.tipsMax` tips. A tip needs at least `ADVICE.minHomes` homes in the same need, and points at their average spot. Show moves the camera there and sends a ripple;
- "How happiness works", folded: what lifts a home, that industry eases it but never below calm, and that roads do not change it.

`sim.services.advice()` builds it from the homes and the per-kind coverage maps. It is cached until the placed list or zoning changes, so the panel's refresh costs almost nothing.

## Rules for changes

- Keep the sim free of DOM and THREE. The animation list is derived from the grid and the placed list, never saved.
- Keep industry gentle. Its drag is capped by `MOOD.industryMax` and floored by `MOOD.floor`; a test checks the floor.
- Keep the animation cheap: a Points pool of 40, one draw call, and no allocation per frame beyond the pool arrays. The UI reads `sim.services` and `scene.sys('services-overlay')` and sends no commands of its own.
- Upkeep stays small. A test checks that thirty clinics still leave income positive. If you raise an upkeep, check that test still means something.
- Parks have no storeys, so the upgrade system refuses them. Their inspect card says "Finished".

## Not measured

Nothing here was run in a browser (nate asked for no headless browser runs). So the ripple, the hearts' shape, the haze colour and the card text are not seen on screen yet; nate confirms on localhost. Measured in Node on a desktop: rebuilding the happiness map with 400 placed sources and 2,000 zoned shop and industry lots takes about 1.1 ms (worst case; a real town has far fewer lots). The rebuild runs when the placed list or the zoning changes, not every tick, so a typical tick stays well under the 2 ms sim budget. The overlay and hearts add one draw call each (the hearts only while rising). Phone frame time is not measured.
