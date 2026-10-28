// First days: a welcome postcard and a soft glow on the next useful toolbar tool, for a new town. Nothing is a task and
// nothing is timed. Pure rules and words (no DOM), so they are tested in node. Six steps are read from the town itself,
// and once done a step stays done; the glow only ever points at the next tool the player has not yet tried. Kept per browser under its own key (like
// the mayor profile), so Start over shows it again only if the player asks.
import { modelById } from '../world/models.js';
import { starterStreetTiles } from '../world/starter.js';

export const FIRST_KEY = 'nexus.firstdays.v1';

// tool: the toolbar tool that "Show me" picks; key: its shortcut.
export const STEPS = [
  { id: 'road', head: 'Lay a road', text: 'Click where it starts and where it ends. Roads find their own bends.', tool: 'roads', key: 'R', done: 'Your first road is open. The cars will find it.' },
  { id: 'home', head: 'Paint a home zone', text: 'Paint beside a street and homes grow there by themselves.', tool: 'zones', key: 'Z', done: 'Homes will grow along that street.' },
  { id: 'shop', head: 'Open a shop', text: 'Shops give neighbours somewhere to wander and coins to earn.', tool: 'build', key: 'B', done: 'The shop sign is up. Business is gentle but steady.' },
  { id: 'park', head: 'Plant a park', text: 'Green space makes homes nearby happier.', tool: 'parks', key: 'P', done: 'A park for the neighbours. Lovely.' },
  { id: 'service', head: 'Add a service', text: 'A clinic, school, fire station or police post keeps a whole area content.', tool: 'services', key: 'C', done: 'Now the neighbourhood has someone to call on.' },
  { id: 'upgrade', head: 'Upgrade a building', text: 'Click any building and press Upgrade. It grows, and so does its income.', tool: null, key: '', done: 'Taller, brighter and earning more.' },
];

const empty = () => ({ welcomed: false, hidden: false, done: [], seen: [] });

export function sanitize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const ids = new Set(STEPS.map((s) => s.id));
  return {
    welcomed: r.welcomed === true,
    hidden: r.hidden === true,
    done: Array.isArray(r.done) ? [...new Set(r.done.filter((d) => ids.has(d)))] : [],
    seen: Array.isArray(r.seen) ? [...new Set(r.seen.filter((d) => ids.has(d)))] : [],
  };
}

export function loadFirst(storage) {
  try { return sanitize(JSON.parse(storage.getItem(FIRST_KEY))); } catch { return empty(); }
}
export function saveFirst(storage, data) {
  try { storage.setItem(FIRST_KEY, JSON.stringify(sanitize(data))); } catch { /* blocked storage: the list simply starts fresh next time */ }
}

const catOf = (rec) => { const m = modelById(rec.model); return m ? m.cat : null; };

// Which steps the town satisfies right now. The village's own buildings and streets do not count: only the player's.
export function stepsDoneIn(state, grid) {
  const mine = state.placed.filter((r) => !r.starter);
  const has = (cat) => mine.some((r) => catOf(r) === cat);
  const roads = Object.keys(state.roads).length - starterStreetTiles().length;
  const grown = Object.values(state.levels || {}).some((l) => l > 1) || state.lots.some(([, level]) => level > 1);
  return {
    road: roads >= 2,
    home: has('home') || state.lots.some(([i]) => grid.zone[i] === 1),
    shop: has('shop'),
    park: has('park'),
    service: has('service'),
    upgrade: grown,
  };
}

// Folds what the town shows into what is already ticked. Returns { data, fresh } where fresh are the steps newly done.
export function advance(data, nowDone) {
  const done = new Set(data.done), fresh = [];
  for (const s of STEPS) if (nowDone[s.id] && !done.has(s.id)) { done.add(s.id); fresh.push(s); }
  return { data: { ...data, done: STEPS.map((s) => s.id).filter((id) => done.has(id)) }, fresh };
}

// The welcome card. Tab one is a short path of first steps, each tinted like its toolbar tile; tab two says what the numbers
// along the top mean. `c` is a fallback tint (the real one is read from the toolbar), `tool` picks the real toolbar icon.
export const LOOK = { head: 'Look around', keys: [['Drag', 'move'], ['Scroll', 'zoom'], ['Q E', 'turn'], ['F', 'fly low']] };

export const PATH = [
  { tool: 'roads', key: 'R', c: '#D8CDB4', head: 'Lay a road', text: 'Click where it starts, then where it ends. Roads find their own bends, and a street is what everything else grows beside.' },
  { tool: 'zones', key: 'Z', c: '#BFD8C4', head: 'Zone homes beside it', text: 'Paint a strip next to the street. Homes move in and grow by themselves, and shops and workshops follow.' },
  { tool: 'build', key: 'B', c: '#E3A08E', head: 'Put up a shop or two', text: 'Pick a building and place it on a lot touching a street. Shops and cafés give neighbours somewhere to go.' },
  { tool: 'parks', key: 'P', c: '#A8C179', head: 'Plant a park', text: 'Green space makes the homes around it happier, and happier homes pay more.' },
  { tool: 'services', key: 'C', c: '#DCE8EC', head: 'Add a service', text: 'A clinic, school, fire station or police post keeps a whole area content. Click any building later to upgrade it.' },
];

export const NUMBERS = [
  { id: 'coins', c: '#E6BC62', head: 'Coins', text: 'Earned every second by your homes, shops and workshops. Spend them on roads, buildings and upgrades. They keep arriving while you are away.' },
  { id: 'parts', c: '#E3A08E', head: 'Parts', text: 'A slower trickle, mostly from workshops. Bigger roads and some builds ask for Parts, so they are worth saving.' },
  { id: 'happy', c: '#C9DDB8', head: 'Happiness', text: 'The town mood. Parks, shops and services within reach of a home lift it. Click it to see which homes need what.' },
  { id: 'demand', c: '#9CC3D5', head: 'Wanted / Plenty', text: 'The demand bars say what the town is asking for: "Wanted" means paint more of that zone, "Plenty for now" means wait.' },
  { id: 'goals', c: '#F2D27A', head: 'Goals and Charge', text: 'G opens three small daily goals. Building fills Charge, and spending it doubles your coins for a minute. All optional.' },
];

// The tool to glow: the first step with a tool that is not done and whose tool the player has not picked up yet.
export function nextPulse(data) {
  if (data.hidden) return null;
  const s = STEPS.find((st) => st.tool && !data.done.includes(st.id) && !data.seen.includes(st.id));
  return s ? s.tool : null;
}

// Picking a step's tool counts as having seen it, so the glow moves on instead of nagging.
export function markSeen(data, tool) {
  const ids = STEPS.filter((st) => st.tool === tool).map((st) => st.id);
  return ids.length ? { ...data, seen: [...new Set([...data.seen, ...ids])] } : data;
}

export const isComplete = (data) => data.done.length >= STEPS.length;

// A first sight with nothing stored: a brand-new town gets the welcome, a town that is already being played does not.
export function isVeteran(nowDone) { return Object.values(nowDone).some(Boolean); }

export const countLine = (data) => data.done.length + ' of ' + STEPS.length;
