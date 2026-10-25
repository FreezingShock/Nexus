// The changelog: every release, newest first, shown under Changes on the title screen. One entry per release, and every
// pull request that changes something a player can see or hear adds a line to the newest entry (or opens a new entry
// with the version bump). tests/changelog.test.js checks that the newest entry is the version in src/version.js, so a
// release can never ship without its notes.
//
// An entry: { v, date ('YYYY-MM-DD'), name (a short cozy title), blurb (one sentence), items }.
// An item:  { k, t, pr? } where k is one of KINDS below, t is one plain sentence for players, pr the pull request number.

export const KINDS = {
  new: { label: 'New', color: '#A8C179' },
  better: { label: 'Better', color: '#8FB8D6' },
  look: { label: 'Look', color: '#E6BC62' },
  sound: { label: 'Sound', color: '#C9A6C9' },
  fix: { label: 'Fixed', color: '#E3A08E' },
};

export const CHANGELOG = [
  {
    v: '0.10.0', date: '2026-10-25', name: 'The welcome mat',
    blurb: 'The front door of Nexus got warmer, brighter and friendlier, with a proper welcome for brand-new mayors.',
    items: [
      { k: 'look', t: 'A brighter title card: coloured icon tiles, a snapshot of your town and a little tip that changes each visit.' },
      { k: 'new', t: 'How to play, Changes, Credits and Settings open as big notebook pages in the middle of the screen, flipping open from the spine.' },
      { k: 'sound', t: 'Each page turns with a soft paper rustle and its own little chime.' },
      { k: 'new', t: 'This changelog: every version since the first, with what was new, better, prettier, louder or fixed.' },
      { k: 'new', t: 'Brand-new players get a warm welcome and a Start my town button, with How to play glowing beside it.' },
      { k: 'better', t: 'Changes shows a "new since you last played" ribbon when the game has moved on.' },
    ],
  },
  {
    v: '0.9.0', date: '2026-10-24', name: 'The front door',
    blurb: 'Nexus got a title screen, a cozy loading screen and a home on the web.',
    items: [
      { k: 'new', t: 'A title screen on a paper card, with your own town turning slowly behind it.', pr: 93 },
      { k: 'new', t: 'A progress screen that names each real loading step, then opens onto your town.', pr: 93 },
      { k: 'look', t: 'The camera cuts between five slow shots of your town, hidden behind a paper curtain.', pr: 94 },
      { k: 'fix', t: 'The title panels open inside the card, and the HUD stays out of sight until you press Play.', pr: 94 },
      { k: 'new', t: 'Nexus is live at playnexus.dev.', pr: 95 },
      { k: 'fix', t: 'The site build only ships the files the game loads.', pr: 96 },
    ],
  },
  {
    v: '0.8.0', date: '2026-10-23', name: 'Calendars and cameras',
    blurb: 'Time got a calendar, the toolbar got new icons, and the town got a photo mode.',
    items: [
      { k: 'new', t: 'A calendar with years, months, holidays and skipping days, at half pay.', pr: 84 },
      { k: 'look', t: 'The date panel became a month grid with a today badge, holiday icons and a season ribbon.', pr: 85 },
      { k: 'look', t: 'A new bottom toolbar: fresh drawn icons, staggered tiles and a chevron to tuck it away.', pr: 86 },
      { k: 'better', t: 'Districts: see your selection live while dragging, with box, brush and eraser.', pr: 87 },
      { k: 'better', t: 'Townsfolk, tractors and forklifts keep different hours each day, with rest days.', pr: 88 },
      { k: 'new', t: 'Photo and cinematic mode on O: viewpoints, filters, frames and slow camera moves.', pr: 91 },
      { k: 'fix', t: 'Walls keep their colour at night.', pr: 89 },
      { k: 'fix', t: 'The date panel no longer crashes when it opens.', pr: 90 },
    ],
  },
  {
    v: '0.7.0', date: '2026-10-22', name: 'A town that lives',
    blurb: 'Decor, paint, and townsfolk going about their day in homes, shops, farms and parks.',
    items: [
      { k: 'new', t: 'A Decor tool with nine pieces, shown as real model thumbnails.', pr: 70 },
      { k: 'new', t: 'Paint building walls and roofs, or the whole town at once, with trim colours.', pr: 72 },
      { k: 'better', t: 'Streets can sit one lot apart.', pr: 71 },
      { k: 'better', t: 'Settings got tabs, season and weather tiles, and grouped saves.', pr: 74 },
      { k: 'look', t: 'Gentle feedback: pops, floating numbers, hearts and sparkles.', pr: 75 },
      { k: 'sound', t: 'A welcome chime when a family moves in.', pr: 75 },
      { k: 'new', t: 'Living homes: lit windows, chimney smoke, washing lines and cats on the roofs.', pr: 76 },
      { k: 'new', t: 'Living shops and workshops: awnings, café sitters, forklifts and vans.', pr: 79 },
      { k: 'new', t: 'Living farms: crops that grow with the seasons, a tractor, sheep and farm hands.', pr: 81 },
      { k: 'new', t: 'Living services and parks: a school bell, swings, strollers and a fire engine.', pr: 82 },
      { k: 'better', t: 'Zoned buildings only grow beside a street.', pr: 78 },
      { k: 'fix', t: 'Settings no longer overflow, and selected buttons are clear.', pr: 77 },
    ],
  },
  {
    v: '0.6.0', date: '2026-10-22', name: 'Hills and neighbours',
    blurb: 'New land every town, panels that glide, and people who actually live in the homes.',
    items: [
      { k: 'look', t: 'Every panel, card, tooltip and toast glides open and closed.', pr: 55 },
      { k: 'new', t: 'Seeded land: a flat centre, plateaus, rolling hills, lakes and a mountain rim.', pr: 56 },
      { k: 'look', t: 'A colourful top bar with plaques and a menu.', pr: 57 },
      { k: 'look', t: 'The offline postcard got a full makeover.', pr: 59 },
      { k: 'new', t: 'Homes hold people, with a population panel and a ten-minute graph.', pr: 61 },
      { k: 'new', t: 'Traffic and walkers come from your residents and their daily routines.', pr: 67 },
      { k: 'look', t: 'Patchy, natural seasons on the ground.', pr: 64 },
      { k: 'better', t: 'Prices about three times higher, with rewards raised to match.', pr: 68 },
      { k: 'fix', t: 'The end of the land never shows, and only one top-right menu opens at a time.', pr: 60 },
    ],
  },
  {
    v: '0.5.0', date: '2026-10-22', name: 'Facades and fields',
    blurb: 'Buildings got bays and trim, farms became something you place, and goals arrived.',
    items: [
      { k: 'look', t: 'Oriel bays on mansard, office and tower blocks.', pr: 44 },
      { k: 'look', t: 'Eaves and roof trim on every building.', pr: 46 },
      { k: 'better', t: 'Grown zoned buildings can be upgraded like placed ones.', pr: 47 },
      { k: 'new', t: 'Farmland reworked, and the town grid grew from 64 to 96 tiles.', pr: 48 },
      { k: 'new', t: 'Farms you place and drag to any size, facing the nearest road.', pr: 49 },
      { k: 'new', t: 'Milestones on M: tiered goals that add up as your town grows.', pr: 53 },
      { k: 'look', t: 'A roomier top bar with the full town name and a Happiness plaque.', pr: 51 },
      { k: 'fix', t: 'The zone grid lines up with the roads again.', pr: 50 },
    ],
  },
  {
    v: '0.4.0', date: '2026-10-22', name: 'Weather and wonder',
    blurb: 'Sound, seasons, a painted sky and a small starter village to begin from.',
    items: [
      { k: 'new', t: 'Graphics presets with live options.', pr: 25 },
      { k: 'better', t: 'Trees are real objects that make way for roads, zones and buildings.', pr: 26 },
      { k: 'look', t: 'Picture cards and warm thumbnails for every build menu.', pr: 28 },
      { k: 'better', t: 'Roads: click-to-click routes that pick their own bend and join at a T.', pr: 32 },
      { k: 'sound', t: 'Procedural sound: menu cues, building sounds, cozy music and ambience.', pr: 33 },
      { k: 'new', t: 'Time of day, four seasons and weather.', pr: 34 },
      { k: 'new', t: 'A small starter village on a T, with a tunnel into the mountain.', pr: 38 },
      { k: 'look', t: 'A painted sky with sun, moon, stars and clouds.', pr: 39 },
      { k: 'look', t: 'A new top row: town name, badge and hover cards.', pr: 40 },
    ],
  },
  {
    v: '0.3.0', date: '2026-10-21', name: 'A busy little town',
    blurb: 'Services, traffic, districts, Renewal, and a camera you can fly.',
    items: [
      { k: 'new', t: 'Saves with a backup slot, corrupt-save recovery and file import.', pr: 10 },
      { k: 'new', t: 'Services, parks and happiness on the grid.', pr: 11 },
      { k: 'new', t: 'Economy: tiers, the Charge meter, goals and Renewal.', pr: 12 },
      { k: 'new', t: 'Traffic: zone demand, congestion, cars, buses and townsfolk.', pr: 13 },
      { k: 'new', t: 'A free camera: WASD, smooth turning and tilting, and a free-fly mode.', pr: 14 },
      { k: 'better', t: 'Cars drive lane by lane, queue and park.', pr: 16 },
      { k: 'new', t: 'First-time tips, hover tips and a keyboard shortcut sheet.', pr: 19 },
      { k: 'new', t: 'Districts with names and flags, and dust puffs when buildings level up.', pr: 21 },
      { k: 'better', t: 'Drag to place rows, drag to bulldoze, and undo.', pr: 22 },
      { k: 'fix', t: 'No more black screen or inspect-card crash.', pr: 18 },
    ],
  },
  {
    v: '0.2.0', date: '2026-10-21', name: 'Roads and zones',
    blurb: 'The first real tools: draw roads, paint zones and watch buildings grow.',
    items: [
      { k: 'new', t: 'A shared tile grid for roads and zoning.', pr: 3 },
      { k: 'new', t: 'Draw roads with curves, intersections and tiers, with undo.', pr: 4 },
      { k: 'new', t: 'Paint zones and watch buildings grow.', pr: 5 },
      { k: 'look', t: 'Sixteen procedural buildings with five visible levels.', pr: 6 },
    ],
  },
  {
    v: '0.1.0', date: '2026-10-21', name: 'First light',
    blurb: 'A little low-poly town on a hill, ready to grow.',
    items: [
      { k: 'new', t: 'The first Nexus town: hills, a river, trees, farmland and moving cars.', pr: 1 },
      { k: 'new', t: 'Coins and Parts that arrive on their own, even while you are away.', pr: 1 },
    ],
  },
];

// Releases newer than the one a player last saw, newest first (empty when they are up to date or have never played).
export function newSince(seen, log = CHANGELOG) {
  if (!seen) return [];
  const out = [];
  for (const e of log) { if (cmpVersion(e.v, seen) <= 0) break; out.push(e); }
  return out;
}

export function cmpVersion(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}

// How many lines of each kind a release has, in KINDS order, leaving out kinds it has none of.
export function kindCounts(entry) {
  return Object.keys(KINDS).map((k) => ({ k, n: entry.items.filter((i) => i.k === k).length })).filter((c) => c.n > 0);
}
