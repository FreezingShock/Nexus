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

## Render

- `src/render/sky.js` eases the targets from `atmosphereTargets()` (hour, weather, season) so changes fade in.
- `src/render/night.js` sets the sun arc, dawn and dusk tints, cloud dimming and fog. The moon takes over after dark.
- `src/render/season.js` patches every toon material: green surfaces take the season's foliage colour, broadleaf
  canopies blossom in spring, top-facing surfaces take snow, and wet ground darkens. The water is `still`.
- `src/render/systems/weather.js` draws rain, snow and falling leaves as instanced particles, one draw call each. The
  Graphics "Dust and hearts" setting scales them, and Low shows none.
- The Settings card has a "Time and weather" section (`src/ui/atmos.js`). The HUD moon button cycles a time lock:
  cycle, then night, then day.

Not browser-run and not measured on a phone yet. Unit tests cover the rules, the sim and the shader anchors.
