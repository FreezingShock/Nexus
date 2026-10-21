# Districts

A district is a named neighbourhood painted on the grid. It has a name, a flag and a wash of colour on its tiles. It is free: painting, erasing and naming cost nothing, and districts never change what a building earns.

## Rules

- **Slots.** Up to 15 districts, each in slot 1 to 15. A new district takes the first free slot.
- **Names.** Generated from two original word lists (`nameFor` in `src/world/districts.js`), or typed. Typed names keep letters, spaces, apostrophes and hyphens, are trimmed and capped at 24 characters. An empty name gets a generated one. Names are not required to be unique, but a new generated name avoids the names in use.
- **Flags.** Each district has a colour pair and one of four styles (side by side, stacked, centre band, emblem). The flag stands on the tile nearest the district's middle, above the roofs.
- **Paint.** Drag a rectangle with a district selected. Water is never painted. Erase clears tiles in a rectangle. Removing a district clears its tiles.
- **Saved.** `districts` (name, slot, colour, style), `dmap` (one hex digit per tile), `dseed` (the generated-name counter). A tile that names a missing district is cleared on load.

## Where it lives

- Rules and naming: `src/world/districts.js` (pure, tested in `tests/districts.test.js`).
- Commands and saved state: `src/sim/systems/districts.js`. Commands: `newDistrict`, `paintDistrict`, `eraseDistrict`, `renameDistrict`, `shuffleDistrictName`, `deleteDistrict`.
- Map drawing: `src/render/systems/districts.js`. One wash plane (a 64 x 64 data texture, like the services overlay), a border where two districts meet, and three instanced meshes for the flags. The flags sway slowly.
- Labels and the tool: `src/ui/modules/districts.js` (DOM labels placed from the render system's projection, the flyout, and drag painting). Key `N`.

## Draw calls

Districts add four draw calls (wash, poles, two cloth meshes). Nothing is built per tile.
