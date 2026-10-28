// The look shared by every build menu: compact tiles with a picture, a name, a price chip and a key badge, plus the
// zone vignettes, road swatches and category icons. Pure string builders: no DOM, no THREE, so the markup and the
// numbers can be tested in node. Colours and sizes live in css/menus.css.
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
  // Homes: a cottage with a terracotta roof, chimney, window and door
  home: '<rect x="14" y="3" width="3" height="5" fill="#C9B48F" stroke="#2B2620" stroke-width="1.5"/><path d="M2.5 11.5L11 3.5l8.5 8z" fill="#C4573A" stroke="#2B2620" stroke-width="1.7" stroke-linejoin="round"/><rect x="4.5" y="11.5" width="13" height="8" fill="#F6E7C6" stroke="#2B2620" stroke-width="1.7"/><rect x="9.5" y="14" width="3.2" height="5.5" fill="#7A4B2E" stroke="#2B2620" stroke-width="1.3"/><rect x="5.8" y="13" width="2.6" height="2.6" fill="#9CCBDD" stroke="#2B2620" stroke-width="1.1"/><rect x="13.8" y="13" width="2.6" height="2.6" fill="#9CCBDD" stroke="#2B2620" stroke-width="1.1"/>',
  // Shops: a striped awning over a shop window
  shop: '<rect x="3.5" y="9.5" width="15" height="10" fill="#F6E7C6" stroke="#2B2620" stroke-width="1.7"/><path d="M2.5 9.5l1.5-5.5h14l1.5 5.5z" fill="#FBF6EA" stroke="#2B2620" stroke-width="1.7" stroke-linejoin="round"/><path d="M6.2 4l-.9 5.5M10 4v5.5M13.8 4l.9 5.5" stroke="#C4573A" stroke-width="2.2"/><rect x="5.5" y="12" width="6" height="4.5" fill="#9CCBDD" stroke="#2B2620" stroke-width="1.2"/><rect x="13" y="12" width="3" height="7.5" fill="#7A4B2E" stroke="#2B2620" stroke-width="1.2"/>',
  // Workplaces: an office block with rows of windows
  work: '<rect x="5" y="2.5" width="12" height="17" fill="#B9C4D6" stroke="#2B2620" stroke-width="1.7"/><g fill="#FBF6EA" stroke="#2B2620" stroke-width="1"><rect x="7.2" y="5" width="2.6" height="2.4"/><rect x="12.2" y="5" width="2.6" height="2.4"/><rect x="7.2" y="9.2" width="2.6" height="2.4"/><rect x="12.2" y="9.2" width="2.6" height="2.4"/></g><rect x="9.3" y="14.5" width="3.4" height="5" fill="#2B2620"/><path d="M2.5 19.5h17" stroke="#2B2620" stroke-width="1.8" stroke-linecap="round"/>',
  // Farms: a red barn with a cross-braced door and a hay roof line
  farm: '<path d="M3 19.5V9.5L11 3l8 6.5v10z" fill="#C4573A" stroke="#2B2620" stroke-width="1.7" stroke-linejoin="round"/><rect x="7" y="11.5" width="8" height="8" fill="#F6E7C6" stroke="#2B2620" stroke-width="1.4"/><path d="M7 11.5l8 8M15 11.5l-8 8" stroke="#2B2620" stroke-width="1.3"/><circle cx="11" cy="7.8" r="1.2" fill="#F6E7C6" stroke="#2B2620" stroke-width="1"/>',
  // Landmarks: a clock tower with a gold roof and flag
  landmark: '<path d="M11 1v3.5" stroke="#2B2620" stroke-width="1.4"/><path d="M11 1.2l3 1.2-3 1.2z" fill="#C4573A" stroke="#2B2620" stroke-width="1"/><path d="M6.5 8.5L11 4l4.5 4.5z" fill="#E6BC62" stroke="#2B2620" stroke-width="1.6" stroke-linejoin="round"/><rect x="7" y="8.5" width="8" height="11" fill="#E9DDBF" stroke="#2B2620" stroke-width="1.7"/><circle cx="11" cy="12" r="2.6" fill="#FBF6EA" stroke="#2B2620" stroke-width="1.3"/><path d="M11 10.4V12l1.1.8" fill="none" stroke="#2B2620" stroke-width="1.1" stroke-linecap="round"/><path d="M4.5 19.5h13" stroke="#2B2620" stroke-width="1.8" stroke-linecap="round"/>',
  service: '<rect x="3" y="3" width="16" height="16" rx="5" fill="#FBF6EA" stroke="#2B2620" stroke-width="1.8"/><path d="M11 7v8M7 11h8" stroke="#B8472E" stroke-width="2.6" stroke-linecap="round"/>',
  park: '<circle cx="11" cy="8" r="5" fill="#A8C179" stroke="#2B2620" stroke-width="1.8"/><path d="M11 13v6" stroke="#2B2620" stroke-width="2"/>',
  // Greenery: a round tree and a bush
  greenery: '<rect x="9.8" y="12" width="2.4" height="7" fill="#7A4B2E" stroke="#2B2620" stroke-width="1.3"/><circle cx="10.5" cy="8" r="5.6" fill="#8FB86C" stroke="#2B2620" stroke-width="1.7"/><circle cx="8.6" cy="6.8" r="1.2" fill="#B5D68F"/><path d="M3 19.5h16" stroke="#2B2620" stroke-width="1.8" stroke-linecap="round"/>',
  // Street: a lamp post with a gold lantern
  street: '<path d="M11 19.5V8.5" stroke="#2B2620" stroke-width="2.2" stroke-linecap="round"/><path d="M7.5 19.5h7" stroke="#2B2620" stroke-width="2" stroke-linecap="round"/><path d="M7 8.5h8l-1.2-5.5H8.2z" fill="#F2D27A" stroke="#2B2620" stroke-width="1.6" stroke-linejoin="round"/><path d="M8.2 3L11 1.2 13.8 3" fill="#2B2620" stroke="#2B2620" stroke-width="1.2" stroke-linejoin="round"/>',
  // Plaza: a fountain with a water jet
  plaza: '<path d="M11 14V8" stroke="#2B2620" stroke-width="1.6"/><path d="M11 8c-2.8-.2-3.6 2-4.4 3.5M11 8c2.8-.2 3.6 2 4.4 3.5" fill="none" stroke="#5FA8C8" stroke-width="1.8" stroke-linecap="round"/><path d="M3 13.5h16l-2 5.5H5z" fill="#E9DDBF" stroke="#2B2620" stroke-width="1.7" stroke-linejoin="round"/><ellipse cx="11" cy="13.5" rx="8" ry="2" fill="#8FC4D8" stroke="#2B2620" stroke-width="1.5"/>',
  // Festive: a fir with a gold star and baubles
  festive: '<path d="M11 3l1 2.2 2.4.3-1.8 1.6.5 2.4L11 8.3 8.9 9.5l.5-2.4L7.6 5.5 10 5.2z" fill="#F2D27A" stroke="#2B2620" stroke-width="1.1" stroke-linejoin="round"/><path d="M11 7.5l4.8 5h-2.3l3.8 5.5H4.7l3.8-5.5H6.2z" fill="#5FA86A" stroke="#2B2620" stroke-width="1.6" stroke-linejoin="round"/><circle cx="9.5" cy="14.5" r="1" fill="#C4573A"/><circle cx="13" cy="16.2" r="1" fill="#F2D27A"/><rect x="10" y="18" width="2" height="2.2" fill="#7A4B2E" stroke="#2B2620" stroke-width="1"/>',
};
// Paints a build flyout without rebuilding it: the frame and tabs are made once per `key` (the tool and its sections);
// after that only the pressed tab, the footer and the card row change. With `swap`, the card row fades and slides into
// the next group instead of snapping. `attr` is the tab's data attribute, `active` the chosen section id.
export function paintFly(fly, key, { tabs, strip, foot, attr, active }, swap) {
  const bar = fly.querySelector(':scope > .pbar'), st = bar && bar.querySelector('.strip'), pf = fly.querySelector(':scope > .pfoot');
  if (!st || !pf || fly.dataset.shell !== key) {
    fly.innerHTML = `<div class="pbar">${tabs}<div class="strip">${strip}</div></div><div class="pfoot">${foot}</div>`;
    fly.dataset.shell = key;
    return;
  }
  for (const b of fly.querySelectorAll('.ptab')) b.setAttribute('aria-pressed', String(b.getAttribute(attr) === active));
  pf.innerHTML = foot;
  const calm = typeof document !== 'undefined' && document.documentElement.dataset.motion === 'calm';
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  st._next = strip;
  if (!swap || calm || reduced || typeof st.animate !== 'function') {
    const left = st.scrollLeft;
    st.innerHTML = strip;
    st.scrollLeft = swap ? 0 : left;
    return;
  }
  if (st._swapping) return;
  st._swapping = true;
  const out = st.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-12px)' }], { duration: 90, easing: 'ease-in', fill: 'forwards' });
  out.finished.then(() => {
    st.innerHTML = st._next; st.scrollLeft = 0; st._swapping = false;
    out.cancel();
    st.animate([{ opacity: 0, transform: 'translateX(14px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2,.8,.3,1)' });
  }, () => { st._swapping = false; });
}

// Bookmark tabs on the left edge of a build flyout: a big icon on a tinted tab, the section name slides out on hover,
// focus and for the chosen tab. `attr` is the data attribute the owning module listens for (data-pcat, data-dcat).
const TAB_TINT = { home: '#E8A87C', shop: '#E3B8A0', work: '#B9C4D6', farm: '#D9C27A', landmark: '#E6BC62', service: '#E39A8E', park: '#A8C179', greenery: '#A8C179', street: '#E6BC62', plaza: '#9FC8D6', festive: '#D98C8C' };
export const bookmarkTabs = (items, active, attr) => `<div class="ptabs" role="group" aria-label="Section">${items.map((x, i) =>
  `<button type="button" class="ptab" ${attr}="${x.id}" aria-pressed="${x.id === active}" aria-label="${esc(x.name)}" style="--tc:${TAB_TINT[x.id] || '#E8A87C'};--i:${i}">${categoryIcon(x.id)}<span class="ptab-name">${esc(x.name)}</span></button>`).join('')}</div>`;
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
  if (def.free) return `Drag it to any size · flat ground · earns ${+(income(1, 1) * def.perTile).toFixed(2)} coins/s per tile`; // fields repeat to fill the lot
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
