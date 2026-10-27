# Town journal

Press **J** (or Town journal in the menu) for a notebook page with two tabs: **Diary** (everything, newest first, grouped by month) and **Townsfolk** (only the neighbours' stories).

- **Words**: `src/core/journal.js` (pure). `entryFor(spec, when)` turns a moment into an entry; a hash of the entry's key picks the template and the neighbour, so the same moment always reads the same and a story never changes after it is written.
- **When**: `src/sim/systems/journal.js`. It listens to events the sim already raises (`holiday`, `eventStart`, `firstSnow`, `keepsake`, `milestone`, `renewed`, `newMonth` on a season's first month, `newDay` for an ordinary-day story, one day in three) and looks at the town every 5 ticks (the first home you built, population steps in `POP_STEPS`, the welcome-back summary as one `away` entry). Never a loop over days.
- **Saved**: `state.journal = { entries, seen }`. `entries` is capped at 150 (oldest drop off), `seen` holds the keys already written (capped at 400) so nothing is written twice. A save with no journal loads as an empty one, so no migration was needed. The first look at a town without one writes a first page and marks what is already true as seen, so existing towns do not get a flood of old news. A Renewal keeps the journal.
- **Page**: `src/ui/modules/journal.js`, markup in `src/ui/journal-view.js`, styles in `css/journal.css`. A new entry puts a dot on the menu tile until the page is opened. The welcome-back postcard may open with a neighbour's recent words (`addNoteWriter`).
- **Adding a moment**: emit an event from your system, add a `case` in the listener in `systems/journal.js` and a `kind` in `entryFor`. Give it a stable key.
