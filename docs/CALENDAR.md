# Calendar, holidays and skipping

Pure rules live in `src/core/calendar.js` (dates) and `src/core/holidays.js` (the holiday table). The sim side is
`src/sim/systems/calendar.js`; the plaque and skip panel are `src/ui/modules/date.js` with words in `src/ui/date-text.js`.

## The date

- `state.days` (saved) counts calendar days, with the fraction of the day. 0 is 08:00 on 1 March, Year 1, so a new town wakes in spring.
- A day starts at midnight. A month is 2, 3 or 4 days (Settings, default 3). A year is twelve real-named months and turns at January, so winter spans two years. A season is three months from March.
- A day is 1, 2 or 4 real minutes (default 2). At the defaults a year is 36 days, about 72 minutes.
- Changing the day or month length changes the pace and the grouping, not the days already counted.
- Derived on `state` (never saved): `dayIdx`, `year`, `month` (0 is January), `dayOfMonth`, `holiday` (id or `''`), `market` (0 or 1), plus `hour`, `season` and `weatherKind` as before.

## Holidays

A row in `HOLIDAYS` is `{ id, name, month, at: 'first' | 'mid' | 'last', text }`. The market is every third day (`MARKET`). First Snow is weather, not a date.
Events raised (sim events other systems and the UI can read): `newDay`, `newMonth`, `holiday` (`id`, `title`, `text`; a postcard note), `market` (a toast), `firstSnow`, `skipped`.
Time away and skips count festivals in closed form (`holidaysBetween`), not by walking days.

## Seasonal events

`src/core/events.js` holds the events the whole town dresses up for: the Fourth of July (July), Halloween (October) and
Christmas (December, with New Year's Eve). An event covers whole months of the game calendar and builds to its holiday:
on the first morning about a third of the town puts decorations up, more each day, and every street is dressed by the
holiday. Derived on `state` (never saved): `event` (id or `''`), `eventCover` (0 to 1), `eventPeak` (1 on the big day)
and `fireworks` (1 on the Fourth and on New Year's Eve). The sim raises `eventStart` (a postcard) the morning an event
begins. The calendar panel shows the season under way with a decorations bar, or the next one coming; the date plaque
wears the event's glyph. Render and sound read the state fields; nothing here touches the save.

## Skipping

`sim.skipToDay(dayIdx)` (command `skipToDay`) jumps to the dawn of a day up to two years ahead. It is one evaluation of every system's `offline` hook with the skipped time at 50% income (`SKIP_INCOME` in `sim/offline.js`), then sets the clock exactly on the target. Never a loop over ticks. Past days and over-far days are refused.
In the UI: click the date plaque, or press K.

Not browser-run. Unit tests: `tests/calendar-dates.test.js`, `tests/date-text.test.js`.

## Costumes

`src/render/festive/costumes.js`: during an event some townsfolk wear a costume (`WARDROBE`: about 40% at Halloween
and 48% at Christmas, 16% on the Fourth). Every costume shape is merged into one geometry tagged by `aPart`; each person
has an instanced `aKind` and the shader shows only the matching part. The layer shares the crowd's instance matrices, so
it costs one draw call per crowd (pavement walkers in `render/townsfolk.js`, and the life pools in `render/life/pools.js`),
and only while an event is on. Who wears what is a hash of the person, so a resident keeps the same costume.

## Music

`EVENT_COLOUR` in `src/audio/composer.js` dresses each tune written during an event (the sound module passes
`state.event` in the moment): Christmas is ionian on music box and harp with sleigh bells on every beat (a whisper of
them at night too); Halloween uses a harmonic-minor mode on harp and pad with wood-block knocks; the Fourth is a brisk
ionian march on flute and piano with a brushed snare. Each has its own tune names. Percussion voices `sleigh`, `block`
and `snare` live in `src/audio/engine.js`. A new event shortens the gap so its first tune comes soon.

## The town's festive style

`src/core/festive.js` (pure) and `src/sim/systems/festive.js` keep `state.festive` (saved; old saves get the default):
`amount` ('none', 'light', 'cozy' default, 'all'), `palette` per event (keys in `PALETTES`, 'classic' is the event's
own lights) and `dark` (placed record ids whose lights are off). Commands, all free: `setFestive { amount?, event?,
palette? }` and `festiveLights { id, on }`. A change replaces the object, so render notices by identity.
`dressShare` turns the month's cover and the amount into the share of buildings and trees dressed; `lightsFor` gives the
colours. The calendar panel (K) has a Decorations section; a placed building's card has an on/off switch while an event is on.
