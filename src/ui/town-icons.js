// The town's badge: eight hand-drawn style icons in the ink outline, and the colour swatches they sit on.
// Icons are drawn in a 26 x 26 box and use the same ink stroke as the currency badges. Static markup only.
import { TOWN_COLORS } from '../sim/town.js';

const INK = '#2B2620', PAPER = '#FBF6EA', CLAY = '#97553E', SAGE = '#A8C179', SAGE_D = '#5F7A3E';
const SKY = '#8FB8D6';

// Each icon is the inner markup of an SVG with viewBox 0 0 26 26.
const ICONS = {
  house: `<path d="M3.5 12.5L13 4L22.5 12.5" fill="${CLAY}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><rect x="6" y="12.5" width="14" height="10" fill="${PAPER}" stroke="${INK}" stroke-width="2"/><rect x="11" y="16" width="4" height="6.5" fill="${SKY}" stroke="${INK}" stroke-width="1.5"/>`,
  tree: `<rect x="11" y="16" width="4" height="7" fill="#C98A6E" stroke="${INK}" stroke-width="1.6"/><circle cx="13" cy="11" r="7.5" fill="${SAGE}" stroke="${INK}" stroke-width="2"/><path d="M9 9.5Q10.5 7 13 7" fill="none" stroke="${SAGE_D}" stroke-width="1.6" stroke-linecap="round"/>`,
  windmill: `<path d="M9.5 24L11 12H15L16.5 24Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 12L13 5L16 12Z" fill="${CLAY}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><path d="M13 12L4 7M13 12L20 4M13 12L22 14M13 12L7 21" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/><circle cx="13" cy="12" r="1.5" fill="${INK}"/>`,
  church: `<rect x="6" y="12" width="14" height="12" fill="${PAPER}" stroke="${INK}" stroke-width="2"/><path d="M5 12L13 3L21 12Z" fill="${CLAY}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M13 1V5M11 3H15" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/><path d="M11 24V19A2 2 0 0 1 15 19V24" fill="${SKY}" stroke="${INK}" stroke-width="1.6"/>`,
  boat: `<path d="M13 3V19" stroke="${INK}" stroke-width="1.8"/><path d="M14.5 4.5Q21 9 20.5 17H14.5Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="M11.5 6Q6 10 6.5 17H11.5Z" fill="${CLAY}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="M3 19H23L20 23H6Z" fill="${SKY}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`,
  flower: `<path d="M13 15V24" stroke="${SAGE_D}" stroke-width="2" stroke-linecap="round"/><path d="M13 20Q9 18 8 15" fill="none" stroke="${SAGE_D}" stroke-width="1.8" stroke-linecap="round"/><g fill="${PAPER}" stroke="${INK}" stroke-width="1.6"><circle cx="13" cy="5.5" r="3.4"/><circle cx="19" cy="10" r="3.4"/><circle cx="16.5" cy="16.5" r="3.4"/><circle cx="9.5" cy="16.5" r="3.4"/><circle cx="7" cy="10" r="3.4"/></g><circle cx="13" cy="11" r="2.6" fill="#E6BC62" stroke="${INK}" stroke-width="1.5"/>`,
  lighthouse: `<path d="M9 24L10.5 9H15.5L17 24Z" fill="${PAPER}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M9.8 16H16.2" stroke="${CLAY}" stroke-width="3"/><rect x="9.5" y="5.5" width="7" height="4" fill="#E6BC62" stroke="${INK}" stroke-width="1.8"/><path d="M8 5.5L13 2.5L18 5.5Z" fill="${CLAY}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><path d="M5 6L2.5 4M21 6L23.5 4" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`,
  barn: `<path d="M4 24V13L8.5 7.5H17.5L22 13V24Z" fill="${CLAY}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M9.5 24V17.5H16.5V24M9.5 17.5L16.5 24M16.5 17.5L9.5 24" fill="none" stroke="${PAPER}" stroke-width="1.6"/><path d="M4 13L13 4.5L22 13" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`,
};

export const ICON_NAMES = Object.keys(ICONS);
export const ICON_LABEL = { house: 'House', tree: 'Tree', windmill: 'Windmill', church: 'Church', boat: 'Boat', flower: 'Flower', lighthouse: 'Lighthouse', barn: 'Barn' };
export const COLOR_LABEL = { mustard: 'Mustard', coral: 'Coral', mint: 'Mint', sage: 'Sage', sky: 'Sky', clay: 'Clay' };

// The icon as an SVG string. An unknown name draws the house, so a bad save never breaks the plaque.
export function townIconSvg(name, size = 26) {
  const body = ICONS[name] || ICONS.house;
  return `<svg width="${size}" height="${size}" viewBox="0 0 26 26" aria-hidden="true" focusable="false">${body}</svg>`;
}
export const townColor = (key) => TOWN_COLORS[key] || TOWN_COLORS.mustard;
