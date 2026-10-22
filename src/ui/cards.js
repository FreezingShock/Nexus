// The look shared by every build menu: compact tiles with a picture, a name, a price chip and a key badge, plus the
// zone vignettes, road swatches and category icons. Pure string builders: no DOM, no THREE, so the markup and the
// numbers can be tested in node. Colours and sizes live in css/menus.css.
import { minFloors } from '../world/models.js';
import { income } from '../sim/economy.js';
import { INDUSTRY, LANDMARKS, PARKS, SERVICES, SHOPS } from '../sim/services-config.js';
import { ZONE_DEFS } from '../sim/zones.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const mkey = (k) => `<kbd class="mkey">${esc(k)}</kbd>`;

// The price in coins, as the sim charges it right now.
export const coins = (n) => `${Math.floor(n).toLocaleString('en-US')} coins`;

// One compact tile: picture on top, name, a price (or an unlock note when locked) and a key badge. `tip` is the
// hover text. `data` becomes data-* attributes (data: { pm: 'cottage' } gives data-pm). `short` marks a price the
// player cannot pay yet.
export function tileCard({ pic = '', title, price = '', unlock = '', tip = '', key = '', pressed = false, locked = false, short = false, data = {}, cls = '' }) {
  const attrs = Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  const state = [locked ? 'locked' : '', short ? 'short' : '', cls].filter(Boolean).join(' ');
  const chip = unlock ? `<span class="price unlock">${esc(unlock)}</span>` : price ? `<span class="price">${esc(price)}</span>` : '';
  return `<button type="button" class="tile${state ? ' ' + state : ''}" aria-pressed="${pressed}"${tip ? ` title="${esc(tip)}"` : ''}${attrs}>` +
    `<span class="pic">${pic}</span>` +
    `<span class="name">${esc(title)}</span>` +
    `<span class="row">${chip}${key ? mkey(key) : ''}</span></button>`;
}

// The line under the strip for the selected model: what it is and what it does.
export function detailText(def) {
  const fx = effectOf(def);
  return fx ? `${def.sub} · ${fx}` : def.sub;
}

// ---- category icons (small, one colour, ink outline) ----
const ICON_SHAPES = {
  home: '<path d="M4 12L11 5l7 7v7H4z" fill="#FBF6EA" stroke="#2B2620" stroke-width="1.8" stroke-linejoin="round"/><rect x="9" y="14" width="4" height="5" fill="#2B2620" opacity=".7"/>',
  shop: '<rect x="4" y="9" width="14" height="10" fill="#FBF6EA" stroke="#2B2620" stroke-width="1.8"/><path d="M3 9h16l-1.5-4h-13z" fill="#B8472E" stroke="#2B2620" stroke-width="1.8" stroke-linejoin="round"/>',
  work: '<path d="M3 18V9l4-3 4 3 4-3 4 3v9z" fill="#FBF6EA" stroke="#2B2620" stroke-width="1.8" stroke-linejoin="round"/><rect x="14" y="3" width="3" height="6" fill="#2B2620" opacity=".7"/>',
  landmark: '<rect x="7" y="4" width="8" height="14" fill="#FBF6EA" stroke="#2B2620" stroke-width="1.8"/><path d="M6 4h10l-5-3z" fill="#E6BC62" stroke="#2B2620" stroke-width="1.5" stroke-linejoin="round"/>',
  service: '<rect x="3" y="3" width="16" height="16" rx="5" fill="#FBF6EA" stroke="#2B2620" stroke-width="1.8"/><path d="M11 7v8M7 11h8" stroke="#B8472E" stroke-width="2.6" stroke-linecap="round"/>',
  farm: '<rect x="3" y="12" width="16" height="7" fill="#E2C27A" stroke="#2B2620" stroke-width="1.8"/><path d="M7 12v7M11 12v7M15 12v7" stroke="#B0AA66" stroke-width="1.4"/><path d="M4 12V8l3-3 3 3v4z" fill="#B8472E" stroke="#2B2620" stroke-width="1.6" stroke-linejoin="round"/>',
  park: '<circle cx="11" cy="8" r="5" fill="#A8C179" stroke="#2B2620" stroke-width="1.8"/><path d="M11 13v6" stroke="#2B2620" stroke-width="2"/>',
};
export const categoryIcon = (id) => `<svg viewBox="0 0 22 22" aria-hidden="true">${ICON_SHAPES[id] || ICON_SHAPES.home}</svg>`;

// ---- road swatches: a cross-section of each road type, flat with ink outlines ----
const SW = '<svg viewBox="0 0 120 56" preserveAspectRatio="xMidYMid slice" aria-hidden="true">';
const ASPHALT = '#8E8576', INK = '#2B2620', CREAM = '#FAF3E4', VERGE = '#A8C179';
const ROAD_SWATCH = {
  two: SW + `<rect width="120" height="56" fill="${VERGE}"/><rect x="0" y="14" width="120" height="28" fill="${ASPHALT}" stroke="${INK}" stroke-width="2"/>` +
    `<line x1="0" y1="28" x2="120" y2="28" stroke="${CREAM}" stroke-width="2.5" stroke-dasharray="9 6"/><circle cx="14" cy="6" r="3" fill="${INK}" opacity=".5"/></svg>`,
  bike: SW + `<rect width="120" height="56" fill="${VERGE}"/><rect x="0" y="12" width="120" height="32" fill="${ASPHALT}" stroke="${INK}" stroke-width="2"/>` +
    `<rect x="0" y="12" width="120" height="8" fill="#B9D08C" stroke="${INK}" stroke-width="1.5"/><rect x="0" y="36" width="120" height="8" fill="#B9D08C" stroke="${INK}" stroke-width="1.5"/>` +
    `<line x1="0" y1="28" x2="120" y2="28" stroke="${CREAM}" stroke-width="2.5" stroke-dasharray="9 6"/>` +
    `<circle cx="34" cy="16" r="3.5" fill="none" stroke="${INK}" stroke-width="1.5"/><circle cx="60" cy="40" r="3.5" fill="none" stroke="${INK}" stroke-width="1.5"/></svg>`,
  one: SW + `<rect width="120" height="56" fill="${VERGE}"/><rect x="0" y="12" width="120" height="32" fill="${ASPHALT}" stroke="${INK}" stroke-width="2"/>` +
    `<line x1="0" y1="22" x2="120" y2="22" stroke="${CREAM}" stroke-width="2" stroke-dasharray="9 6"/><line x1="0" y1="34" x2="120" y2="34" stroke="${CREAM}" stroke-width="2" stroke-dasharray="9 6"/>` +
    `<path d="M20 28H52M44 22L52 28L44 34M68 28H100M92 22L100 28L92 34" stroke="${CREAM}" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`,
  bus: SW + `<rect width="120" height="56" fill="${VERGE}"/><rect x="0" y="12" width="120" height="32" fill="${ASPHALT}" stroke="${INK}" stroke-width="2"/>` +
    `<rect x="0" y="12" width="120" height="11" fill="#E6BC62" stroke="${INK}" stroke-width="1.5"/>` +
    `<rect x="24" y="14" width="30" height="7" rx="2" fill="${CREAM}" stroke="${INK}" stroke-width="1.2"/><rect x="66" y="14" width="22" height="7" rx="2" fill="${CREAM}" stroke="${INK}" stroke-width="1.2"/>` +
    `<line x1="0" y1="34" x2="120" y2="34" stroke="${CREAM}" stroke-width="2" stroke-dasharray="9 6"/></svg>`,
  free: SW + `<rect width="120" height="56" fill="${VERGE}"/><rect x="0" y="8" width="120" height="40" fill="#6F685A" stroke="${INK}" stroke-width="2"/>` +
    `<rect x="0" y="25" width="120" height="6" fill="#D9CDB4" stroke="${INK}" stroke-width="1.5"/>` +
    `<rect x="22" y="13" width="18" height="8" rx="3" fill="#8FB8D6" stroke="${INK}" stroke-width="1.2"/><rect x="62" y="37" width="18" height="8" rx="3" fill="#E3A08E" stroke="${INK}" stroke-width="1.2"/>` +
    `<rect x="90" y="13" width="18" height="8" rx="3" fill="#E6BC62" stroke="${INK}" stroke-width="1.2"/></svg>`,
};
export const roadSwatch = (id) => ROAD_SWATCH[id] || '';

// ---- zone vignettes: a painted scene with tiny buildings, 96 by 64. Sky wash in the zone colour, sage ground. ----
const HOUSE = (x, w, h, roof) => `<path d="M${x} ${52 - h}L${x + w / 2} ${40 - h}L${x + w} ${52 - h}z" fill="${roof}" stroke="#2B2620" stroke-width="1.5" stroke-linejoin="round"/>` +
  `<rect x="${x + 2}" y="${52 - h}" width="${w - 4}" height="${h}" fill="#FBF6EA" stroke="#2B2620" stroke-width="1.5"/>` +
  `<rect x="${x + w / 2 - 2}" y="${52 - 7}" width="4" height="7" fill="#2B2620" opacity=".7"/>`;
const SHOP = (x, w) => `<rect x="${x}" y="30" width="${w}" height="22" fill="#FBF6EA" stroke="#2B2620" stroke-width="1.5"/>` +
  `<path d="M${x - 2} 30H${x + w + 2}V35H${x - 2}z" fill="#B8472E" stroke="#2B2620" stroke-width="1.2" stroke-linejoin="round"/>` +
  `<path d="M${x + 4} 35v3M${x + w / 2} 35v3M${x + w - 4} 35v3" stroke="#FBF6EA" stroke-width="2"/>` +
  `<rect x="${x + w / 2 - 4}" y="40" width="8" height="12" fill="#7F98A6" stroke="#2B2620" stroke-width="1.2"/>`;
const ZONE_SCENE = {
  1: () => HOUSE(8, 26, 18, '#B8472E') + HOUSE(38, 22, 26, '#97553E') + HOUSE(64, 24, 14, '#B8472E'),
  2: () => SHOP(6, 26) + SHOP(36, 24) + SHOP(64, 26),
  3: () => `<path d="M10 52V34l8-7 8 7 8-7 8 7 8-7 8 7v18z" fill="#FBF6EA" stroke="#2B2620" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<rect x="64" y="20" width="5" height="14" fill="#2B2620" opacity=".7"/><rect x="72" y="42" width="12" height="10" fill="#E6BC62" stroke="#2B2620" stroke-width="1.2"/>`,
  4: () => `<path d="M18 34L40 20L62 34z" fill="#FBF6EA" stroke="#2B2620" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<rect x="16" y="34" width="48" height="3" fill="#FBF6EA" stroke="#2B2620" stroke-width="1.2"/>` +
    [22, 32, 42, 52].map((x) => `<rect x="${x}" y="37" width="4" height="12" fill="#FBF6EA" stroke="#2B2620" stroke-width="1"/>`).join('') +
    `<rect x="14" y="49" width="52" height="3" fill="#FBF6EA" stroke="#2B2620" stroke-width="1.2"/><path d="M76 52V18" stroke="#2B2620" stroke-width="1.5"/><path d="M76 18h9l-2 3 2 3h-9" fill="#B8472E" stroke="#2B2620" stroke-width="1"/>`,
};
export function zoneVignette(id) {
  const zone = id ? ZONE_DEFS[id] : null;
  const sky = zone ? zone.paint : '#FBF6EA';
  const hatch = '<defs><pattern id="zh" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#FBF6EA"/><rect width="3" height="8" fill="#E9D6B2"/></pattern></defs>';
  const back = zone ? `<rect width="96" height="64" fill="${sky}" opacity=".5"/>` : `${hatch}<rect width="96" height="64" fill="url(#zh)"/>`;
  const scene = zone ? ZONE_SCENE[id]() : '<path d="M36 40l16-22 13 15-9 9h-8z" fill="#FBF6EA" stroke="#2B2620" stroke-width="2.5" stroke-linejoin="round"/>';
  return `<svg viewBox="0 0 96 64" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${back}` +
    `<rect y="50" width="96" height="14" fill="#A8C179"/><line x1="0" y1="50" x2="96" y2="50" stroke="#2B2620" stroke-width="1.5" opacity=".4"/>${scene}</svg>`;
}

// A zone tile: vignette, name, price per tile, key badge. Demand lives in the top widget, not here.
export function zoneCard({ id, name, price, key = '', pressed = false, tip = '' }) {
  return tileCard({ pic: zoneVignette(id), title: name, price, key, pressed, tip, cls: id ? 'zone' : 'zone eraser', data: { zone: id } });
}

// ---- effect lines: one short line of what a model does ----
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// What a plain building earns at level 1, between its smallest and tallest storey counts.
export function buildingEffect(def) {
  const [lo, hi] = def.floors;
  if (!hi) return '';
  if (def.cat === 'farm') { // fields fill the lot, so earnings follow the size; they need flat ground
    const a = income(minFloors(def, 6), 1), b = income(minFloors(def, 16), 1);
    return `Fields fill the lot · flat ground · earns ${a} to ${b} coins/s`;
  }
  const floors = lo === hi ? plural(lo, 'floor') : `${lo} to ${hi} floors`;
  const earn = income(lo, 1) === income(hi, 1) ? `${income(lo, 1)}` : `${income(lo, 1)} to ${income(hi, 1)}`;
  return `${floors} · earns ${earn} coins/s`;
}

// The happiness and coin lines for a service, park, landmark, shop or industry; empty for a plain building.
export function coverageEffect(id) {
  const cfg = SERVICES[id] || PARKS[id] || LANDMARKS[id] || SHOPS[id] || INDUSTRY[id];
  if (!cfg) return '';
  if (INDUSTRY[id]) return `Eases happiness within ${plural(cfg.radius, 'tile')}`;
  let line = `Cheers up homes within ${plural(cfg.radius, 'tile')}`;
  if (LANDMARKS[id]) line += ` · +${cfg.coins} coins/s`;
  else if (cfg.upkeep !== undefined) line += ` · upkeep ${cfg.upkeep.toFixed(2)}/s`;
  return line;
}

// The effect a menu shows for a model: coverage if it has one, otherwise what it earns.
export function effectOf(def) {
  return coverageEffect(def.id) || buildingEffect(def);
}
