// Hover cards for the top HUD plaques. Pure: state and sim numbers in, HTML out, so the text is tested in node.
// Only numbers, fixed words and our own labels are interpolated. Saved text (the town name) never goes in here.
import { BALANCE } from '../sim/balance.js';
import { ROAD_TYPES } from '../sim/catalog.js';
import { pendingPoints, pointsMult, runNeededFor } from '../sim/progress.js';
import { fmtCompact, fmtExact, fmtRateCompact } from './format.js';

const CH = BALANCE.charge;

// Where the income comes from, by system id. Unknown ids read as "Other".
const SOURCE = {
  base: 'Base income', placement: 'Buildings', zoning: 'Zoned lots', services: 'Services and landmarks',
  progression: 'Goals and boosts', roads: 'Roads', traffic: 'Traffic', trees: 'Trees', upgrades: 'Upgrades',
};

// The biggest sources first, skipping anything too small to show at one decimal.
export function sourceRows(by, limit = 4) {
  return Object.entries(by || {})
    .filter(([, v]) => Number.isFinite(v) && Math.abs(v) >= 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, v]) => ({ label: SOURCE[id] || 'Other', value: fmtRateCompact(v) }));
}

const rowsHtml = (rows) => rows.map((r) => `<div class="pr"><dt>${r.label}</dt><dd>${r.value}</dd></div>`).join('');
const list = (rows) => (rows.length ? `<dl class="pr-list">${rowsHtml(rows)}</dl>` : '');
const head = (title, lead) => `<h3>${title}</h3><p class="pc-lead">${lead}</p>`;
const next = (label, title, detail) => `<div class="pc-next"><span>${label}</span><b>${title}</b><small>${detail}</small></div>`;

// The first milestone not yet paid, with its progress. Null when all are paid.
export function nextMilestone(state) {
  const m = BALANCE.milestones.find((x) => !state.milestones.includes(x.id));
  if (!m) return null;
  return { text: m.text, have: statValue(state, m.stat), need: m.n };
}
function statValue(state, stat) {
  if (stat === 'earned') return state.earned;
  if (stat === 'renewals') return state.renewals;
  return (state.stats && state.stats[stat]) || 0;
}

// The first road type still locked by Parts, or null when all are open.
export function nextRoadUnlock(state) {
  const locked = ROAD_TYPES.filter((t) => t.unlockParts && !state.roadUnlocks.includes(t.id));
  if (!locked.length) return null;
  const t = locked.reduce((a, b) => (b.unlockParts < a.unlockParts ? b : a));
  return { name: t.short, need: t.unlockParts };
}

export function coinsCard(state, rate, breakdown) {
  const notes = [];
  if (state.boostS > 0) notes.push(`Charged boost ×${CH.boostMult}, ${Math.ceil(state.boostS)} s left`);
  const renewal = pointsMult(state.points) - 1;
  if (renewal > 0) notes.push(`+${Math.round(renewal * 100)}% from ${state.points} Renewal ${state.points === 1 ? 'point' : 'points'}`);
  const m = nextMilestone(state);
  return head('Coins', `<b>${fmtExact(state.coins)}</b> in hand. Earned every second, and while you are away.`) +
    list([{ label: 'Total', value: fmtRateCompact(rate) }, ...sourceRows(breakdown.coins)]) +
    notes.map((n) => `<p class="pc-note">${n}</p>`).join('') +
    (m ? next('Next milestone', m.text, `${fmtExact(m.have)} of ${fmtExact(m.need)}`) : '') +
    `<p class="pc-foot">Lifetime: ${fmtExact(state.earned)} coins</p>`;
}

export function partsCard(state, rate, breakdown) {
  const u = nextRoadUnlock(state);
  return head('Parts', `<b>${fmtExact(state.parts)}</b> in hand. Parts unlock bigger roads, and industrial lots make the most.`) +
    list([{ label: 'Total', value: fmtRateCompact(rate) }, ...sourceRows(breakdown.parts)]) +
    (u
      ? next('Next road unlock', u.name, state.parts >= u.need ? `Ready: ${fmtExact(u.need)} Parts to open it` : `${fmtExact(state.parts)} of ${fmtExact(u.need)} Parts`)
      : '<p class="pc-note">Every road type is open.</p>');
}

// Renewal: what it is, the progress to the next point, and what the points already give.
export function renewalCard(state) {
  const pts = pendingPoints(state.runEarned), need = runNeededFor(pts), pct = Math.min(100, Math.floor((state.runEarned / need) * 100));
  const kept = state.points, bonus = Math.round((pointsMult(kept) - 1) * 100);
  const status = pts < 1
    ? `Opens at ${fmtExact(BALANCE.renewal.divisor)} coins in one run.`
    : `Ready: renewing now gives +${pts} ${pts === 1 ? 'point' : 'points'}.`;
  return head('Renewal', 'Start the town again for income that lasts. Your points stay with you for good.') +
    next('This run', `${pct}%`, `${fmtCompact(state.runEarned)} of ${fmtCompact(need)} coins for the next point`) +
    `<p class="pc-note">${status}</p>` +
    list([
      { label: 'Points kept', value: String(kept) },
      { label: 'Income bonus', value: '+' + bonus + '%' },
      { label: 'Renewals', value: String(state.renewals) },
    ]);
}

// The town plaque: how to change it, and the Renewal count.
export function townCard(state) {
  return head('Your town', 'Click the name to rename it. Click the badge to pick a new icon and colour.') +
    list([{ label: 'Renewals', value: String(state.renewals) }, { label: 'Points kept', value: String(state.points) }]);
}

// Demand: the full zone names, the percentage, and what drives each bar. stats are zoning.stats() (lot counts by zone).
const NAMES = { 1: 'Residential', 2: 'Commercial', 3: 'Industrial' };
const KEYS = { 1: 'R', 2: 'C', 3: 'I' };
export function demandCard(d, stats, paint) {
  const res = stats.byZone[1] || 0, com = stats.byZone[2] || 0, ind = stats.byZone[3] || 0;
  const why = {
    1: `${com + ind} shop and workshop lots against ${res} home lots`,
    2: `${res} home lots against ${com} shop lots`,
    3: `${res} home lots against ${ind} workshop lots`,
  };
  const hint = (p) => (p >= 70 ? 'Strong: zone more of this.' : p <= 30 ? 'Plenty already.' : 'Steady.');
  const rows = [1, 2, 3].map((z) => {
    const p = Math.round(d[z] * 100);
    return `<div class="dr"><span class="dk" style="background:${paint[z]}">${KEYS[z]}</span>` +
      `<div><b>${NAMES[z]} <em>${p}%</em></b><small>${why[z]}. ${hint(p)}</small></div></div>`;
  });
  return head('Demand', 'How much each kind of building wants to be built here.') + rows.join('');
}
