# Title screen and load sequence

1. **Title** (index.html `#title`, src/ui/title.js, css/title.css). Shown on every launch. Behind it the town builds through the warm-up steps (`WARM_STEPS` in src/core/boot.js: fonts, modules, save, sim, scene, stores) and cuts between `TITLE_SHOTS` (slow photo-mode moves from the postcard, bird's eye, low, street and side viewpoints, with a paper curtain hiding each cut). Play waits, with a slim bar, until they finish.
2. **Progress** (`#boot`). Play opens it for `PLAY_STEPS`: catch-up for the time away, building the UI, lighting frames (shader compile), wiring. Each step is held at least `MIN_STEP_MS` so captions can be read; the bar eases toward the real fraction.
3. **Town.** The HUD fades in, then the Offline Return postcard opens if there was time away.

Nothing advances or saves before Play (`save()` checks `phase`), so time away counts from the last real save. Reloads the game triggers itself (Renewal, import, restore, new town) skip the title via `sessionStorage`; `?title=0` skips it too.
The version lives only in src/version.js (package.json must match: tests/title.test.js). Release notes live in src/changelog.js (see Changelog below).

Until Play the body has `booting`, which hides every HUD piece and map label, and no UI module exists yet, so the game's sound engine is not running; the title has its own tiny one (src/audio/page-sounds.js) for page turns. `index.html` loads `src/main.js?v=<version>`; bump it with the version so a browser can never pair a stale main.js with new markup. 
## The card and its pages

The left card holds Play, a snapshot of the town (residents, coins, date; `title.townInfo`, called from main.js after the warm-up), the menu `ROWS`, a tip of the day (`TIPS` in src/core/boot.js) and the version chip (which opens Changes). A brand-new player (no save) gets "Hello, new mayor", a Start my town button and a glowing How to play row.

Each row opens its page in `#tt-sheet`, a big notebook sheet centred over the town with a scrim behind. It flips open from its left spine (`data-mo="flip"` in css/motion.css; `#title` sets the perspective), with a paper rustle and the page's own chime (`PAGE_CHIMES`). A page is a `PAGES` header (title, line, accent colour) plus a builder in `pages` in src/ui/title.js. Esc, Back or the scrim closes it.

## Changelog

src/changelog.js holds every release, newest first: `{ v, date, name, blurb, items: [{ k, t, pr }] }`, with kinds new, better, look, sound and fix. **Every PR that changes something a player sees or hears adds a line** to the newest entry, or opens a new entry when it bumps the version. tests/changelog.test.js fails if the newest entry is not src/version.js's version. The Changes row shows a New badge when the game has moved past the version the player last saw (`nexus.seenVersion`).

## Mayor profile

The Mayor profile page shows the player's name (typed straight into the header), a picture (initials by default, or one of eight drawn emblems, in one of eight colours), a rank, personal bests and a badge per milestone goal. The record lives in its own key, `nexus.profile.v1` (src/core/profile.js), not in the save, so it outlasts Start over and Renewal like the sound settings do; it is not part of a town export. Rank climbs the `RANKS` ladder with milestone stages, using the best ever reached. main.js counts time played in 15 second steps while the tab shows, and notes the population record and stages; Start over counts one more town. Badges read the loaded town's `standing` for each goal and are coloured by stage (Bronze to Crown).

## Passes (placeholder)

The Passes row opens two cards, the Lantern Pass (evening ink and gold) and the Town Charter (olive and gold), with mock perks. They are placeholders only: no price, no payment, no account and no network. The button shows a small paper note and the pass chime. `PASSES` in src/ui/title.js; a test checks they hold no prices or links.
