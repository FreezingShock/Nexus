// The look shared by every build menu: a card grid with a picture, a name, one line of description, one effect line,
// a cost or an unlock note, and a key badge where a key is bound. Pure string builders: no DOM, no THREE, so the
// markup and the numbers can be tested in node. Colours and shapes live in css/menus.css.
import { income } from '../sim/economy.js';
import { INDUSTRY, LANDMARKS, PARKS, SERVICES, SHOPS } from '../sim/services-config.js';
import { ZONE_DEFS } from '../sim/zones.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const mkey = (k) => `<kbd class="mkey">${esc(k)}</kbd>`;

// One card. `pic` is HTML (an <img> or an inline <svg>). `data` becomes data-* attributes (data: { pm: 'cottage' } gives data-pm).
// `unlock` replaces the cost line on a locked card. `short` marks a card the player cannot yet afford.
export function optCard({ pic = '', title, line = '', note = '', cost = '', unlock = '', key = '', pressed = false, locked = false, short = false, data = {}, cls = '' }) {
  const attrs = Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  const state = [locked ? 'locked' : '', short ? 'short' : '', cls].filter(Boolean).join(' ');
  const foot = unlock ? `<span class="unlock">${esc(unlock)}</span>` : cost ? `<span class="cost">${cost}</span>` : '';
  return `<button type="button" class="opt mcard${state ? ' ' + state : ''}" aria-pressed="${pressed}"${attrs}>` +
    `<span class="pic">${pic}</span>` +
    `<span class="txt"><b>${esc(title)}</b>${line ? `<small>${esc(line)}</small>` : ''}${note ? `<small class="fx">${esc(note)}</small>` : ''}</span>` +
    `<span class="foot">${foot}${key ? mkey(key) : ''}</span></button>`;
}

// A read-only tip card (the bulldoze help). Same plaque, no press state.
export function tipCard({ title, line, key = '' }) {
  return `<div class="mcard tip"><span class="txt"><b>${esc(title)}</b><small>${esc(line)}</small></span>` +
    `<span class="foot">${key ? mkey(key) : ''}</span></div>`;
}

// ---- road swatches: a cross-section of each road type, drawn flat with ink outlines ----
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

// ---- zone pictograms: a small building in each zone's paint colour, on a paper tile ----
const ZONE_SHAPE = {
  // a cottage with a door
  1: '<path d="M16 34V24l12-9 12 9v10z" fill="#FBF6EA"/><rect x="26" y="28" width="4" height="6" fill="#2B2620" opacity=".7"/>',
  // a shop with a scalloped awning
  2: '<rect x="15" y="20" width="26" height="14" fill="#FBF6EA"/><path d="M14 20h28l-2 5-3-3-3 3-3-3-3 3-3-3-3 3-3-3-3 3z" fill="#B8472E"/><rect x="22" y="27" width="12" height="7" fill="#7F98A6"/>',
  // a sawtooth workshop with a chimney
  3: '<path d="M14 34V22l6-5 6 5 6-5 6 5 6-5 2 2v20z" fill="#FBF6EA"/><rect x="34" y="12" width="4" height="10" fill="#2B2620" opacity=".7"/>',
  // a civic hall with a pediment and columns
  4: '<path d="M13 22L28 13L43 22z" fill="#FBF6EA"/><rect x="14" y="22" width="28" height="3" fill="#FBF6EA"/><rect x="17" y="25" width="3" height="9" fill="#FBF6EA"/><rect x="25" y="25" width="3" height="9" fill="#FBF6EA"/><rect x="33" y="25" width="3" height="9" fill="#FBF6EA"/><rect x="13" y="34" width="30" height="2" fill="#FBF6EA"/>',
};
// zone 0 (the eraser): diagonal hatch on paper, no building
export function zoneIcon(id) {
  const paint = id ? ZONE_DEFS[id].paint : null;
  const ground = paint ? `<rect width="56" height="44" fill="${paint}" opacity=".55"/>` :
    '<defs><pattern id="zh" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#FBF6EA"/><rect width="3" height="8" fill="#E9D6B2"/></pattern></defs><rect width="56" height="44" fill="url(#zh)"/>';
  const shape = id ? ZONE_SHAPE[id] : '<path d="M22 30l10-14 8 10-6 6h-6z" fill="#FBF6EA" stroke="#2B2620" stroke-width="2" stroke-linejoin="round"/>';
  return `<svg viewBox="0 0 56 44" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${ground}<line x1="0" y1="40" x2="56" y2="40" stroke="#2B2620" stroke-width="2" opacity=".35"/>${shape}</svg>`;
}

// ---- effect lines: one short line of what a model does ----
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// What a plain building earns at level 1, between its smallest and tallest storey counts.
export function buildingEffect(def) {
  const [lo, hi] = def.floors;
  if (!hi) return '';
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

// The effect line a menu card shows for a model: coverage if it has one, otherwise what it earns.
export function effectOf(def) {
  return coverageEffect(def.id) || buildingEffect(def);
}
