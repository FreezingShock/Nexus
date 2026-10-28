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
    v: '0.15.0', date: '2026-10-28', name: 'Easier to play',
    blurb: 'Settings gets two new pages so the game fits more people: camera controls and access options.',
    items: [
      { k: 'new', t: 'Settings has a Controls page: set how fast the camera pans, turns and zooms, flip the mouse wheel, hide the shortcut hint, or reset everything to the usual.' },
      { k: 'new', t: 'Settings has an Access page with three text sizes for the top bar, tool bar, cards and pages.' },
      { k: 'new', t: 'A Calm motion choice stills page flips, floating numbers, hearts and sparkles, whether or not your computer asks for it.' },
      { k: 'look', t: 'Red-green safe and blue-yellow safe colours for the traffic tint, in steps of lightness as well as colour, with the legend following along.' },
    ],
  },
  {
    v: '0.14.0', date: '2026-10-27', name: 'Kite weather',
    blurb: 'An optional spring season for a certain beagle: red doghouses, kites and a lazy piano.',
    items: [
      { k: 'new', t: 'Snoopy Days, a spring season that builds up to the Blossom Fair. It is on for every town, and you can switch it off in the calendar\'s Decorations section.' },
      { k: 'look', t: 'During Snoopy Days a red doghouse sits by many front doors with the beagle sitting up on the roof (now and then as the flying ace), and kites fly over the rooftops on thin strings.' },
      { k: 'look', t: 'Townsfolk come out as white beagles with long black ears, and a few as flying aces in a brown cap and red scarf.' },
      { k: 'look', t: 'The beagle has a new look: a big round head with a long muzzle, a little smile, a black collar and a gabled red doghouse to sit on, and the flying ace wears a leather cap with gold goggles.' },
      { k: 'new', t: 'A red doghouse and a kite post to place in your garden while the season is on.' },
      { k: 'sound', t: 'The music turns lazy and swinging, with a soft piano and its own tune names.' },
    ],
  },
  {
    v: '0.13.0', date: '2026-10-27', name: 'Soft rain on the roofs',
    blurb: 'The town sounds like a real place now: what you hear follows the camera, and every sound is softer and warmer.',
    items: [
      { k: 'better', t: 'Bigger parks cheer the homes around them more: a three-tile-square park lifts happiness nearly twice as much as a one-tile pocket park.' },
      { k: 'new', t: 'Parks and plazas, redrawn: greens, plazas, playgrounds and ponds come in more sizes (up to three tiles square) with paths, benches, fountains, ducks and a jetty, plus three new open spaces: the rose garden, the town square and the orchard.' },
      { k: 'new', t: 'The town journal: press J for a diary of what happened, from festivals and new seasons to the first home you built, plus little stories from named neighbours and a line about the time you were away.' },
      { k: 'new', t: 'A gentle start for new mayors: a skippable welcome postcard with three hints, then one toolbar tool glows softly to suggest where to start and moves on once you have tried it. "No hints, thanks" turns it off, and towns already being played never see it.' },
      { k: 'sound', t: 'Sounds come from where they are: hover over the river and you hear water, over the high street footsteps and wheels, over the fields a cow, hens and the odd sheep. In free-fly the streets sound right beside you.' },
      { k: 'sound', t: 'Zoom out and the town blends into a soft, muffled hum; zoom in and each place comes forward, clear and close.' },
      { k: 'sound', t: 'Gentle stereo: a sound to the left of the screen leans left, and turning the camera turns the sound with it.' },
      { k: 'sound', t: 'Rain is a soft, low patter instead of a hiss, with drips off roofs and gutters near the houses, and thunder rolls in slowly from far away.' },
      { k: 'sound', t: 'Warmer town sounds: the river babbles, crickets chirp instead of whining, cicadas shimmer and fade, and workshops knock away quietly by day.' },
      { k: 'sound', t: 'Buttons, hovers and building clicks are quieter and rounder, like paper and wood, and the rooster and dogs are further off.' },
      { k: 'sound', t: 'New sound settings start at full master volume, music and effects at half, and ambience at a quarter.' },
      { k: 'new', t: 'Five new buildings: a stepped-gable Townhouse, a turreted Manor house (2x2 or 2x3), Garden flats with balconies and roof planters (2x2 or 2x3), a Bakery with a smoking oven, and a Department store with a glass dome (2x2 or 2x3). Townhouses and bakeries also grow on zoned lots.' },
      { k: 'look', t: 'More variety: cottages, terraces, mansard blocks, towers, cafes, offices and shop rows now come in two or three roof looks each (hipped, gabled, mansard, flat with skylights, stepped or pointed crowns, a glass penthouse), picked by each building, so a street no longer repeats.' },
      { k: 'look', t: 'The Department store has a proper entrance bay with pilasters and a canopy clear of its awnings.' },
      { k: 'look', t: 'Notifications are slim coloured strips in the top-left corner that slide in, and rewards fly into your counters.' },
      { k: 'fix', t: 'The feedback box reads clearly in dark mode, and its open note stays anchored in the corner.' },
      { k: 'fix', t: 'Building details no longer flicker where two faces used to share a plane: cornices over doors, shop doors against their glass, bunting beside oriel windows, the church front and the clinic cross.' },
    ],
  },
  {
    v: '0.12.0', date: '2026-10-26', name: 'Deck the streets',
    blurb: 'The calendar comes alive: the town now dresses up for the Fourth of July, Halloween and Christmas.',
    items: [
      { k: 'new', t: 'Seasonal events: the Fourth of July, Halloween and Christmas each fill their month. Decorations go up a few houses at a time and the whole town is dressed by the big day.' },
      { k: 'new', t: "New Year's Eve closes the year, and the Harvest Feast moves to September to make room for Halloween." },
      { k: 'look', t: 'Doorstep decorations: pumpkins and the odd little ghost for Halloween, wreaths, snowmen and potted firs for Christmas, and flags and bunting for the Fourth of July.' },
      { k: 'new', t: "Fireworks on the Fourth of July and New Year's Eve: after dark rockets climb from the middle of town and burst into rings, gold willows and crackles, with a big finale at midnight." },
      { k: 'sound', t: 'Fireworks whistle up and boom softly from across town.' },
      { k: 'look', t: 'Townsfolk dress up: witch hats, bedsheet ghosts and pumpkin heads at Halloween, Santa and elf hats and reindeer antlers at Christmas, and tall striped hats on the Fourth of July.' },
      { k: 'sound', t: 'Festive tunes: music-box carols with sleigh bells at Christmas, a playful spooky waltz with wood-block knocks at Halloween, and a bright bandstand march with a brushed snare on the Fourth of July.' },
      { k: 'new', t: 'Make the festivities yours: in the calendar (K) pick how much the town dresses up (None, A little, Cozy or All out) and the colours of its lights for each season, like warm white, icicle or candy cane.' },
      { k: 'new', t: "A building's card can switch its festive lights and decorations off, and on again." },
      { k: 'new', t: 'Festive decorations to buy in season: a town Christmas tree and a gingerbread stall, a pumpkin patch and a scarecrow, a bandstand and a picnic table. Once placed they stay all year.' },
      { k: 'new', t: "Keepsakes: play during a real October, December or Fourth of July week and the town gets a keepsake to place any time: a Jack-o'-lantern post, a snow globe or a summer bell." },
      { k: 'look', t: 'The calendar (K) shows the festive season under way with how dressed the town is, or the next one coming, and the date plaque wears the event\'s badge.' },
      { k: 'look', t: 'Nexus has a new hand-drawn emblem: a little hilltop town by the river, on the title screen, the loading screen and the browser tab.' },
      { k: 'new', t: 'Ideas & feedback: a note in the title screen\'s corner where you can send ideas, bugs or a hello straight to the maker. Written offline? It waits and goes next time.' },
      { k: 'look', t: 'The welcome-back postcard is a real postcard now: a short landscape card with your town on the picture side, a little note, a stamp and your takings on the address lines.' },
      { k: 'better', t: 'Click the envelope to open it (the button that sent it sliding away is gone), and the envelope and card stay centred.' },
      { k: 'new', t: 'Collecting your takings bursts coins and parts out of the button and sends them flying into your counters, which climb as each one lands.' },
      { k: 'look', t: 'Notifications are slim paper strips now: they slide in at the top left under the town plaque, newest on top, with a coloured icon for each kind (a warning, an unlock, a milestone, a festival) and a thin line that shows how long they stay.' },
      { k: 'better', t: 'Notifications say what happened in plain words, show rewards as coin and Parts chips, pause while you hover them, and a repeated one counts up (×2) instead of piling on.' },
      { k: 'new', t: 'Milestone, goal and daily rewards burst out of their notification and fly into your Coins and Parts counters, just like the postcard.' },
      { k: 'fix', t: 'Ideas & feedback in dark mode: the chosen note type is easy to read again, and the open note now sits snugly in the bottom-right corner.' },
    ],
  },
  {
    v: '0.11.0', date: '2026-10-25', name: 'Tunes on the breeze',
    blurb: 'Little tunes now drift over the town, and the streets, gardens and river have more to say.',
    items: [
      { k: 'sound', t: 'New music: gentle tunes written on the spot for piano, harp, music box, flute and bass, with quiet stretches of town sound in between.' },
      { k: 'sound', t: 'Each tune fits its moment: bright mornings, busy days, golden dusks and hushed nights, coloured by the season, slowed by rain and quickened on festival days.' },
      { k: 'sound', t: 'The town has more voices: dogs in the gardens, a cuckoo in spring, frogs by the river on warm nights, far-off thunder in the rain and a crackling hearth on winter nights.' },
      { k: 'sound', t: 'A handbell rings in the square on market mornings, and a peal of bells greets festival noons.' },
      { k: 'sound', t: 'A little hamlet hums softly and a busy town hums fuller, and market days liven the streets.' },
      { k: 'new', t: 'Settings, Sound shows the name of the tune playing, with a Next tune button.' },
      { k: 'new', t: 'The Terrain tool (U): raise, lower and flatten the land with a soft brush. Roads, homes and trees ride along with the ground.', pr: 120 },
      { k: 'new', t: 'Build on hills: homes, shops, parks and zones now go on steep slopes, each on a level stone terrace with a retaining wall. Only cliffs and the mountains stay wild.', pr: 121 },
      { k: 'new', t: 'Smooth joins the Terrain tool: round off ridges, ramps and sharp terrace edges.', pr: 123 },
      { k: 'look', t: 'Contour lines trace the shape of the land while the Terrain tool is in hand.', pr: 123 },
      { k: 'better', t: 'Roads climb hills: only real cliffs say too steep. On a steep slope the road cuts into the hill or builds an embankment to keep a gentle climb, and the label shows the earthworks.', pr: 125 },
      { k: 'fix', t: 'Roads, zones and terraces on hills sit cleanly on the ground: no more grass poking through streets, floating lot outlines or walls that stop short of the slope.' },
      { k: 'better', t: 'The "Tip 1 of 5" notes in the corner are gone, so nothing sits over the population counter any more.' },
      { k: 'look', t: 'The Demand plaque is tidier: just the chart badge and the R, C and I columns, with the "wanted" arrows tucked inside it. Hover for the words.' },
    ],
  },
  {
    v: '0.10.0', date: '2026-10-25', name: 'The welcome mat',
    blurb: 'The front door of Nexus got warmer, brighter and friendlier, with a proper welcome for brand-new mayors.',
    items: [
      { k: 'new', t: 'Dark paper: Settings can switch the menus, pages and title screen to slate paper with mint buttons, or follow your computer. The town looks the same.', pr: 113 },
      { k: 'look', t: 'A brighter title card: coloured icon tiles, a snapshot of your town and a little tip that changes each visit.' },
      { k: 'new', t: 'How to play, Changes, Credits and Settings open as big notebook pages in the middle of the screen, flipping open from the spine.' },
      { k: 'sound', t: 'Each page turns with a soft paper rustle and its own little chime.' },
      { k: 'new', t: 'This changelog: every version since the first, with what was new, better, prettier, louder or fixed.' },
      { k: 'new', t: 'Brand-new players get a warm welcome and a Start my town button, with How to play glowing beside it.' },
      { k: 'better', t: 'Changes shows a "new since you last played" ribbon when the game has moved on.' },
      { k: 'new', t: 'A mayor profile: your name, a picture, a rank that climbs with your milestones, personal bests and a badge for every goal.' },
      { k: 'look', t: 'Two placeholder pass cards, the Lantern Pass and the Town Charter. Nothing is sold: the button only shows a friendly note.' },
      { k: 'better', t: 'Finishing a road no longer starts a new one from its end: the road tool lets go, so your next click picks a fresh start.', pr: 101 },
      { k: 'look', t: 'The in-town menu is redrawn like the title card: colourful icon rows with a live line under each and the key that opens it.', pr: 104 },
      { k: 'new', t: 'Goals and milestones, Settings, Shortcuts and Paint town open as big notebook pages that flip open, with a rustle and a chime.', pr: 104 },
      { k: 'better', t: 'Goals and milestones share one page: Today for Charge, daily goals and Renewal, Milestones for every goal. G and M open each tab.', pr: 104 },
      { k: 'look', t: 'Settings sections are coloured bookmark tabs on the edge of the page, and Photo mode wears the same paper.', pr: 104 },
      { k: 'new', t: 'Roads can be drawn in one go: press, drag and let go.', pr: 102 },
      { k: 'better', t: 'With no start picked, the ends of your streets glow softly as good places to carry on from.', pr: 102 },
      { k: 'better', t: 'Ctrl+Z while a road start is waiting just drops the start, instead of undoing your last road.', pr: 102 },
      { k: 'new', t: 'Replace in the road menu (J): click a street to change it to the chosen road type, paying only the difference.', pr: 103 },
      { k: 'better', t: 'The road cost label also shows the length in metres and how many junctions the new road makes.', pr: 103 },
      { k: 'look', t: 'Upgrading a building puts up wooden scaffolding with a little pennant and puffs of work dust, then it comes down as the new level pops in.' },
      { k: 'look', t: 'A bigger Population counter: a "+1" and a little person hop off it each time someone moves in.', pr: 105 },
      { k: 'look', t: 'The Population panel has a ruled graph with a key, and its facts sit in small coloured tiles.', pr: 105 },
      { k: 'better', t: 'The corner hint is now one line, "/ for shortcuts". Press / or click it to see every key.', pr: 105 },
      { k: 'fix', t: 'Tool menus no longer cover the little arrow that hides the toolbar.', pr: 105 },
      { k: 'look', t: 'A bigger Population counter: a "+1" and a little person hop off it each time someone moves in.' },
      { k: 'look', t: 'The Population panel has a ruled graph with a key, and its facts sit in small coloured tiles.' },
      { k: 'better', t: 'The corner hint is now one line, "/ for shortcuts". Press / or click it to see every key.' },
      { k: 'fix', t: 'Tool menus no longer cover the little arrow that hides the toolbar.' },
      { k: 'look', t: 'The town plaque shows your badge, name and a line about the town: how big it is, how many folk and the year.', pr: 107 },
      { k: 'new', t: 'Click the town plaque for the My town page: your town drawn from above, what is built, how it is doing, and the mayor.', pr: 107 },
      { k: 'better', t: 'Renaming the town and changing its badge now happen on the My town page, with a live preview of the plaque.', pr: 107 },
      { k: 'look', t: 'The Coins and Parts cards say what each is for and show where it comes from as little bars, with the next goal\'s progress.', pr: 107 },
      { k: 'better', t: 'The Renewal plaque left the top bar for now. Renewal itself still lives on the Goals page.', pr: 107 },
      { k: 'look', t: 'The town plaque shows your badge, name and a line about the town: how big it is, how many folk and the year.' },
      { k: 'new', t: 'Click the town plaque for the My town page: your town drawn from above, what is built, how it is doing, and the mayor.' },
      { k: 'better', t: 'Renaming the town and changing its badge now happen on the My town page, with a live preview of the plaque.' },
      { k: 'look', t: 'The Coins and Parts cards say what each is for and show where it comes from as little bars, with the next goal\'s progress.' },
      { k: 'better', t: 'The Renewal plaque left the top bar for now. Renewal itself still lives on the Goals page.' },
      { k: 'better', t: 'Happiness shows a mood word and a face instead of a percentage, with four little steps for how cozy the town is.', pr: 109 },
      { k: 'new', t: 'The Happiness panel says how many homes are well served and what homes can reach on foot: services, parks, shops and landmarks.', pr: 109 },
      { k: 'look', t: 'Demand is three little columns that fill up, with one line saying what the town wants most and a tidier card.', pr: 109 },
      { k: 'fix', t: 'Roads can pass the end of a side street or touch a street mid-way: that makes a junction now, not "Too close to another street".', pr: 108 },
      { k: 'better', t: 'Big towns no longer hitch when a building grows or levels up: the town redraws in a blink instead of up to a second.' },
      { k: 'fix', t: 'Drawing on hills lands where you point: roads, zones, buildings and decor no longer slip onto the tile behind a slope.' },
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
