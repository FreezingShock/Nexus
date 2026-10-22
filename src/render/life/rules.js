// When and where the town shows life. Pure: no DOM, no THREE, no sim. Every answer is a function of a building's seed,
// the clock and a few sim numbers, so nothing here is saved and the same house always keeps the same habits.
// Used by the render systems named life-*.js. Notes and tunables are in docs/LIFE.md.
import { unit } from '../../sim/schedule.js';

// What a building is for, as far as its lights and visitors go. Parks have no kind (they are ground).
export function kindOf(b) {
  switch (b.cat) {
    case 'home': return 'home';
    case 'shop': return 'shop';
    case 'work': return b.model === 'office' ? 'office' : 'work';
    case 'service': return b.model === 'school' ? 'school' : 'service';
    case 'landmark': return 'landmark';
    case 'farm': return 'farm';
    default: return null;
  }
}
export const KINDS = ['home', 'shop', 'office', 'work', 'service', 'school', 'landmark', 'farm'];
export const kindIndex = (kind) => KINDS.indexOf(kind);

// Piecewise-linear curve through [hour, value] points, hours 0..24, evaluated at any hour (wraps).
export function curve(pts, hour) {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 1; i < pts.length; i++) {
    if (h <= pts[i][0]) {
      const [h0, v0] = pts[i - 1], [h1, v1] = pts[i];
      return h1 === h0 ? v1 : v0 + ((v1 - v0) * (h - h0)) / (h1 - h0);
    }
  }
  return pts[pts.length - 1][1];
}

// The share of a building's windows that are lit at an hour (if it is dark enough to notice). The windows with the lowest
// personal roll (see windowRoll) stay lit longest, so a house goes dim room by room rather than all at once.
const LIGHT = {
  home:     [[0, 0.05], [5, 0.05], [6.5, 0.4], [8.5, 0], [16, 0], [18.5, 0.7], [22, 0.75], [24, 0.05]],
  shop:     [[0, 0], [6.5, 0], [7, 0.9], [22, 0.9], [23, 0.1], [24, 0]],
  office:   [[0, 0.03], [7, 0.03], [8, 0.9], [19, 0.9], [21.5, 0.12], [24, 0.03]],
  work:     [[0, 0.1], [5.5, 0.1], [6, 0.85], [21.5, 0.85], [22.5, 0.1], [24, 0.1]],
  service:  [[0, 0.45], [6, 0.45], [8, 0.9], [20, 0.9], [22, 0.45], [24, 0.45]],
  school:   [[0, 0], [7, 0], [7.5, 0.9], [16.5, 0.9], [17.5, 0], [24, 0]],
  landmark: [[0, 0.1], [7, 0.1], [8, 0.8], [22, 0.8], [23, 0.1], [24, 0.1]],
};
LIGHT.farm = LIGHT.home;

// A household's habits shift its evening by up to an hour and a half either way.
export const householdShift = (seed) => -1 + 2.5 * unit(seed, 95);
export function lightShare(kind, hour, shift = 0) {
  const pts = LIGHT[kind];
  return pts ? curve(pts, kind === 'home' || kind === 'farm' ? hour - shift : hour) : 0;
}

// Each window's own luck, 0..1, fixed for life. Lit when its roll is under the share.
export const windowRoll = (seed, i) => unit(seed, 200 + i);
// The night blend (0 day, 1 night) at which a window comes on: spread across dusk so they light one by one.
export const dusk = (seed, i) => 0.3 + 0.45 * unit(seed, 700 + i);

// Is this home lived in? Homes fill in a fixed order as the town's population fills its capacity.
export function homeOccupied(seed, fill) {
  return unit(seed, 91) < Math.min(1, 0.12 + 1.05 * Math.max(0, fill));
}

// ---- smoke ----
const HEARTH_SEASON = { winter: 1, autumn: 0.7, spring: 0.5, summer: 0.15 };
const HEARTH_HOURS = [[0, 0.25], [5.5, 0.25], [6.5, 1], [9, 0.8], [11, 0.35], [15, 0.35], [17, 0.9], [21.5, 1], [23, 0.5], [24, 0.25]];
// Puffs per second from one lit chimney.
export function hearthRate(season, hour) {
  return 0.55 * (HEARTH_SEASON[season] ?? 0.5) * curve(HEARTH_HOURS, hour);
}

// ---- residents at the door ----
// How often (events per second per lived-in home) someone steps out, leaves or comes home.
const OUTINGS = [[0, 0], [5.5, 0], [6.5, 0.6], [9, 0.5], [11, 0.25], [15, 0.25], [16.5, 0.6], [19, 0.45], [21, 0.15], [23, 0], [24, 0]];
export const outingRate = (hour) => curve(OUTINGS, hour) / 30;
// What the next outing is, from a roll 0..1 and the hour: leaving mornings, coming home evenings, stepping out between.
export function outingKind(roll, hour) {
  const h = ((hour % 24) + 24) % 24, morning = h < 11, evening = h >= 16;
  const leave = morning ? 0.55 : evening ? 0.15 : 0.3, arrive = morning ? 0.1 : evening ? 0.6 : 0.3;
  return roll < leave ? 'leave' : roll < leave + arrive ? 'arrive' : 'step';
}

// ---- washing lines and cats ----
// A washing day: dry weather, daylight hours, a home's own luck for that day.
export function washDay(seed, day, hour, season, weatherKind) {
  if (hour < 8.5 || hour >= 17) return false;
  if (weatherKind === 'rain' || weatherKind === 'snow' || weatherKind === 'fog' || weatherKind === 'cloudy') return false;
  const share = season === 'winter' ? 0.08 : season === 'summer' ? 0.5 : 0.32;
  return unit(seed, 400 + (day % 997)) < share;
}
export const hasWashingLine = (seed) => unit(seed, 94) < 0.5;
export const hasCat = (seed) => unit(seed, 93) < 0.2;
// A cat is out on the roof by day in fair weather and in from the cold, wet or dark.
export function catOut(seed, hour, night, weatherKind, season) {
  if (night > 0.55 || weatherKind === 'rain' || weatherKind === 'snow') return false;
  if (season === 'winter' && unit(seed, 96) < 0.6) return false;
  const nap = unit(seed, 97), from = 8 + 3 * nap, to = 16 + 4 * nap; // out between late morning and late afternoon
  return hour >= from && hour < to;
}

// ---- visitors, workers, smoke stacks and deliveries ----
// Events per second at a building of this kind (before population and crowd scaling): shoppers, commuters, shift workers.
const VISITS = {
  shop: [[0, 0], [7.5, 0], [8.5, 0.5], [12, 0.85], [13.5, 0.6], [17, 0.95], [20, 0.6], [21.5, 0], [24, 0]],
  office: [[0, 0], [7, 0], [8, 0.9], [9.5, 0.3], [11.5, 0.2], [12, 0.8], [13.5, 0.2], [16.5, 0.3], [17.5, 0.9], [19, 0.2], [20, 0], [24, 0]],
  work: [[0, 0], [5, 0], [5.5, 0.8], [7, 0.3], [13.5, 0.2], [14, 0.8], [15.5, 0.2], [20.5, 0.2], [21, 0.7], [22.5, 0], [24, 0]],
};
export const visitRate = (kind, hour) => (VISITS[kind] ? curve(VISITS[kind], hour) : 0) / 12;
// Is this visit someone arriving (else leaving)? Shops see both; workplaces fill in the morning and empty out in the afternoon.
export function flowKind(kind, roll, hour) {
  const h = ((hour % 24) + 24) % 24;
  const arrive = kind === 'shop' ? 0.5 : h < 11 ? 0.85 : h < 15 ? 0.5 : 0.12;
  return roll < arrive ? 'arrive' : 'leave';
}
// Smoke from workshop stacks: steady through the working day, banked overnight. Puffs per second per stack.
const STACKS = [[0, 0.1], [5, 0.1], [6, 0.8], [21.5, 0.8], [22.5, 0.1], [24, 0.1]];
export const stackRate = (hour) => 0.9 * curve(STACKS, hour);
// A forklift works the yard through the working day.
export const forkliftWorking = (hour) => hour >= 6 && hour < 21.5;
// Seconds between delivery vans at a workplace in the working day (Infinity at other hours), shorter in a fuller town.
export const vanInterval = (hour, fill) => (hour >= 7 && hour < 19 ? 80 / (0.4 + Math.max(0, Math.min(1, fill))) : Infinity);
// Customers at a cafe: busy at breakfast, lunch and mid-afternoon. Sitting-down arrivals per second.
const CAFE = [[0, 0], [7.5, 0], [8.5, 0.6], [10, 0.35], [12, 0.9], [14, 0.4], [15.5, 0.7], [18, 0.4], [20.5, 0.15], [21.5, 0], [24, 0]];
export const cafeRate = (hour) => curve(CAFE, hour) / 14;

// ---- farms ----
// How grown the crops are in a season (0 bare soil, 1 ripe). Eased on screen, so a change of season is a visible growing.
const GROWTH = { spring: 0.4, summer: 1, autumn: 0.9, winter: 0 };
export const growthTarget = (season) => GROWTH[season] ?? 0.5;
// Crop colours by season: fresh, deep, golden.
export const CROP_TINT = { spring: 0xA9D36F, summer: 0x7FB04F, autumn: 0xE0B14E, winter: 0xBFB48F };
// A tractor works the fields on dry days from spring to autumn.
export const tractorWorking = (season, hour, weatherKind) => season !== 'winter' && hour >= 7 && hour < 18 && weatherKind !== 'rain' && weatherKind !== 'snow';
// Farm hands going out to a field or coming in again: events per second per farm.
const HANDS = [[0, 0], [5.5, 0], [6.5, 0.6], [11, 0.4], [14, 0.4], [18, 0.5], [19.5, 0], [24, 0]];
export const farmHandRate = (hour) => curve(HANDS, hour) / 25;
