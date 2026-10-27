// "Your first days": six small, optional things to try in a new town. Pure rules and words (no DOM), so they are tested in
// node. Each step is read from the town itself, and once ticked it stays ticked. Kept per browser under its own key (like
// the mayor profile), so Start over shows it again only if the player asks.
import { modelById } from '../world/models.js';
import { starterStreetTiles } from '../world/starter.js';

export const FIRST_KEY = 'nexus.firstdays.v1';

// The list's current state, shared with the Goals page so it can show the same count. Set by modules/first-days.js.
export const live = { data: null };

// tool: the toolbar tool that "Show me" picks; key: its shortcut.
export const STEPS = [
  { id: 'road', head: 'Lay a road', text: 'Click where it starts and where it ends. Roads find their own bends.', tool: 'roads', key: 'R', done: 'Your first road is open. The cars will find it.' },
  { id: 'home', head: 'Paint a home zone', text: 'Paint beside a street and homes grow there by themselves.', tool: 'zones', key: 'Z', done: 'Homes will grow along that street.' },
  { id: 'shop', head: 'Open a shop', text: 'Shops give neighbours somewhere to wander and coins to earn.', tool: 'build', key: 'B', done: 'The shop sign is up. Business is gentle but steady.' },
  { id: 'park', head: 'Plant a park', text: 'Green space makes homes nearby happier.', tool: 'parks', key: 'P', done: 'A park for the neighbours. Lovely.' },
  { id: 'service', head: 'Add a service', text: 'A clinic, school, fire station or police post keeps a whole area content.', tool: 'services', key: 'C', done: 'Now the neighbourhood has someone to call on.' },
  { id: 'upgrade', head: 'Upgrade a building', text: 'Click any building and press Upgrade. It grows, and so does its income.', tool: null, key: '', done: 'Taller, brighter and earning more.' },
];

const empty = () => ({ welcomed: false, hidden: false, done: [] });

export function sanitize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const ids = new Set(STEPS.map((s) => s.id));
  return {
    welcomed: r.welcomed === true,
    hidden: r.hidden === true,
    done: Array.isArray(r.done) ? [...new Set(r.done.filter((d) => ids.has(d)))] : [],
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

export const isComplete = (data) => data.done.length >= STEPS.length;

// A first sight with nothing stored: a brand-new town gets the welcome, a town that is already being played does not.
export function isVeteran(nowDone) { return Object.values(nowDone).some(Boolean); }

export const countLine = (data) => data.done.length + ' of ' + STEPS.length;
