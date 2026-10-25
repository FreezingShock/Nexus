# Notebook pages

The title screen's pages and the town's pages are one surface: a big sheet in the middle of the screen that flips open from
its spine over a soft dim, with a stamped icon, a title, a line under it, Back (Esc) and, when the page has sections,
coloured bookmark tabs down its right edge. A paper rustle and a chime of its own play as it opens.

- **Sheet**: `src/ui/notebook.js` (markup, open and close, tabs, delegated clicks) and `css/notebook.css`. Motion is
  `data-mo="flip"` in `css/motion.css`. Sounds are `src/audio/page-sounds.js` (`PAGE_CHIMES` has one chime per page).
- **Title**: `src/ui/title.js` inserts the sheet with the prefix `tt` and fills it with How to play, Changes, Credits,
  Mayor profile, Passes, Settings and New town (`css/title.css`).
- **Town**: `src/ui/book.js` builds the sheet (prefix `pg`) on a stage over the town and keeps a page registry. Pages:
  - `goals` (`modules/progress.js`): tabs Today (Charge, today's goals, almost there, Renewal) and Milestones
    (`milestone-list.js`). G opens Today, M opens Milestones.
  - `settings` (`panels.js`): tabs Sky, Graphics, Sound, Town. Restore, Start over and Import ask on the page.
  - `shortcuts` (`modules/shortcut-sheet.js`, key ?) and `paint` (`modules/paint-town.js`).
  - Styles: `css/pages.css` (stage, boxes, columns, bands) plus each page's own file.
- **Menu**: `modules/menu.js` dresses the top-bar buttons as rows like the title card (icon tile, name, live line, key).
  Time of day stays a one-click toggle; Photo mode is a live camera mode, so its panel only borrows the paper look.

Rules: the town keeps running behind a page and nothing in the sim changes because one is open. While a page is open, Esc
or a right-click closes it, page keys switch pages and tool keys wait. One page at a time; opening one closes whatever else
is open in the top-right corner (`src/ui/slot.js`).

To add a page: `book.register(id, { title, sub, c, icon, tabs?, render(ctx), opened?, closed?, click? })`, a chime in
`PAGE_CHIMES`, an icon in `src/ui/page-icons.js`, and a row in `MENU_ROWS` if the menu should open it.
