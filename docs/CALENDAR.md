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

## Skipping

`sim.skipToDay(dayIdx)` (command `skipToDay`) jumps to the dawn of a day up to two years ahead. It is one evaluation of every system's `offline` hook with the skipped time at 50% income (`SKIP_INCOME` in `sim/offline.js`), then sets the clock exactly on the target. Never a loop over ticks. Past days and over-far days are refused.
In the UI: click the date plaque, or press K.

Not browser-run. Unit tests: `tests/calendar-dates.test.js`, `tests/date-text.test.js`.
