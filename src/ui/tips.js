// First-time tips. One at a time, in order. Each step looks at the player's own counters, so a town that
// already has roads or buildings skips the steps it has done. Seen tips are kept in this browser only.
export const TIP_STEPS = [
  { id: 'road', text: 'Start with a street. Press R, then drag across the grass to lay a road.',
    praise: 'A street at last. Visitors can find you now.', done: (st) => st.roadTiles > 0 },
  { id: 'zone', text: 'Press Z and paint a few tiles. Homes and shops grow there on their own once a road is close.',
    praise: 'Paint is down. Give it a little time.', done: (st) => st.painted > 0 },
  { id: 'build', text: 'Press B and click a plot to place your first building. Each one makes the next a little dearer.',
    praise: 'Your first building. Look at it go.', done: (st) => st.placed > 0 },
  { id: 'inspect', text: 'Click any building to see its level. Upgrading it adds income.',
    praise: 'A little more every second, from that one.', done: (st) => st.upgrades > 0 },
  { id: 'away', text: 'The town keeps earning while the tab is closed. Come back for a postcard.',
    praise: '', done: () => false },
];

export const TIPS_KEY = 'nexus.tips.v1';

// The first step that is neither seen nor already done, or null when the tips are finished.
export function activeTip(stats, seen) {
  return TIP_STEPS.find((s) => !seen.includes(s.id) && !s.done(stats)) || null;
}

// Storage is optional: a private window or blocked storage just means the tips come back next visit.
export function loadSeen(storage) {
  try {
    const v = JSON.parse(storage.getItem(TIPS_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}
export function saveSeen(storage, seen) {
  try { storage.setItem(TIPS_KEY, JSON.stringify(seen)); } catch { /* not saved: fine */ }
}
