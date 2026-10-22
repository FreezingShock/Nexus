# Saves, backups and offline catch-up

The town is one plain object, `state`. Every system owns a few keys of it and serializes them through hooks. Nothing else needs editing to add saved state.

## Adding saved state (your system)

Create `src/sim/systems/<name>.js` (see [EXTENDING.md](EXTENDING.md)) and fill in:

- `state()` returns the default fields, for example `{ districts: [] }`. Keys must be unique across systems (a test fails on a clash).
- `sanitize(raw, fresh)` returns only your keys, clamped and validated from the untrusted saved object. `fresh` is a fresh state for defaults. Strip anything you do not recognise.
- `beforeSave(ctx)` (optional) rebuilds any saved field that is derived from the grid, so the save is never stale. Zoning uses it. Keep it cheap: it runs on every autosave and export.
- Derived values (rates, totals) are never saved. Rebuild them from saved fields in `init` or `refresh`.

A system with `state()` but no `sanitize` still loads: a saved value is kept only when its JSON type matches the default. Write a `sanitize` anyway for anything that matters.

Then run `npm run registry`. Saves carry the new fields with no change to `save.js`.

## Changing saved fields that already shipped

Add a migration to `migrations` in `src/sim/save.js`, bump `SAVE_VERSION`, and add a test for the old shape. Current version: 3. `migrations[i]` turns a version `i+1` state into a version `i+2` state. They run in order, one per version, and each sees the output of the one before. Never edit a migration that has shipped. A failing migration never throws to the player: the save is refused with a reason, and the backup is still there.

### Reset steps (version 3)

Version 3 replaces the town with the starter town (`src/world/starter.js`) and keeps only the settings that are still saved (`speed`; night follows the clock, so it is not saved). That step is marked `resets = true`. `unwrap` hands back the town it replaced as `retired`, and `loadGame` writes that town to the backup slot as a version 3 envelope. The town before a reset has the current shape, because a reset is the only change, so Settings can restore it. Restoring that backup gives the old town back and does not run the reset again. A version 2 import file goes through the same reset and becomes the starter town.

## Envelope and storage

```
{ "v": 1, "savedAt": 1761058800000, "state": { ... } }
```

| Key | What it holds |
| --- | --- |
| `nexus.save` | The current town. Written every 45 seconds, on tab hide and on page hide. |
| `nexus.save.backup` | One earlier town. Refreshed at most every 10 minutes while playing, and before any import, restore or start over. |
| `nexus.save.unreadable.<time>` | Text of a save that could not be read. Kept so nothing is lost silently. |

Every storage call is wrapped in try/catch. A private window or blocked storage starts a fresh town with a notice, and autosave reports that it cannot write.

## Loading

`loadGame()` in `save.js` returns `{ state, savedAt, source, notice }`:

1. The current save loads if it reads. `source` is `save`.
2. If it does not read, its text is kept under `nexus.save.unreadable.<time>`, then the backup loads. `source` is `backup`, with a notice.
3. If neither reads, a fresh town starts with a notice that says where the unreadable text is kept. `source` is `new`.
4. A save from before a reset step (version 2 today) is replaced by the starter town. The old town goes to the backup slot, the new town is written at once, and it starts its clock at load: it earns nothing for the time the old town was away. `source` is `save`, with a notice.

`unwrap(raw)` validates the envelope, runs migrations, and sanitizes. It never throws.

## Offline catch-up

On load, `sim.catchUp(savedAt)` applies the closed form in `src/sim/offline.js`. It never loops over ticks.

- `away = clamp(now - savedAt, 0, 24 h)`. A negative delta (clock moved back, or a save from the future) counts as 0. A save with no usable time (`savedAt` null) earns nothing.
- Full rate for 4 hours, then a straight line down to 10% over the next 4 hours, then 10% flat until the 24-hour cap. Lantern levels would extend the full-rate window (not built yet).
- Under 5 minutes away applies silently. Longer absences leave an unclaimed postcard with real numbers: coins, parts, time away, full-rate time and easing time.
- A second absence before collecting adds to the same postcard.

The closed form is tested against a numeric integral of the rate curve (`tests/offline.test.js`).

## Export and import

- Export downloads `nexus-save-<date>.json`, the same envelope.
- Import reads the file, checks its size (5 MB max), its envelope, and that it holds a Nexus town. Only then does it ask. Replacing a town keeps the current one in the backup slot, and the imported town is stamped with the time of import, so an old export earns no offline credit.
- Restore swaps the backup in and stamps it with now. The town you had becomes the backup, so restore can be undone.
- Start over moves the town to the backup slot before clearing, so it can still be restored from Settings.

## Tests

`tests/save.test.js`, `tests/persist.test.js` (slots, corrupt data, migrations, import, restore, whole-town round trip), `tests/offline.test.js` and `tests/catchup.test.js` (the closed form and clock changes).
