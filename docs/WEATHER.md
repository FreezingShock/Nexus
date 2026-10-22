# Time, seasons and weather

The clock, seasons and weather are game seconds in the sim (`src/sim/systems/calendar.js`) and pure rules shared by the
sim and render in `src/core/calendar.js`. Nothing here touches the DOM or Three.js in the sim.

## What is saved and what is not

- Saved: `clockS` (game seconds since the town began), `weatherRoll` (the weather the sky is really having),
  `weatherUntil`, `weatherSeed` and `snowYear`.
- Derived, never saved, recomputed on load: `hour`, `season`, `weather`, `weatherKind`, `night`.
- Per browser, never saved in the town: the Settings choices (time lock, day length, season and its length, weather
  pick). They live under `nexus.calendar.v1` and reach the sim with `sim.setCalendar`. A choice changes what is shown,
  never the clock or the weather rolls.

## Names the rest of the game reads

- `state.hour`: 0 to 24. A new town starts at 8.
- `state.season`: `'spring' | 'summer' | 'autumn' | 'winter'`.
- `state.weather`: `'clear' | 'rain' | 'wind' | 'snow'` (the sound layer's names; cloudy and fog are clear, leaves are wind).
- `state.weatherKind`: the full kind, `clear | cloudy | rain | snow | fog | leaves`, for the visuals.
- `state.night`: 0 or 1. Follows the clock unless the time is locked.

## Rules

- A day is 5, 12 or 24 real minutes at speed 1. A season is 2, 4 or 8 in-game days, so a year is four seasons.
- Weather rolls when its time runs out, weighted by season (`WEIGHTS` in `core/calendar.js`). A roll lasts 1.5 to 4 minutes.
- The first snow of each winter raises a `firstSnow` event, which the postcard notes pick up. It is the only reward
  here; nothing in the economy depends on the weather.
- Time passed away is closed form (`offline` hook): the clock moves by the effective away seconds, and one roll is made.

## What each season changes

Targets live in `SEASON_LOOK` in `core/calendar.js`; render eases every value over a few seconds.

| | spring | summer | autumn | winter |
|---|---|---|---|---|
| Grass and land | fresh yellow-green | warm, saturated green | gold, with some red | dormant brown under snow |
| Broadleaf trees | blossom on the canopies | full green | gold and red by tree | khaki-brown, snow-dusted tops |
| Conifers | green | green | green | green, snow-dusted |
| Fields | fresh green | wheat gold | ploughed brown | frosted brown |
| River | blue-green | clear blue | grey-green | pale, icy |
| Sky haze | cream | pale blue | warm | cold blue-grey |
| Sun | soft, full strength | bright, full strength | warm, lower | cool, low (longer shadows) |
| Particles | falling petals | none | a few leaves drift | snow (in snow weather) |

Snow lies on roofs, lawns and roads in winter, and falls with the snow weather in any season. Trees do not change shape,
so bare winter trees are the dusted brown canopies, not leafless branches. Fog and rain still change the light on top
of the season.

Default: a season is two in-game days (24 minutes at the default day length), so a session shows the change.

## Render

- `src/render/sky.js` eases the targets from `atmosphereTargets()` (hour, weather, season) so changes fade in.
- `src/render/sky-look.js` turns the eased sky into the sky's colours: zenith, horizon (the fog colour from night.js),
  cloud lit and shaded sides, the ink edge, the sun or moon, and how many stars show. Dawn is peach and lilac, dusk is
  rose and violet, night is deep blue, overcast and rain grey the top and hide the stars, snow cools it, fog flattens it.
- `src/render/systems/sky.js` draws the sky as one dome that follows the camera, so it shows past the edge of the land
  and whenever the free camera looks up. Its shader holds the gradient, the sun or moon with a halo, procedural stars
  (twinkling), and clouds painted on the dome: fbm noise, cel-shaded away from the sun, with a thin ink edge. The clouds
  drift slowly and are not geometry. Graphics: Off draws no clouds, Light two octaves, Full four. The dome is one draw
  call and is drawn after the opaque town, so the depth test skips it where the town is in front.
- `src/render/night.js` sets the sun arc, dawn and dusk tints, cloud dimming and fog. The moon takes over after dark.
- `src/render/season.js` patches every toon material: green surfaces take the season's foliage colour, broadleaf
  canopies blossom in spring, top-facing surfaces take snow, and wet ground darkens. The water is `still`.
- `src/render/systems/weather.js` draws rain, snow and falling leaves as instanced particles, one draw call each. The
  Graphics "Dust and hearts" setting scales them, and Low shows none.
- The Settings card has a "Time and weather" section (`src/ui/atmos.js`). The HUD moon button cycles a time lock:
  cycle, then night, then day.

Not browser-run and not measured on a phone yet. Unit tests cover the rules, the sim and the shader anchors.
