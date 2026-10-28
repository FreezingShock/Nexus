// What each toolbar tile says about the things behind it that are still locked. Pure: state in, small records out, so
// the numbers can be tested in node. Only tools that gate items behind Parts have anything to say (roads, decor).
import { ROAD_TYPES } from '../sim/catalog.js';
import { DECOR, isOpen, offSale } from '../world/decor.js';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// For one tool: { locked: how many items are shut, ready: true when the Parts in hand open at least one,
// tip: the hover line (the next unlock and its price), or '' when nothing is locked }.
export function lockHint(tool, state) {
  let shut = [];
  if (tool === 'roads') shut = ROAD_TYPES.filter((r) => r.unlockParts && !(state.roadUnlocks || []).includes(r.id)).map((r) => ({ name: r.short, parts: r.unlockParts }));
  else if (tool === 'decor') shut = DECOR.filter((d) => !isOpen(d, state.decorUnlocks || []) && !offSale(d, state)).map((d) => ({ name: d.name, parts: d.parts }));
  if (!shut.length) return { locked: 0, ready: false, tip: '' };
  const next = shut.reduce((a, b) => (b.parts < a.parts ? b : a));
  const ready = (state.parts || 0) >= next.parts;
  const tip = ready ? `${next.name} can open now for ${next.parts} Parts` : `${plural(shut.length, 'item')} still locked · ${next.name} opens for ${next.parts} Parts`;
  return { locked: shut.length, ready, tip };
}
