// Hover tips for the tool bar and the HUD. Selector, then the text. Keys are named in the text when they exist.
// The top-row plaques have their own hover cards (css/hud.css, src/ui/hud-detail.js), so they are not listed here.
// Mouse only: touch has no hover, and the tool bar labels are already visible there.
export const HOVER_TIPS = [
  ['[data-tool="roads"]', 'Roads (R): draw streets and lanes. Hold Shift for a straight line.'],
  ['[data-tool="zones"]', 'Zones (Z): paint ground. Homes and shops grow there on their own.'],
  ['[data-tool="build"]', 'Buildings (B): place a house, shop or landmark on a plot.'],
  ['[data-tool="services"]', 'Services (C): clinics, schools and police make nearby streets happier.'],
  ['[data-tool="parks"]', 'Parks (P): green space that lifts the homes around it.'],
  ['[data-tool="traffic"]', 'Traffic (T): see how full each road is.'],
  ['[data-tool="bulldoze"]', 'Bulldoze (X): click a building to clear it.'],
  ['#pause', 'Pause the town. Nothing is lost.'],
  ['#speed', 'Game speed. Click to cycle.'],
  ['#night', 'Time of day. Click to lock night, then day, then back to the cycle.'],
  ['#goalsbtn', 'Town goals (G): daily goals, milestones and Renewal.'],
  ['#keysbtn', 'Keyboard shortcuts (?)'],
  ['#settingsbtn', 'Settings: save, export, import and start over.'],
];
