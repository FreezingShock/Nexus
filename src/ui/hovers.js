// Hover tips for the tool bar and the HUD. Selector, then the text. Keys are named in the text when they exist.
// The top-row plaques have their own hover cards (css/hud.css, src/ui/hud-detail.js), so they are not listed here.
// Mouse only: touch has no hover, and the tool bar labels are already visible there.
export const HOVER_TIPS = [
  ['[data-tool="roads"]', 'Roads (R): draw streets and lanes. Hold Shift for a straight line.'],
  ['[data-tool="zones"]', 'Zones (Z): paint ground. Homes and shops grow there on their own.'],
  ['[data-tool="build"]', 'Buildings (B): place a house, shop or landmark on a plot.'],
  ['[data-tool="services"]', 'Services (C): clinics, schools and police make nearby streets happier.'],
  ['[data-tool="parks"]', 'Parks (P): green space that lifts the homes around it.'],
  ['#vw-chip', 'Traffic view (T): tint the roads by how full they are. Click again to switch it off.'],
  ['[data-tool="bulldoze"]', 'Bulldoze (X): click a building to clear it. Hold Shift and drag to clear a whole box.'],
  ['#pause', 'Pause the town. Nothing is lost.'],
  ['#speed', 'Game speed. Click to cycle.'],
  // The menu's rows carry their own line of text, so they need no hover tip.
];
