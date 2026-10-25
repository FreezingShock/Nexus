// Hover cards for the top HUD plaques. Pure: state and sim numbers in, HTML out, so the text is tested in node.
// Only numbers, fixed words and our own labels are interpolated. Saved text (the town name) never goes in here.
import { BALANCE } from '../sim/balance.js';
import { ROAD_TYPES } from '../sim/catalog.js';
import { fmtTarget, goalById, standing } from '../sim/achievements.js';
import { pointsMult } from '../sim/progress.js';
import { fmtExact, fmtRateCompact } from './format.js';
import { FULL_S } from '../sim/offline.js';
import { modelById } from '../world/models.js';
import { MOOD } from '../sim/services-config.js';
import { longDate, townDays } from './date-text.js';
import { moodWord } from './town-view.js';

const CH = BALANCE.charge;

// Where the income comes from, by system id. Unknown ids read as "Other".
const SOURCE = {
  base: 'Base income', placement: 'Buildings', zoning: 'Zoned lots', services: 'Services and landmarks',
  progression: 'Goals and boosts', roads: 'Roads', traffic: 'Traffic', trees: 'Trees', upgrades: 'Upgrades',
};

const head = (title, lead) => `<h3>${title}</h3><p class="pc-lead">${lead}</p>`;
const next = (label, title, detail, extra = '') => `<div class="pc-next"><span>${label}</span><b>${title}</b><small>${detail}</small>${extra}</div>`;

// The next stage of the Coins earned goal, with its progress. Null when every stage is paid.
export function nextMilestone(state) {
  const s = standing(state, goalById('earned'));
  if (s.complete) return null;
  return { text: 'Earn ' + fmtTarget(s.goal, s.next), have: s.value, need: s.next };
}

// The first road type still locked by Parts, or null when all are open.
export function nextRoadUnlock(state) {
  const locked = ROAD_TYPES.filter((t) => t.unlockParts && !state.roadUnlocks.includes(t.id));
  if (!locked.length) return null;
  const t = locked.reduce((a, b) => (b.unlockParts < a.unlockParts ? b : a));
  return { name: t.short, need: t.unlockParts };
}

// Each source as a row with a little bar for its share of the total, biggest first. Upkeep (a minus) gets a clay bar.
export function sourceBars(by, limit = 5) {
  const rows = Object.entries(by || {}).filter(([, v]) => Number.isFinite(v) && Math.abs(v) >= 0.05).sort((a, b) => b[1] - a[1]).slice(0, limit);
  const top = Math.max(1e-9, ...rows.map(([, v]) => Math.abs(v)));
  return rows.length ? `<ul class="rc-src">${rows.map(([id, v]) =>
    `<li class="${v < 0 ? 'neg' : ''}"><span>${SOURCE[id] || 'Other'}</span><i style="--w:${Math.max(6, Math.round((Math.abs(v) / top) * 100))}%"></i><b>${fmtRateCompact(v)}</b></li>`).join('')}</ul>` : '';
}
const meter = (have, need) => `<span class="rc-meter"><i style="width:${need > 0 ? Math.min(100, Math.floor((have / need) * 100)) : 100}%"></i></span>`;
const big = (n, rate) => `<div class="rc-head"><b class="rc-num">${fmtExact(n)}</b><span class="rc-rate">${fmtRateCompact(rate)}</span></div>`;
const sec = (t) => `<h4 class="rc-sec">${t}</h4>`;

export function coinsCard(state, rate, breakdown) {
  const notes = [];
  if (state.boostS > 0) notes.push(`Charged boost ×${CH.boostMult}, ${Math.ceil(state.boostS)} s left`);
  const renewal = pointsMult(state.points) - 1;
  if (renewal > 0) notes.push(`+${Math.round(renewal * 100)}% from ${state.points} Renewal ${state.points === 1 ? 'point' : 'points'}`);
  const m = nextMilestone(state);
  return `<h3>Coins</h3>` + big(state.coins, rate) +
    `<p class="pc-lead"><b>${fmtExact(state.coins)}</b> in hand. Coins pay for roads, zones, buildings and upgrades. They come in every second, and keep coming while you are away: full pace for ${FULL_S / 3600} hours, then easing off.</p>` +
    sec('Where they come from') + sourceBars(breakdown.coins) +
    notes.map((n) => `<p class="pc-note">${n}</p>`).join('') +
    (m ? next('Next milestone', m.text, `${fmtExact(m.have)} of ${fmtExact(m.need)}`, meter(m.have, m.need)) : '') +
    `<p class="pc-foot">Earned in this town, all told: ${fmtExact(state.earned)} coins</p>`;
}

export function partsCard(state, rate, breakdown) {
  const u = nextRoadUnlock(state);
  return `<h3>Parts</h3>` + big(state.parts, rate) +
    `<p class="pc-lead"><b>${fmtExact(state.parts)}</b> in hand. Parts are the town's spare bolts and beams: they open bigger roads, new paint colours and new decorations, once each. Workshops and industrial lots make the most, and daily goals pay out in Parts.</p>` +
    sec('Where they come from') + sourceBars(breakdown.parts) +
    (u
      ? next('Next road unlock', u.name, state.parts >= u.need ? `Ready: ${fmtExact(u.need)} Parts to open it` : `${fmtExact(state.parts)} of ${fmtExact(u.need)} Parts`, meter(state.parts, u.need))
      : '<p class="pc-note">Every road type is open.</p>');
}

// The town plaque's snapshot, read from the sim: { people, capacity, coinsRate, partsRate, mood, homes, date, day }.
export function townSnap(sim) {
  const s = sim.state, pp = sim.population;
  let homes = 0;
  for (const r of s.placed || []) { const m = modelById(r.model); if (m && m.cat === 'home') homes++; }
  if (sim.grid && s.lots) for (const [i] of s.lots) if (sim.grid.zone[i] === 1) homes++;
  return {
    people: pp ? pp.people() : 0, capacity: pp ? pp.capacity() : 0,
    coinsRate: sim.rate(), partsRate: sim.partsRate(),
    mood: moodWord(sim.services ? sim.services.average() : MOOD.base), homes,
    date: s.month != null ? longDate(s) : '', day: s.dayIdx != null ? townDays(s) : '',
  };
}

// Demand: one row per zone with its letter tile, a plain word and a bar, and a short reason under it. stats are
// zoning.stats() (lot counts by zone). Demand sets how fast zoned ground grows and levels up (src/sim/zones.js demandOf).
const NAMES = { 1: 'Homes', 2: 'Shops', 3: 'Workshops' };
const KEYS = { 1: 'R', 2: 'C', 3: 'I' };
// The plaque's one line: what the town wants most, when it really wants something.
export function wantLine(d) {
  const top = [1, 2, 3].reduce((a, z) => (d[z] > d[a] ? z : a), 1);
  if (d[top] >= 0.7) return 'Wants ' + NAMES[top].toLowerCase();
  return [1, 2, 3].every((z) => d[z] <= 0.3) ? 'All settled' : 'Steady';
}
export const demandWord = (p) => (p >= 70 ? 'Wanted' : p > 30 ? 'Some room' : 'Plenty for now');
export function demandCard(d, stats, paint) {
  const res = stats.byZone[1] || 0, com = stats.byZone[2] || 0, ind = stats.byZone[3] || 0;
  const lots = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const why = {
    1: `${lots(com + ind, 'job lot', 'job lots')} looking for workers, ${lots(res, 'home lot', 'home lots')} so far`,
    2: `${lots(res, 'home lot', 'home lots')} to serve, ${lots(com, 'shop lot', 'shop lots')} so far`,
    3: `${lots(res, 'home lot', 'home lots')} to supply, ${lots(ind, 'workshop lot', 'workshop lots')} so far`,
  };
  const rows = [1, 2, 3].map((z) => {
    const p = Math.round(d[z] * 100), word = demandWord(p);
    return `<div class="dr${p >= 70 ? ' hot' : ''}"><span class="dk" style="background:${paint[z]}">${KEYS[z]}</span>` +
      `<div><b>${NAMES[z]}<em>${word}</em></b><span class="dbar" role="img" aria-label="${NAMES[z]} demand ${p}%"><i style="width:${p}%;background:${paint[z]}"></i></span><small>${why[z]}</small></div></div>`;
  });
  return head('Demand', 'What the town would like you to zone next.') + rows.join('') +
    '<p class="pc-foot">Higher demand grows zoned ground faster and levels it up sooner. It never stops growth, only slows it.</p>';
}
