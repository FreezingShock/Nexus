// Keeps floating map labels off the interface. Pure geometry: rectangles in, a yes or no out, so tests can run in node.
// A rectangle is { left, top, right, bottom } in screen pixels, the same shape getBoundingClientRect returns.

// Do two rectangles overlap, with a small margin around the label so it never touches an edge?
export function overlaps(a, b, pad = 4) {
  return a.left < b.right + pad && a.right + pad > b.left && a.top < b.bottom + pad && a.bottom + pad > b.top;
}

// True when a label rectangle sits on any obstacle rectangle.
export function isBlocked(label, obstacles, pad = 4) {
  for (const o of obstacles) if (overlaps(label, o, pad)) return true;
  return false;
}

// The selectors of interface that a map label must never cover: the top HUD, the left column, the open cards and
// flyouts, the toolbar, the offline envelope and postcard, the notes, tips and the labels of other tools.
export const OBSTACLES = [
  '.top > *', '.leftcol > *', '#inspect', '#settings', '#fly', '#tools', '#demandw',
  '.envelope', '.postcard', '.openbtn', '.notes', '.tipbubble', '.tipnote', '.shortcuts',
  '.gfx-stats', '#placelabel', '#roadlabel', '.ztag',
];
