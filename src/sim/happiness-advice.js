// The Happiness panel's words, as plain data: how the city feels, what helps, what pulls the streets down, and a few
// tips with the spot they are about. Pure: no DOM, no THREE. The sim system builds the inputs (see systems/services.js).
import { GRID_N, GRID_HALF } from '../world/grid.js';
import { ADVICE } from './services-config.js';

const AREA = GRID_N * GRID_N;
const SPACE = 22; // a tile this far from the middle counts as one side of town (the village scale, not the grid size)

// Which of the town's sides a tile is on, in words that fit a sentence: "the north-east side", "the middle of town".
export function areaPhrase(gx, gz) {
  const ns = gz < GRID_HALF - SPACE ? 'north' : gz > GRID_HALF + SPACE ? 'south' : '';
  const ew = gx < GRID_HALF - SPACE ? 'west' : gx > GRID_HALF + SPACE ? 'east' : '';
  if (ns && ew) return 'the ' + ns + '-' + ew + ' side';
  if (ns || ew) return 'the ' + (ns || ew) + ' side';
  return 'the middle of town';
}

// Cozy words for the overall level. Never a failure word: the lowest step says the town is just getting started.
export function levelOf(average, built) {
  if (!built) return { label: 'Nothing built yet' };
  for (const l of ADVICE.levels) if (average >= l.min) return { label: l.label };
  return { label: ADVICE.levels[ADVICE.levels.length - 1].label };
}

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

// Inputs: built (count of built tiles), average (0..1), homes (Uint8Array mask), maps (raw weight per kind:
// service, park, shop, industry, landmark, each Float32Array of GRID_N squared), counts (placed or zoned sources per kind).
export function adviceFrom({ built, average, homes, maps, counts }) {
  const t = ADVICE.touch;
  const level = levelOf(average, built);
  const pct = Math.round(average * 100);

  let total = 0;
  const reached = { service: 0, park: 0, shop: 0, landmark: 0, industry: 0 };
  let anyCover = 0;
  const sumX = { service: 0, park: 0, shop: 0, industry: 0 }, sumZ = { service: 0, park: 0, shop: 0, industry: 0 };
  const need = { service: 0, park: 0, shop: 0 };
  let touchedX = 0, touchedZ = 0, touched = 0;
  const served = { well: 0, some: 0, none: 0 }; // homes with two or more kinds in reach, with one, with none
  for (let i = 0; i < AREA; i++) {
    if (!homes[i]) continue;
    total++;
    const gx = i % GRID_N, gz = (i / GRID_N) | 0;
    let kinds = 0;
    for (const k of ['service', 'park', 'shop', 'landmark']) if (maps[k][i] >= t) { reached[k]++; kinds++; }
    if (kinds) anyCover++;
    served[kinds >= 2 ? 'well' : kinds ? 'some' : 'none']++;
    for (const k of ['service', 'park', 'shop']) if (maps[k][i] < t) { need[k]++; sumX[k] += gx; sumZ[k] += gz; }
    if (maps.industry[i] >= t) { reached.industry++; touched++; touchedX += gx; touchedZ += gz; }
  }
  const avgAt = (k, n) => ({ x: Math.round(sumX[k] / n), z: Math.round(sumZ[k] / n) });

  const helping = [];
  const labels = { service: ['service', 'services'], park: ['park', 'parks'], shop: ['shop', 'shops'], landmark: ['landmark', 'landmarks'] };
  for (const k of Object.keys(labels)) {
    const n = counts[k] || 0;
    if (n) helping.push({ text: plural(n, labels[k][0], labels[k][1]) + ' reach ' + plural(reached[k], 'home', 'homes') });
  }
  const hurting = [];
  if (counts.industry) hurting.push({ text: plural(counts.industry, 'industry site', 'industry sites') + ' ease ' + plural(touched, 'home', 'homes') + ', a little' });
  const bare = total - anyCover;
  if (total && bare > 0) hurting.push({ text: plural(bare, 'home has', 'homes have') + ' nothing nearby yet' });

  const tips = [];
  const addTip = (n, make) => { if (n >= ADVICE.minHomes) tips.push({ n, make }); };
  addTip(need.service, () => { const p = avgAt('service', need.service); return { ...p, kind: 'service', text: 'Add a clinic near ' + areaPhrase(p.x, p.z) + '. ' + plural(need.service, 'home has', 'homes have') + ' no service in reach' }; });
  addTip(need.park, () => { const p = avgAt('park', need.park); return { ...p, kind: 'park', text: 'A green near ' + areaPhrase(p.x, p.z) + ' would give ' + plural(need.park, 'home', 'homes') + ' a place to sit' }; });
  addTip(need.shop, () => { const p = avgAt('shop', need.shop); return { ...p, kind: 'shop', text: 'Shops near ' + areaPhrase(p.x, p.z) + ' would cheer up ' + plural(need.shop, 'home', 'homes') }; });
  if (touched >= ADVICE.minHomes) {
    const x = Math.round(touchedX / touched), z = Math.round(touchedZ / touched);
    tips.push({ n: touched, kind: 'industry', x, z, make: null, text: 'Industry is pulling on ' + plural(touched, 'home', 'homes') + ' near ' + areaPhrase(x, z) + '. A park or shop between them would soften it' });
  }
  const ranked = tips.map((tip) => (tip.make ? { ...tip.make(), n: tip.n } : tip))
    .sort((a, b) => b.n - a.n).slice(0, ADVICE.tipsMax)
    .map(({ x, z, kind, text }) => ({ gx: x, gz: z, kind, text }));

  const summary = summaryOf(built, total, served);
  return { built, average: pct, level, summary, helping, hurting, tips: ranked, quiet: total > 0 && ranked.length === 0, homes: total, reached, served, touched, counts: { ...counts } };
}

// One plain sentence about the homes: how many are well served (two or more kinds of good things in reach), and how many
// still have nothing nearby. No percentages: happiness is about what each home can walk to.
export function summaryOf(built, total, served) {
  if (!built) return 'Paint a few homes and they will start to feel something about the streets.';
  if (!total) return 'No homes yet. Happiness is about homes and what they can reach on foot.';
  const lead = served.well === total ? 'Every home is well served, with two or more good things in reach.'
    : plural(served.well, 'of ' + total + ' homes is', 'of ' + total + ' homes are') + ' well served, with two or more good things in reach.';
  return served.none ? lead + ' ' + plural(served.none, 'home still has', 'homes still have') + ' nothing nearby.' : lead;
}
