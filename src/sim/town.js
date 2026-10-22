// The town's name and badge: pure rules shared by the save, the sim commands and the HUD. No DOM, no state.
// The badge is one of TOWN_ICONS on a colour from TOWN_COLORS. Anything else in a save falls back to the default.

export const TOWN_NAME_MAX = 24; // characters (code points), so an emoji is never cut in half
export const DEFAULT_TOWN = { name: 'Nexus', icon: 'house', color: 'mustard' };
export const TOWN_ICONS = ['house', 'tree', 'windmill', 'church', 'boat', 'flower', 'lighthouse', 'barn'];
export const TOWN_COLORS = {
  mustard: '#E6BC62',
  coral: '#E3A08E',
  mint: '#BFD8C4',
  sage: '#A8C179',
  sky: '#8FB8D6',
  clay: '#C98A6E',
};

// Trims, turns control characters and runs of spaces into one space, and caps the length. Empty text is null.
export function cleanName(text) {
  if (typeof text !== 'string') return null;
  const t = text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return [...t].slice(0, TOWN_NAME_MAX).join('');
}

// Coerces a saved or sent town into the current shape. Unknown icons and colours fall back, never throw.
export function sanitizeTown(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    name: cleanName(o.name) ?? DEFAULT_TOWN.name,
    icon: TOWN_ICONS.includes(o.icon) ? o.icon : DEFAULT_TOWN.icon,
    color: Object.keys(TOWN_COLORS).includes(o.color) ? o.color : DEFAULT_TOWN.color,
  };
}
