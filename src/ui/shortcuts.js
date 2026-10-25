// Keyboard bindings shown on the shortcut sheet. Tool keys are the real bindings (ui.js reads TOOL_KEYS).
// Other rows name the file that handles the key, and tests/polish.test.js checks that the key is still there,
// so the sheet cannot drift from the game.
export const TOOL_KEYS = { r: 'roads', z: 'zones', b: 'build', c: 'services', p: 'parks', t: 'traffic', x: 'bulldoze', n: 'districts', y: 'decor' };

export const TOOL_INFO = {
  roads: ['Roads', 'draw streets and lanes'],
  zones: ['Zones', 'paint ground for homes and shops'],
  build: ['Buildings', 'place a house, shop or landmark'],
  services: ['Services', 'clinics, schools and police'],
  parks: ['Parks', 'green space for the streets around'],
  traffic: ['Traffic', 'see how full each road is'],
  bulldoze: ['Bulldoze', 'click a building to clear it'],
  districts: ['Districts', 'name a neighbourhood and paint it'],
  decor: ['Decor', 'benches, lamps, fountains and flowers'],
};

const toolRows = Object.entries(TOOL_KEYS).map(([k, tool]) => ({
  keys: [k.toUpperCase()], text: `${TOOL_INFO[tool][0]}: ${TOOL_INFO[tool][1]}`,
}));

// file + needle: a literal the handling file must still contain. Rows without them are mouse or touch only.
export const SHORTCUT_GROUPS = [
  { title: 'Tools', rows: toolRows },
  { title: 'While drawing roads', rows: [
    { keys: ['1–5'], text: 'Pick a road type', file: 'src/ui/modules/road-tool.js', needle: '/^[1-5]$/' },
    { keys: ['Click'], text: 'Set the start, then click again to lay the road to the cursor' },
    { keys: ['Drag'], text: 'Press, drag and let go to lay a road in one go' },
    { keys: ['J'], text: 'Replace: click a street to change it to the chosen type', file: 'src/ui/modules/road-tool.js', needle: "REPLACE_KEY = 'j'" },
    { keys: ['Space'], text: 'Add a pivot: bend the road at the cursor, then keep going', file: 'src/ui/modules/road-tool.js', needle: "const PIVOT_KEY = ' '" },
    { keys: ['L'], text: 'Flip the bend: the road picks the cleanest L by itself, L overrides it', file: 'src/ui/modules/road-tool.js', needle: "FLIP_KEY = 'l'" },
    { keys: ['Shift'], text: 'Hold for a straight line', file: 'src/ui/modules/road-tool.js', needle: "e.key === 'Shift'" },
    { keys: ['Esc', 'Right click'], text: 'Step back one pivot, then let go of the start', file: 'src/ui/modules/road-tool.js', needle: "e.key === 'Escape'" },
    { keys: ['Ctrl', 'Z'], text: 'Undo the last step: road, building, zone, district, tree or bulldoze (a waiting road start goes first)', file: 'src/ui/modules/road-tool.js', needle: "send({ type: 'undo' })" },
  ] },
  { title: 'Zones and buildings', rows: [
    { keys: ['0–4'], text: '0 erases, 1 to 4 pick a zone', file: 'src/ui/modules/zoning.js', needle: '/^[0-4]$/' },
    { keys: ['V'], text: 'Turn the building before you place it', file: 'src/ui/modules/placement.js', needle: "=== 'v'" },
  ] },
  { title: 'Looking around', rows: [
    { keys: ['W', 'A', 'S', 'D'], text: 'Walk around the town', file: 'src/render/camera-math.js', needle: "has('w')" },
    { keys: ['Q', 'E'], text: 'Rotate the view, or go down and up in free fly', file: 'src/render/camera-math.js', needle: "has('q')" },
    { keys: ['Arrows'], text: 'Turn and tilt, or look around in free fly', file: 'src/render/camera-math.js', needle: "has('arrowleft')" },
    { keys: ['Shift'], text: 'Move faster', file: 'src/render/camera-math.js', needle: "has('shift')" },
    { keys: ['F'], text: 'Free fly: walk at ground level', file: 'src/ui/modules/camera-modes.js', needle: "k === 'f'" },
    { keys: ['H'], text: 'Home: the classic town view', file: 'src/ui/modules/camera-modes.js', needle: "k === 'h'" },
    { keys: ['O'], text: 'Photo mode: filters, viewpoints, a slow cinematic camera and saving a picture', file: 'src/ui/modules/photo.js', needle: "k === 'o'" },
    { keys: ['Drag'], text: 'Pan the town' },
    { keys: ['Scroll'], text: 'Zoom in and out' },
  ] },
  { title: 'Town', rows: [
    { keys: ['G'], text: 'Goals: Charge, today\'s goals and Renewal', file: 'src/ui/modules/progress.js', needle: "e.key === 'g'" },
    { keys: ['K'], text: 'Calendar: the date, festivals and skipping days', file: 'src/ui/modules/date.js', needle: "toLowerCase() !== 'k'" },
    { keys: ['M'], text: 'Milestones: every goal, its stages and rewards', file: 'src/ui/modules/progress.js', needle: "e.key === 'm'" },
    { keys: ['Esc'], text: 'Close a page, leave a tool, or close a card', file: 'src/ui/ui.js', needle: "e.key === 'Escape'" },
    { keys: ['Right click'], text: 'Leave a tool, or close a card' },
    { keys: ['/'], text: 'Show or hide this page (? works too)', file: 'src/ui/modules/shortcut-sheet.js', needle: "e.key === '/'" },
  ] },
];
