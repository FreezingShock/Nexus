// The town at a glance: the words on the town plaque, its hover snapshot, and the "My town" page's overview, badge and
// mayor tabs, plus a hand-drawn map of the town from above. Pure: numbers and grids in, HTML out, so node tests cover it.
// Saved text (the town and mayor names) only goes in through esc().
import { esc } from './cards.js';
import { fmtExact, fmtRateCompact } from './format.js';
import { ICON_LABEL, COLOR_LABEL, townIconSvg } from './town-icons.js';
import { TOWN_COLORS, TOWN_ICONS, TOWN_NAME_MAX } from '../sim/town.js';
import { ZONE_DEFS } from '../sim/zones.js';
import { ADVICE } from '../sim/services-config.js';

// How big the town feels, by the people living in it.
export const SIZES = [
  { min: 0, name: 'Hamlet' },
  { min: 40, name: 'Village' },
  { min: 200, name: 'Small town' },
  { min: 600, name: 'Market town' },
  { min: 1500, name: 'Town' },
  { min: 4000, name: 'City' },
];
export function townSize(people) {
  const p = Number.isFinite(people) ? people : 0;
  let s = SIZES[0];
  for (const x of SIZES) if (p >= x.min) s = x;
  return s.name;
}
// The mood of the town in one word, from the average happiness (the Happiness plaque uses the same words).
export function moodWord(avg) {
  for (const l of ADVICE.levels) if (avg >= l.min) return l.label;
  return ADVICE.levels[ADVICE.levels.length - 1].label;
}

// The small line under the name on the plaque: "Village · 69 folk · Year 2".
export function plaqueLine({ people, year }) {
  const n = Math.floor(Number.isFinite(people) ? people : 0);
  return `${townSize(n)} · ${fmtExact(n)} ${n === 1 ? 'soul' : 'folk'} · Year ${year || 1}`;
}

// What the town holds, counted from the placed buildings, the grid and the services summary.
// placed: state.placed; catOf(model) -> 'home' | 'shop' | 'work' | 'service' | 'park' | 'landmark' | 'farm';
// grid: { road, lot, zone } typed arrays; lots: state.lots ([[tile, level], ...]).
export function townCounts(placed, catOf, grid, lots) {
  const c = { home: 0, shop: 0, work: 0, service: 0, park: 0, landmark: 0, farm: 0, roadTiles: 0, lots: { 1: 0, 2: 0, 3: 0, 4: 0 } };
  for (const r of placed || []) { const k = catOf(r.model); if (k in c) c[k]++; }
  if (grid) for (let i = 0; i < grid.road.length; i++) if (grid.road[i]) c.roadTiles++;
  if (grid) for (const [i] of lots || []) { const z = grid.zone[i]; if (c.lots[z] !== undefined) c.lots[z]++; }
  return c;
}

// ---- the map from above ----

const LAND = '#D5DFB6', WATER = '#9CC3D5', FARM = '#E2D29A', ROAD = '#857B6C';
export const CAT_FILL = { home: '#C96F4F', shop: '#E6BC62', work: '#B9A47E', service: '#8FB8D6', park: '#8FB06A', landmark: '#97553E', farm: '#C9B26A' };

// Rectangles for every run of tiles in a row that share a non-empty key: [x, z, w, key].
function runs(N, x0, x1, z0, z1, keyAt) {
  const out = [];
  for (let z = z0; z <= z1; z++) {
    let start = -1, key = null;
    for (let x = x0; x <= x1 + 1; x++) {
      const k = x <= x1 ? keyAt(z * N + x) : null;
      if (k !== key) {
        if (key !== null) out.push([start, z, x - start, key]);
        start = x; key = k;
      }
    }
  }
  return out;
}

// The part of the grid the town covers: roads, zones and placed buildings, padded a little and kept roughly square.
export function townBounds(grid, placed, pad = 3, minSide = 18) {
  const N = grid.N;
  let x0 = N, z0 = N, x1 = -1, z1 = -1;
  const take = (x, z) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; };
  for (let i = 0; i < N * N; i++) if (grid.road[i] || grid.zone[i] || grid.lot[i]) take(i % N, Math.floor(i / N));
  for (const r of placed || []) { take(r.gx, r.gz); take(r.gx + (r.fw || 1) - 1, r.gz + (r.fd || 1) - 1); }
  if (x1 < 0) { const m = Math.floor(N / 2); x0 = x1 = z0 = z1 = m; }
  x0 -= pad; z0 -= pad; x1 += pad; z1 += pad;
  // grow the short side, then the whole box, to at least minSide, centred
  const grow = (a, b, to) => { const d = to - (b - a + 1); return d > 0 ? [a - Math.floor(d / 2), b + Math.ceil(d / 2)] : [a, b]; };
  const side = Math.max(minSide, x1 - x0 + 1, z1 - z0 + 1);
  [x0, x1] = grow(x0, x1, Math.max(side * 0.75 | 0, x1 - x0 + 1));
  [z0, z1] = grow(z0, z1, Math.max(side * 0.75 | 0, z1 - z0 + 1));
  const clamp = (a, b) => { if (a < 0) { b -= a; a = 0; } if (b > N - 1) { a -= b - (N - 1); b = N - 1; } return [Math.max(0, a), Math.min(N - 1, b)]; };
  [x0, x1] = clamp(x0, x1); [z0, z1] = clamp(z0, z1);
  return { x0, z0, x1, z1 };
}

// The map as inline SVG. grid: { N, base, road, zone, lot }; BASE water is 1 and farm is 3 (world/grid.js).
export function townMapSvg(grid, placed, catOf) {
  const N = grid.N, b = townBounds(grid, placed);
  const w = b.x1 - b.x0 + 1, h = b.z1 - b.z0 + 1;
  const rect = (x, z, rw, fill, extra = '') => `<rect x="${x}" y="${z}" width="${rw}" height="1" fill="${fill}"${extra}/>`;
  let out = '';
  for (const [x, z, rw, k] of runs(N, b.x0, b.x1, b.z0, b.z1, (i) => (grid.base[i] === 1 ? WATER : grid.base[i] === 3 ? FARM : null))) out += rect(x, z, rw, k);
  for (const [x, z, rw, k] of runs(N, b.x0, b.x1, b.z0, b.z1, (i) => (grid.zone[i] && !grid.road[i] ? (grid.lot[i] ? 'L' : 'Z') + grid.zone[i] : null))) {
    const def = ZONE_DEFS[Number(k.slice(1))];
    if (def) out += rect(x, z, rw, k[0] === 'L' ? def.paint : def.swatch, k[0] === 'L' ? '' : ' opacity=".7"');
  }
  for (const [x, z, rw] of runs(N, b.x0, b.x1, b.z0, b.z1, (i) => (grid.road[i] ? 1 : null))) out += rect(x, z, rw, ROAD);
  let homes = '';
  for (const r of placed || []) {
    if (r.gx < b.x0 || r.gz < b.z0 || r.gx > b.x1 || r.gz > b.z1) continue;
    const fill = CAT_FILL[catOf(r.model)] || CAT_FILL.home;
    homes += `<rect x="${r.gx + 0.12}" y="${r.gz + 0.12}" width="${(r.fw || 1) - 0.24}" height="${(r.fd || 1) - 0.24}" rx=".18" fill="${fill}" stroke="#2B2620" stroke-width=".16"/>`;
  }
  return `<svg class="tw-map" viewBox="${b.x0} ${b.z0} ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Your town from above: roads, zones and buildings">` +
    `<rect x="${b.x0}" y="${b.z0}" width="${w}" height="${h}" fill="${LAND}"/><g shape-rendering="crispEdges">${out}</g>${homes}</svg>`;
}

// ---- the plaque's hover card: a snapshot like the title screen's ----

// snap: { people, capacity, coinsRate, partsRate, mood, homes, date, day }
export function townHoverHtml(snap) {
  const chip = (cls, v, unit) => `<li class="tw-snap-${cls}"><i aria-hidden="true"></i><b>${v}</b>${unit ? ' ' + unit : ''}</li>`;
  return `<h3>Your town</h3><p class="pc-lead">${esc(snap.date)} · ${esc(snap.day)}</p>` +
    `<ul class="tw-snap">` +
    chip('people', fmtExact(Math.floor(snap.people)), `of ${fmtExact(snap.capacity)} places`) +
    chip('coins', fmtRateCompact(snap.coinsRate), 'coins') +
    chip('parts', fmtRateCompact(snap.partsRate), 'Parts') +
    chip('mood', esc(snap.mood), '') +
    chip('homes', fmtExact(snap.homes), snap.homes === 1 ? 'home' : 'homes') +
    `</ul><p class="pc-foot">Click for the town page: the map, your badge and name, and the mayor.</p>`;
}

// ---- the "My town" page ----

export const TOWN_TABS_DEF = [
  { id: 'overview', label: 'Overview', color: '#D3E4C4' },
  { id: 'badge', label: 'Name and badge', color: '#F6DDA0' },
  { id: 'mayor', label: 'Mayor', color: '#F2C9BA' },
];

const stat = (c, v, k) => `<li style="--c:${c}"><b>${v}</b><span>${k}</span></li>`;

// o: { town, size, year, dateLong, day, people, capacity, coinsRate, partsRate, mood, counts, map, districts }
export function overviewHtml(o) {
  const c = o.counts, L = c.lots;
  const roadM = c.roadTiles * 3;
  const legend = [['Homes', CAT_FILL.home], ['Shops', CAT_FILL.shop], ['Workshops', CAT_FILL.work], ['Services', CAT_FILL.service], ['Parks', CAT_FILL.park], ['Roads', ROAD], ['Water', WATER]]
    .map(([k, col]) => `<span><i style="background:${col}"></i>${k}</span>`).join('');
  return `<section class="pg-band tw-band" style="--tc:${TOWN_COLORS[o.town.color] || TOWN_COLORS.mustard}">
      <span class="tw-badge" style="background:${TOWN_COLORS[o.town.color] || TOWN_COLORS.mustard}">${townIconSvg(o.town.icon, 40)}</span>
      <div><b class="h-disp">${esc(o.town.name)}</b><small>${esc(o.size)} · ${esc(o.dateLong)} · ${esc(o.day)}</small></div>
      <button class="btn tw-edit" type="button" data-act="badge">Rename or change badge</button>
    </section>
    <div class="pg-cols tw-cols">
      <section class="pg-box tw-mapbox"><h3 class="h-disp">From above <small>north is up</small></h3>
        <div class="tw-mapwrap">${o.map}</div><p class="tw-legend">${legend}</p></section>
      <div class="pg-col">
        <section class="pg-box"><h3 class="h-disp">The town today</h3>
          <ul class="tw-stats">
            ${stat('#BFD8C4', fmtExact(Math.floor(o.people)), `residents, room for ${fmtExact(o.capacity)}`)}
            ${stat('#CFE0E8', esc(o.mood), 'how the homes feel')}
            ${stat('#F3D58A', fmtRateCompact(o.coinsRate), 'coins a second')}
            ${stat('#E3A08E', fmtRateCompact(o.partsRate), 'Parts a second')}
          </ul></section>
        <section class="pg-box"><h3 class="h-disp">What is built</h3>
          <dl class="pr-list tw-built">
            <div class="pr"><dt>Homes</dt><dd>${fmtExact(c.home)} placed · ${fmtExact(L[1])} grown</dd></div>
            <div class="pr"><dt>Shops</dt><dd>${fmtExact(c.shop)} placed · ${fmtExact(L[2])} grown</dd></div>
            <div class="pr"><dt>Workshops</dt><dd>${fmtExact(c.work)} placed · ${fmtExact(L[3])} grown</dd></div>
            <div class="pr"><dt>Services and landmarks</dt><dd>${fmtExact(c.service + c.landmark)}</dd></div>
            <div class="pr"><dt>Parks</dt><dd>${fmtExact(c.park)}</dd></div>
            <div class="pr"><dt>Roads</dt><dd>${fmtExact(roadM)} m</dd></div>
            <div class="pr"><dt>Named districts</dt><dd>${fmtExact(o.districts || 0)}</dd></div>
          </dl></section>
      </div>
    </div>`;
}

// The only place the town is renamed and its badge changed. A live preview of the plaque sits on top.
export function badgeHtml(town) {
  const col = TOWN_COLORS[town.color] || TOWN_COLORS.mustard;
  return `<section class="tw-preview"><span class="tw-eyebrow">How it looks on the plaque</span>
      <div class="tw-plaque card"><span class="townbadge" style="background:${col}">${townIconSvg(town.icon, 28)}</span><b class="h-disp">${esc(town.name)}</b></div></section>
    <div class="pg-cols">
      <section class="pg-box"><h3 class="h-disp">Town name</h3>
        <input class="tw-name h-disp" id="tw-name" type="text" maxlength="${TOWN_NAME_MAX}" autocomplete="off" spellcheck="false" value="${esc(town.name)}" aria-label="Town name">
        <p class="pg-soft">Up to ${TOWN_NAME_MAX} letters. It is saved as you type, and a blank name keeps the old one.</p></section>
      <section class="pg-box"><h3 class="h-disp">Badge</h3>
        <div class="tp-grid" role="group" aria-label="Icon">${TOWN_ICONS.map((n) => `<button class="tp-ic" type="button" data-icon="${n}" aria-pressed="${n === town.icon}" aria-label="${ICON_LABEL[n]}" title="${ICON_LABEL[n]}">${townIconSvg(n, 30)}</button>`).join('')}</div>
        <div class="tp-sw" role="group" aria-label="Badge colour">${Object.keys(TOWN_COLORS).map((c) => `<button class="tp-col" type="button" data-color="${c}" aria-pressed="${c === town.color}" aria-label="${COLOR_LABEL[c]}" title="${COLOR_LABEL[c]}" style="background:${TOWN_COLORS[c]}"></button>`).join('')}</div></section>
    </div>`;
}

// The mayor: picture, name and rank from the profile (kept per browser). Changed on the title screen's Mayor profile page.
// p: the profile; r: rankFor(...); avatar: its picture markup (already escaped).
export function mayorHtml(p, r, avatar, extra) {
  return `<section class="pf-head tw-mayor" style="--pc:${p.color}">
      <span class="pf-avatar">${avatar}</span>
      <div class="pf-id">
        <span class="tt-eyebrow">Mayor</span>
        <b class="h-disp tw-mayorname">${p.name ? esc(p.name) : 'The mayor'}</b>
        <p class="pf-rank">Rank <b>${esc(r.rank.name)}</b></p>
        <div class="pf-rankbar" role="progressbar" aria-label="Progress to the next rank" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(r.frac * 100)}"><i style="width:${Math.round(r.frac * 100)}%"></i></div>
        <small class="pf-tonext">${r.next ? `${r.toNext} more badge stage${r.toNext === 1 ? '' : 's'} to <b>${esc(r.next.name)}</b>` : 'The top of the ladder. The town is proud of you.'}</small>
      </div>
      <ul class="pf-stats">${extra.map(([v, label]) => `<li><b>${esc(v)}</b><small>${esc(label)}</small></li>`).join('')}</ul>
    </section>
    <p class="pg-soft tw-mayornote">Your name, picture and rank belong to you, not this town, so they stay when you start again. Change them on the title screen under <b>Mayor profile</b>.</p>`;
}
