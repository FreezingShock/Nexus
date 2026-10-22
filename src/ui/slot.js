// The top-right slot: the menu, Settings, Milestones, the Inspect and upgrade card and the Happiness panel all drop
// down or sit in the same corner, so only one is open at a time. A surface registers how to tell it is open and how to
// close it, and calls claim(id) just before it opens; claim closes whatever else is open. No DOM here, so tests run in node.
//
// Hand-off: when claim closed something, the incoming surface gets the class `mo-late` for a moment. motion.css delays
// its fade-in a beat, so the old one is mostly gone before the new one shows and the two never sit on each other.

export function createSlot({ setTimer = setTimeout } = {}) {
  const surfaces = new Map();
  return {
    // id: a name; isOpen(): true while shown; close(): closes it the way the surface normally closes; el: its element (optional)
    register(id, surface) { surfaces.set(id, surface); },
    // Closes every other open surface. Returns true when something was closed.
    claim(id) {
      let closed = false;
      for (const [k, s] of surfaces) {
        if (k !== id && s.isOpen()) { s.close(); closed = true; }
      }
      const el = surfaces.get(id)?.el;
      if (closed && el && el.classList) {
        el.classList.add('mo-late');
        setTimer(() => el.classList.remove('mo-late'), 600);
      }
      return closed;
    },
    open() { return [...surfaces].filter(([, s]) => s.isOpen()).map(([k]) => k); },
  };
}

export const topRight = createSlot();
