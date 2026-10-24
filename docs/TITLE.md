# Title screen and load sequence

1. **Title** (index.html `#title`, src/ui/title.js, css/title.css). Shown on every launch. Behind it the town builds through the warm-up steps (`WARM_STEPS` in src/core/boot.js: fonts, modules, save, sim, scene, stores) and turns slowly (`cinePose('orbit')` at half speed). Play waits, with a slim bar, until they finish.
2. **Progress** (`#boot`). Play opens it for `PLAY_STEPS`: catch-up for the time away, building the UI, lighting frames (shader compile), wiring. Each step is held at least `MIN_STEP_MS` so captions can be read; the bar eases toward the real fraction.
3. **Town.** The HUD fades in, then the Offline Return postcard opens if there was time away.

Nothing advances or saves before Play (`save()` checks `phase`), so time away counts from the last real save. Reloads the game triggers itself (Renewal, import, restore, new town) skip the title via `sessionStorage`; `?title=0` skips it too.
The version lives only in src/version.js (package.json must match: tests/title.test.js). Add each release's notes to `CHANGES` there.
